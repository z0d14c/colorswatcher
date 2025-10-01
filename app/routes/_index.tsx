import { useEffect, useMemo, useState } from "react";
import { useLoaderData, useNavigation } from "react-router";

import type { Route } from "./+types/_index";

import { segmentHueSpace } from "~/lib/segmentHueSpace.server";
import type { HueSegment } from "~/lib/types.server";
import { normalizeHue, readPercentageParam } from "~/lib/color-utils";
import { DEFAULT_LIGHTNESS, DEFAULT_SATURATION } from "~/lib/defaults";
import { SwatchControls } from "~/components/SwatchControls";
import { SwatchesSection } from "~/components/SwatchesSection";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const saturation = readPercentageParam(url, "s", DEFAULT_SATURATION);
  const lightness = readPercentageParam(url, "l", DEFAULT_LIGHTNESS);

  try {
    const segments = await segmentHueSpace({ saturation, lightness });
    return { segments, saturation, lightness, error: null as string | null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load colors.";
    return { segments: [], saturation, lightness, error: message };
  }
}

type LoaderData = Awaited<ReturnType<typeof loader>>;

export default function Index() {
  const { segments, saturation, lightness, error } = useLoaderData<LoaderData>();
  const [sValue, setSValue] = useState(saturation);
  const [lValue, setLValue] = useState(lightness);
  const navigation = useNavigation();
  const isUpdatingSwatches = navigation.state !== "idle";
  const [streamedSegments, setStreamedSegments] = useState(segments);
  const [hasStreamedPartial, setHasStreamedPartial] = useState(false);

  useEffect(() => {
    setSValue(saturation);
  }, [saturation]);

  useEffect(() => {
    setLValue(lightness);
  }, [lightness]);

  useEffect(() => {
    setStreamedSegments(segments);
    setHasStreamedPartial(false);
  }, [segments]);

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
              setStreamedSegments(payload.segments);
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
            setStreamedSegments(payload.segments);
            setHasStreamedPartial(true);
          }

          newlineIndex = buffer.indexOf("\n");
        }

        const remaining = buffer.trim();
        if (remaining) {
          const payload = JSON.parse(remaining) as { segments: HueSegment[] };
          setStreamedSegments(payload.segments);
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

  const swatches = useMemo(() => {
    const seen = new Map<string, HueSegment>();

    for (const segment of streamedSegments) {
      if (!seen.has(segment.color.name)) {
        seen.set(segment.color.name, segment);
      }
    }

    return Array.from(seen.values()).sort((left, right) => {
      const leftHue = normalizeHue(left.startHue);
      const rightHue = normalizeHue(right.startHue);
      return leftHue - rightHue;
    });
  }, [streamedSegments]);

  const shouldBlockSwatches = isUpdatingSwatches && !hasStreamedPartial;

  return (
    <main className="mx-auto w-full max-w-screen-2xl px-4 py-12 sm:px-6 lg:px-10">
      <header className="mb-10 flex flex-col gap-2">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-100 sm:text-4xl">
          Color Swatcher
        </h1>
        <p className="max-w-3xl text-sm text-slate-300 sm:text-base">
          Explore how hue affects perceived color names using fixed saturation and
          lightness values. Adjust the sliders to tune saturation (S) and
          lightness (L), then review the unique swatches discovered from The
          Color API.
        </p>
      </header>

      <SwatchControls
        saturation={saturation}
        lightness={lightness}
        saturationValue={sValue}
        lightnessValue={lValue}
        onSaturationChange={setSValue}
        onLightnessChange={setLValue}
        defaultSaturation={DEFAULT_SATURATION}
        defaultLightness={DEFAULT_LIGHTNESS}
        isUpdating={isUpdatingSwatches}
      />

      <SwatchesSection
        swatches={swatches}
        error={error}
        isUpdating={isUpdatingSwatches}
        showOverlay={shouldBlockSwatches}
      />
    </main>
  );
}
