import { useEffect, useState } from "react";
import type { Navigation } from "react-router";

import type { HueSegment } from "~/shared/types";

interface UseStreamedSegmentsArgs {
  readonly navigation: Navigation;
  readonly search: string;
}

interface UseStreamedSegmentsResult {
  readonly segments: HueSegment[];
  readonly hasStreamedPartial: boolean;
  readonly isStreaming: boolean;
  readonly error: string | null;
}

export function useStreamedSegments({
  navigation,
  search,
}: UseStreamedSegmentsArgs): UseStreamedSegmentsResult {
  const [segments, setSegments] = useState<HueSegment[]>([]);
  const [hasStreamedPartial, setHasStreamedPartial] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingSearch =
    navigation.state !== "idle" && navigation.location
      ? navigation.location.search
      : null;
  const targetSearch = pendingSearch ?? search ?? "";

  useEffect(() => {
    const controller = new AbortController();
    let isActive = true;

    setSegments([]);
    setHasStreamedPartial(false);
    setError(null);
    setIsStreaming(true);

    const processBuffer = (buffer: string): string => {
      let working = buffer;
      let newlineIndex = working.indexOf("\n");

      while (newlineIndex !== -1) {
        const line = working.slice(0, newlineIndex).trim();
        working = working.slice(newlineIndex + 1);

        if (line && isActive) {
          const payload = JSON.parse(line) as {
            readonly segments?: HueSegment[];
            readonly error?: string;
          };

          if (payload.error) {
            setError(payload.error);
            setSegments([]);
            setHasStreamedPartial(false);
            setIsStreaming(false);
            controller.abort();
            return "";
          }

          if (payload.segments) {
            setSegments(payload.segments);
            setHasStreamedPartial(true);
          }
        }

        newlineIndex = working.indexOf("\n");
      }

      return working;
    };

    async function streamSegments() {
      try {
        const path = `/swatches.stream${targetSearch}`;
        const requestUrl =
          typeof window !== "undefined" && window.location
            ? new URL(path, window.location.origin).toString()
            : new URL(path, "http://localhost").toString();

        const response = await fetch(requestUrl, {
          headers: { Accept: "text/x-ndjson" },
          signal: controller.signal,
        });

        if (!response.ok || !response.body) {
          throw new Error(`Unexpected response: ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) {
            break;
          }

          buffer += decoder.decode(value, { stream: true });
          buffer = processBuffer(buffer);
        }

        buffer += decoder.decode();
        buffer = processBuffer(buffer);

        const remaining = buffer.trim();
        if (remaining && isActive) {
          const payload = JSON.parse(remaining) as {
            readonly segments?: HueSegment[];
            readonly error?: string;
          };

          if (payload.error) {
            setError(payload.error);
            setSegments([]);
            setHasStreamedPartial(false);
            setIsStreaming(false);
          } else if (payload.segments) {
            setSegments(payload.segments);
            setHasStreamedPartial(true);
          }
        }

        if (isActive) {
          setIsStreaming(false);
        }
      } catch (streamError) {
        if (!controller.signal.aborted && isActive) {
          console.error("Failed to stream swatches", streamError);
          setError(streamError instanceof Error ? streamError.message : "Failed to load colors.");
          setSegments([]);
          setHasStreamedPartial(false);
          setIsStreaming(false);
        }
      }
    }

    streamSegments();

    return () => {
      isActive = false;
      controller.abort();
    };
  }, [targetSearch]);

  return { segments, hasStreamedPartial, isStreaming, error };
}
