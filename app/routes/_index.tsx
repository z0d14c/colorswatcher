import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigation } from "react-router";
import { readPercentageParam } from "~/shared/color-utils";
import { DEFAULT_LIGHTNESS, DEFAULT_SATURATION } from "~/shared/defaults";
import { SwatchControls } from "~/components/SwatchControls";
import { SwatchesSection } from "~/components/SwatchesSection";
import { useStreamedSegments } from "~/hooks/useStreamedSegments";
import { sortSwatchesByHue } from "~/utils/sortSwatches";

export default function Index() {
  const location = useLocation();
  const navigation = useNavigation();

  const { saturation, lightness } = useMemo(() => {
    const url = new URL(
      `${location.pathname}${location.search}`,
      "https://colorswatcher.local",
    );

    return {
      saturation: readPercentageParam(url, "s", DEFAULT_SATURATION),
      lightness: readPercentageParam(url, "l", DEFAULT_LIGHTNESS),
    };
  }, [location.pathname, location.search]);
  const [sValue, setSValue] = useState(saturation);
  const [lValue, setLValue] = useState(lightness);
  const {
    segments: streamedSegments,
    hasStreamedPartial,
    isStreaming,
    error,
  } = useStreamedSegments({ navigation, search: location.search });
  const isPendingNavigation = navigation.state !== "idle";
  const isUpdatingSwatches = isPendingNavigation || isStreaming;
  const hasPendingChanges = sValue !== saturation || lValue !== lightness;

  useEffect(() => {
    setSValue(saturation);
  }, [saturation]);

  useEffect(() => {
    setLValue(lightness);
  }, [lightness]);

  const swatches = useMemo(() => sortSwatchesByHue(streamedSegments), [streamedSegments]);

  const shouldBlockSwatches = isStreaming && !hasStreamedPartial;

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
