import { useEffect, useMemo, useState } from "react";
import { useLoaderData, useNavigation } from "react-router";

import type { Route } from "./+types/_index";

import { collectStreamedSegments } from "~/api/segmentHueSpace.server";
import { readPercentageParam } from "~/shared/color-utils";
import { DEFAULT_LIGHTNESS, DEFAULT_SATURATION } from "~/shared/defaults";
import { SwatchControls } from "~/components/SwatchControls";
import { SwatchesSection } from "~/components/SwatchesSection";
import { useStreamedSegments } from "~/hooks/useStreamedSegments";
import { sortSwatchesByHue } from "~/utils/sortSwatches";

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const saturation = readPercentageParam(url, "s", DEFAULT_SATURATION);
  const lightness = readPercentageParam(url, "l", DEFAULT_LIGHTNESS);

  try {
    const segments = await collectStreamedSegments({ saturation, lightness });
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
  const {
    segments: streamedSegments,
    hasStreamedPartial,
  } = useStreamedSegments({ navigation, initialSegments: segments });
  const hasPendingChanges = sValue !== saturation || lValue !== lightness;

  useEffect(() => {
    setSValue(saturation);
  }, [saturation]);

  useEffect(() => {
    setLValue(lightness);
  }, [lightness]);

  const swatches = useMemo(() => sortSwatchesByHue(streamedSegments), [streamedSegments]);

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
        isDirty={hasPendingChanges}
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
