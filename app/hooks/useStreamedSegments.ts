import { useEffect, useState } from "react";
import type { Navigation } from "react-router";

import type { HueSegment } from "~/shared/types";

interface UseStreamedSegmentsArgs {
  readonly navigation: Navigation;
  readonly initialSegments: HueSegment[];
}

interface UseStreamedSegmentsResult {
  readonly segments: HueSegment[];
  readonly hasStreamedPartial: boolean;
}

export function useStreamedSegments({
  navigation,
  initialSegments,
}: UseStreamedSegmentsArgs): UseStreamedSegmentsResult {
  const [segments, setSegments] = useState(initialSegments);
  const [hasStreamedPartial, setHasStreamedPartial] = useState(false);

  useEffect(() => {
    setSegments(initialSegments);
    setHasStreamedPartial(false);
  }, [initialSegments]);

  useEffect(() => {
    if (navigation.state === "idle" || !navigation.location) {
      return;
    }

    setHasStreamedPartial(false);

    const controller = new AbortController();
    const { search } = navigation.location;

    async function streamSegments() {
      try {
        const response = await fetch(`/swatches.stream${search}`, {
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

          let newlineIndex = buffer.indexOf("\n");
          while (newlineIndex !== -1) {
            const line = buffer.slice(0, newlineIndex).trim();
            buffer = buffer.slice(newlineIndex + 1);

            if (line) {
              const payload = JSON.parse(line) as { segments: HueSegment[] };
              setSegments(payload.segments);
              setHasStreamedPartial(true);
            }

            newlineIndex = buffer.indexOf("\n");
          }
        }

        buffer += decoder.decode();

        let newlineIndex = buffer.indexOf("\n");
        while (newlineIndex !== -1) {
          const line = buffer.slice(0, newlineIndex).trim();
          buffer = buffer.slice(newlineIndex + 1);

          if (line) {
            const payload = JSON.parse(line) as { segments: HueSegment[] };
            setSegments(payload.segments);
            setHasStreamedPartial(true);
          }

          newlineIndex = buffer.indexOf("\n");
        }

        const remaining = buffer.trim();
        if (remaining) {
          const payload = JSON.parse(remaining) as { segments: HueSegment[] };
          setSegments(payload.segments);
          setHasStreamedPartial(true);
        }
      } catch (streamError) {
        if (!controller.signal.aborted) {
          console.error("Failed to stream swatches", streamError);
        }
      }
    }

    streamSegments();

    return () => {
      controller.abort();
    };
  }, [navigation.state, navigation.location]);

  return { segments, hasStreamedPartial };
}
