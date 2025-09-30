import { Form, useLoaderData, useNavigation } from "react-router";
import { useEffect, useMemo, useState } from "react";

import type { Route } from "./+types/_index";

import type { HueSegment } from "~/lib/segmentHueSpace.server";
import { segmentHueSpace } from "~/lib/segmentHueSpace.server";

const DEFAULT_SATURATION = 60;
const DEFAULT_LIGHTNESS = 50;

const clampPercentage = (value: number, fallback: number): number => {
  if (Number.isNaN(value)) {
    return fallback;
  }

  if (value < 0) {
    return 0;
  }

  if (value > 100) {
    return 100;
  }

  return value;
};

const readPercentageParam = (
  url: URL,
  key: string,
  fallback: number,
): number => {
  const values = url.searchParams.getAll(key);
  const raw = values.at(-1);
  const numeric = raw === null ? Number.NaN : Number(raw);
  return clampPercentage(Number.isFinite(numeric) ? numeric : Number.NaN, fallback);
};

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

const normalizeHue = (hue: number): number => {
  const wrapped = hue % 360;
  return wrapped < 0 ? wrapped + 360 : wrapped;
};

const luminanceTextClass = ({
  r,
  g,
  b,
}: {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}): string => {
  const toLinear = (value: number): number => {
    const channel = value / 255;
    return channel <= 0.03928
      ? channel / 12.92
      : Math.pow((channel + 0.055) / 1.055, 2.4);
  };

  const luminance =
    0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);

  return luminance > 0.55 ? "text-slate-900" : "text-slate-50";
};

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

      <Form method="get" className="grid gap-8 rounded-xl border border-white/10 bg-slate-900/40 p-6 shadow-xl backdrop-blur">
        <div className="grid gap-6 sm:grid-cols-2">
          <fieldset className="space-y-4">
            <legend className="text-sm font-medium text-slate-200">Saturation</legend>
            <label className="flex flex-col gap-3" htmlFor="s-range">
              <span className="text-xs uppercase tracking-wide text-slate-400">
                S (% of chroma)
              </span>
              <input
                id="s-range"
                name="s"
                type="range"
                min={0}
                max={100}
                step={1}
                value={sValue}
                onChange={(event) => setSValue(Number(event.currentTarget.value))}
                className="accent-slate-200"
              />
              <input
                aria-label="Saturation percentage"
                name="s"
                type="number"
                min={0}
                max={100}
                step={1}
                value={sValue}
                onChange={(event) => {
                  const next = clampPercentage(
                    Number(event.currentTarget.value),
                    DEFAULT_SATURATION,
                  );
                  setSValue(next);
                }}
                className="w-24 rounded-md border border-white/10 bg-slate-950/60 px-3 py-2 text-sm font-medium text-slate-100 shadow-inner focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400/40"
              />
            </label>
          </fieldset>

          <fieldset className="space-y-4">
            <legend className="text-sm font-medium text-slate-200">Lightness</legend>
            <label className="flex flex-col gap-3" htmlFor="l-range">
              <span className="text-xs uppercase tracking-wide text-slate-400">
                L (% of brightness)
              </span>
              <input
                id="l-range"
                name="l"
                type="range"
                min={0}
                max={100}
                step={1}
                value={lValue}
                onChange={(event) => setLValue(Number(event.currentTarget.value))}
                className="accent-slate-200"
              />
              <input
                aria-label="Lightness percentage"
                name="l"
                type="number"
                min={0}
                max={100}
                step={1}
                value={lValue}
                onChange={(event) => {
                  const next = clampPercentage(
                    Number(event.currentTarget.value),
                    DEFAULT_LIGHTNESS,
                  );
                  setLValue(next);
                }}
                className="w-24 rounded-md border border-white/10 bg-slate-950/60 px-3 py-2 text-sm font-medium text-slate-100 shadow-inner focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400/40"
              />
            </label>
          </fieldset>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <span className="text-sm text-slate-400">
            Showing swatches at S = {saturation}% and L = {lightness}%.
          </span>
          <button
            type="submit"
            disabled={isUpdatingSwatches}
            className="flex items-center gap-2 rounded-md bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-900 shadow transition-colors hover:bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isUpdatingSwatches && (
              <svg
                className="h-4 w-4 animate-spin text-slate-900"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle
                  className="opacity-20"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                  fill="none"
                />
                <path
                  className="opacity-90"
                  fill="currentColor"
                  d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"
                />
              </svg>
            )}
            {isUpdatingSwatches ? "Loading" : "Update swatches"}
          </button>
        </div>
      </Form>

      <section className="mt-12">
        <h2 className="text-xl font-semibold text-slate-100">Distinct names</h2>
        {error ? (
          <p className="mt-2 rounded-lg border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            Unable to retrieve color names right now: {error}
          </p>
        ) : (
          <p className="mt-2 text-sm text-slate-400">
            {swatches.length === 1
              ? "One unique color name was found for this S/L combination."
              : `${swatches.length} unique color names were found for this S/L combination.`}
          </p>
        )}

        <div
          className="relative mt-6"
          aria-live="polite"
          aria-busy={isUpdatingSwatches}
        >
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
            {swatches.map((segment) => {
              const {
                color: { name, rgb, hsl },
              } = segment;
              const textClass = luminanceTextClass(rgb);

              return (
                <article
                  key={name}
                  className="overflow-hidden rounded-xl border border-white/10 shadow-lg"
                >
                  <div
                    className={`p-6 transition-colors duration-300 ${textClass}`}
                    style={{ backgroundColor: rgb.value }}
                  >
                    <h3 className="text-lg font-semibold">{name}</h3>
                    <dl className="mt-4 space-y-2 text-sm">
                      <div className="flex justify-between gap-4">
                        <dt className="font-medium uppercase tracking-wide opacity-80">
                          RGB
                        </dt>
                        <dd className="font-mono">{rgb.value}</dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="font-medium uppercase tracking-wide opacity-80">
                          HSL
                        </dt>
                        <dd className="font-mono">{hsl.value}</dd>
                      </div>
                    </dl>
                  </div>
                </article>
              );
            })}
          </div>
          {isUpdatingSwatches && (
            <div className="absolute inset-0 flex items-center justify-center rounded-xl border border-white/5 bg-slate-950/60 backdrop-blur-sm">
              <div className="flex items-center gap-3 text-sm font-medium text-slate-200">
                <svg
                  className="h-5 w-5 animate-spin text-slate-200"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-90"
                    fill="currentColor"
                    d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z"
                  />
                </svg>
                Updating swatches…
              </div>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}
