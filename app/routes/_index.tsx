import { useEffect, useMemo, useState } from "react";
import { useLoaderData, useNavigation } from "react-router";

import type { Route } from "./+types/_index";

import type { HueSegment } from "~/lib/types.server";
import { normalizeHue, readPercentageParam } from "~/lib/color-utils";
import { SwatchControls } from "~/components/SwatchControls";
import { SwatchesSection } from "~/components/SwatchesSection";

const DEFAULT_SATURATION = 60;
const DEFAULT_LIGHTNESS = 50;

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const saturation = readPercentageParam(url, "s", DEFAULT_SATURATION);
  const lightness = readPercentageParam(url, "l", DEFAULT_LIGHTNESS);

  const streamParams = new URLSearchParams({
    s: saturation.toString(),
    l: lightness.toString(),
  });

  return {
    saturation,
    lightness,
    streamPath: `/api/segments?${streamParams.toString()}`,
  };
}

type LoaderData = Awaited<ReturnType<typeof loader>>;

export default function Index() {
  const { saturation, lightness, streamPath } = useLoaderData<LoaderData>();
  const [segments, setSegments] = useState<HueSegment[]>([]);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [isStreaming, setIsStreaming] = useState(false);
  const [sValue, setSValue] = useState(saturation);
  const [lValue, setLValue] = useState(lightness);
  const navigation = useNavigation();
  const isUpdatingSwatches = navigation.state !== "idle";

  useEffect(() => {
    setSegments([]);
    setStreamError(null);

    if (typeof EventSource === "undefined") {
      return;
    }

    let isActive = true;
    const eventSource = new EventSource(streamPath);
    setIsStreaming(true);

    const handleSegments = (event: MessageEvent<string>) => {
      if (!isActive) {
        return;
      }

      try {
        const payload = JSON.parse(event.data) as { segments: HueSegment[] };
        setSegments(payload.segments);
      } catch (error) {
        console.error("Failed to parse segment payload", error);
        setStreamError("Received malformed color data.");
        eventSource.close();
        setIsStreaming(false);
      }
    };

    const handleComplete = () => {
      if (!isActive) {
        return;
      }
      setIsStreaming(false);
      eventSource.close();
    };

    const handleError = () => {
      if (!isActive) {
        return;
      }
      setStreamError("Lost connection to the color stream.");
      setIsStreaming(false);
      eventSource.close();
    };

    const segmentsListener = (event: Event) =>
      handleSegments(event as MessageEvent<string>);
    const completeListener = () => handleComplete();

    eventSource.addEventListener("segments", segmentsListener);
    eventSource.addEventListener("complete", completeListener);
    eventSource.onerror = handleError;

    return () => {
      isActive = false;
      eventSource.removeEventListener("segments", segmentsListener);
      eventSource.removeEventListener("complete", completeListener);
      eventSource.close();
    };
  }, [streamPath]);

  useEffect(() => {
    setSValue(saturation);
  }, [saturation]);

  useEffect(() => {
    setLValue(lightness);
  }, [lightness]);

  const swatches = useMemo(() => {
    const seen = new Map<string, HueSegment>();

    for (const segment of segments) {
      if (!seen.has(segment.color.name)) {
        seen.set(segment.color.name, segment);
      }
    }

    return Array.from(seen.values()).sort((left, right) => {
      const leftHue = normalizeHue(left.startHue);
      const rightHue = normalizeHue(right.startHue);
      return leftHue - rightHue;
    });
  }, [segments]);

  const isLoading = isUpdatingSwatches || isStreaming;

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
        isUpdating={isLoading}
      />

      <SwatchesSection
        swatches={swatches}
        error={streamError}
        isUpdating={isLoading}
      />
    </main>
  );
}
