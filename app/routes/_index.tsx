import { useEffect, useMemo, useState } from "react";
import { useLoaderData, useNavigation } from "react-router";

import type { Route } from "./+types/_index";

import { segmentHueSpace } from "~/lib/segmentHueSpace.server";
import { getColorByHsl } from "~/lib/colorApi.server";
import { getColorFromDatabase, isDatabaseAvailable } from "~/lib/colorDatabase.server";
import type { ColorSource, HueSegment } from "~/lib/types.server";
import { normalizeHue, readPercentageParam } from "~/lib/color-utils";
import { SwatchControls } from "~/components/SwatchControls";
import { SwatchesSection } from "~/components/SwatchesSection";

const DEFAULT_SATURATION = 60;
const DEFAULT_LIGHTNESS = 50;

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const saturation = readPercentageParam(url, "s", DEFAULT_SATURATION);
  const lightness = readPercentageParam(url, "l", DEFAULT_LIGHTNESS);
  const requestedSourceParam = url.searchParams.getAll("source").at(-1);
  const requestedSource: ColorSource =
    requestedSourceParam === "database" ? "database" : "api";

  const databaseAvailable = isDatabaseAvailable();
  const source: ColorSource =
    requestedSource === "database" && databaseAvailable ? "database" : "api";

  const cacheStats = { hits: 0, misses: 0 };

  const sample =
    source === "database"
      ? async (hue: number) => {
          const cached = getColorFromDatabase({ hue, saturation, lightness });

          if (cached) {
            cacheStats.hits += 1;
            return cached;
          }

          cacheStats.misses += 1;
          return getColorByHsl({ hue, saturation, lightness });
        }
      : undefined;

  try {
    const segments = await segmentHueSpace(
      sample
        ? {
            saturation,
            lightness,
            sample,
          }
        : {
            saturation,
            lightness,
          },
    );

    return {
      segments,
      saturation,
      lightness,
      source,
      requestedSource,
      isDatabaseAvailable: databaseAvailable,
      cacheHits: cacheStats.hits,
      cacheMisses: cacheStats.misses,
      error: null as string | null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load colors.";
    return {
      segments: [],
      saturation,
      lightness,
      source,
      requestedSource,
      isDatabaseAvailable: databaseAvailable,
      cacheHits: cacheStats.hits,
      cacheMisses: cacheStats.misses,
      error: message,
    };
  }
}

type LoaderData = Awaited<ReturnType<typeof loader>>;

export default function Index() {
  const {
    segments,
    saturation,
    lightness,
    error,
    source,
    requestedSource,
    isDatabaseAvailable,
    cacheHits,
    cacheMisses,
  } = useLoaderData<LoaderData>();
  const [sValue, setSValue] = useState(saturation);
  const [lValue, setLValue] = useState(lightness);
  const [sourceValue, setSourceValue] = useState<ColorSource>(requestedSource);
  const navigation = useNavigation();
  const isUpdatingSwatches = navigation.state !== "idle";

  useEffect(() => {
    setSValue(saturation);
  }, [saturation]);

  useEffect(() => {
    setLValue(lightness);
  }, [lightness]);

  useEffect(() => {
    setSourceValue(requestedSource);
  }, [requestedSource]);

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
        source={source}
        requestedSource={requestedSource}
        sourceValue={sourceValue}
        onSourceChange={setSourceValue}
        isDatabaseAvailable={isDatabaseAvailable}
        cacheHits={cacheHits}
        cacheMisses={cacheMisses}
      />

      <SwatchesSection
        swatches={swatches}
        error={error}
        isUpdating={isUpdatingSwatches}
      />
    </main>
  );
}
