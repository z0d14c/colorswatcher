import { useEffect, useMemo, useState } from "react";
import { useLoaderData, useNavigation } from "react-router";

import type { Route } from "./+types/_index";

import { segmentHueSpace } from "~/lib/segmentHueSpace.server";
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
      />
    </main>
  );
}
