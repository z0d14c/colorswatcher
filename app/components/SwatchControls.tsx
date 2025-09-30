import type { Dispatch, SetStateAction } from "react";
import { Form } from "react-router";

import { clampPercentage } from "~/lib/color-utils";
import type { ColorSource } from "~/lib/types.server";

interface SwatchControlsProps {
  readonly saturation: number;
  readonly lightness: number;
  readonly saturationValue: number;
  readonly lightnessValue: number;
  readonly onSaturationChange: Dispatch<SetStateAction<number>>;
  readonly onLightnessChange: Dispatch<SetStateAction<number>>;
  readonly defaultSaturation: number;
  readonly defaultLightness: number;
  readonly isUpdating: boolean;
  readonly source: ColorSource;
  readonly requestedSource: ColorSource;
  readonly sourceValue: ColorSource;
  readonly onSourceChange: Dispatch<SetStateAction<ColorSource>>;
  readonly isDatabaseAvailable: boolean;
  readonly cacheHits: number;
  readonly cacheMisses: number;
}

export function SwatchControls({
  saturation,
  lightness,
  saturationValue,
  lightnessValue,
  onSaturationChange,
  onLightnessChange,
  defaultSaturation,
  defaultLightness,
  isUpdating,
  source,
  requestedSource,
  sourceValue,
  onSourceChange,
  isDatabaseAvailable,
  cacheHits,
  cacheMisses,
}: SwatchControlsProps) {
  const renderSourceStatus = () => {
    if (sourceValue !== requestedSource) {
      return sourceValue === "database"
        ? "Submit the form to switch to the cached color database."
        : "Submit the form to switch back to the live API.";
    }

    if (source === "database") {
      if (cacheMisses > 0) {
        const plural = cacheMisses === 1 ? "" : "s";
        return `Using cached color database (${cacheHits} hits, ${cacheMisses} fallback${plural} to The Color API).`;
      }

      return `Using cached color database (${cacheHits} hits).`;
    }

    if (!isDatabaseAvailable && requestedSource === "database") {
      return "Color database not found. Falling back to The Color API.";
    }

    return "Fetching colors from The Color API.";
  };

  return (
    <Form method="get" className="grid gap-8 rounded-xl border border-white/10 bg-slate-900/40 p-6 shadow-xl backdrop-blur">
      <div className="grid gap-6 sm:grid-cols-2">
        <fieldset className="space-y-4">
          <legend className="text-sm font-medium text-slate-200">Saturation</legend>
          <label className="flex flex-col gap-3" htmlFor="s-range">
            <span className="text-xs uppercase tracking-wide text-slate-400">S (% of chroma)</span>
            <input
              id="s-range"
              name="s"
              type="range"
              min={0}
              max={100}
              step={1}
              value={saturationValue}
              onChange={(event) => onSaturationChange(Number(event.currentTarget.value))}
              className="accent-slate-200"
            />
            <input
              aria-label="Saturation percentage"
              name="s"
              type="number"
              min={0}
              max={100}
              step={1}
              value={saturationValue}
              onChange={(event) => {
                const next = clampPercentage(Number(event.currentTarget.value), defaultSaturation);
                onSaturationChange(next);
              }}
              className="w-24 rounded-md border border-white/10 bg-slate-950/60 px-3 py-2 text-sm font-medium text-slate-100 shadow-inner focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400/40"
            />
          </label>
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="text-sm font-medium text-slate-200">Lightness</legend>
          <label className="flex flex-col gap-3" htmlFor="l-range">
            <span className="text-xs uppercase tracking-wide text-slate-400">L (% of brightness)</span>
            <input
              id="l-range"
              name="l"
              type="range"
              min={0}
              max={100}
              step={1}
              value={lightnessValue}
              onChange={(event) => onLightnessChange(Number(event.currentTarget.value))}
              className="accent-slate-200"
            />
            <input
              aria-label="Lightness percentage"
              name="l"
              type="number"
              min={0}
              max={100}
              step={1}
              value={lightnessValue}
              onChange={(event) => {
                const next = clampPercentage(Number(event.currentTarget.value), defaultLightness);
                onLightnessChange(next);
              }}
              className="w-24 rounded-md border border-white/10 bg-slate-950/60 px-3 py-2 text-sm font-medium text-slate-100 shadow-inner focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400/40"
            />
          </label>
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="text-sm font-medium text-slate-200">Data source</legend>
          <label className="flex flex-col gap-3" htmlFor="source-select">
            <span className="text-xs uppercase tracking-wide text-slate-400">Color lookup strategy</span>
            <select
              id="source-select"
              name="source"
              value={sourceValue}
              onChange={(event) => onSourceChange(event.currentTarget.value as ColorSource)}
              className="w-full rounded-md border border-white/10 bg-slate-950/60 px-3 py-2 text-sm font-medium text-slate-100 shadow-inner focus:border-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400/40"
            >
              <option value="api">The Color API (live)</option>
              <option value="database">Cached SQLite database</option>
            </select>
          </label>
          <p className="text-xs text-slate-400">{renderSourceStatus()}</p>
        </fieldset>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <span className="text-sm text-slate-400">
          Showing swatches at S = {saturation}% and L = {lightness}%.
        </span>
        <button
          type="submit"
          disabled={isUpdating}
          className="flex items-center gap-2 rounded-md bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-900 shadow transition-colors hover:bg-white focus:outline-none focus:ring-2 focus:ring-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isUpdating && (
            <svg className="h-4 w-4 animate-spin text-slate-900" viewBox="0 0 24 24" aria-hidden="true">
              <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 0 1 8-8v4a4 4 0 0 0-4 4H4z" />
            </svg>
          )}
          {isUpdating ? "Loading" : "Update swatches"}
        </button>
      </div>
    </Form>
  );
}
