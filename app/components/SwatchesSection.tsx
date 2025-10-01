import type { HueSegment } from "~/shared/types";

import { SwatchCard } from "./SwatchCard";

interface SwatchesSectionProps {
  readonly swatches: HueSegment[];
  readonly error: string | null;
  readonly isUpdating: boolean;
  readonly showOverlay: boolean;
}

const swatchCountMessage = (count: number): string => {
  if (count === 1) {
    return "One unique color name was found for this S/L combination.";
  }

  return `${count} unique color names were found for this S/L combination.`;
};

export function SwatchesSection({
  swatches,
  error,
  isUpdating,
  showOverlay,
}: SwatchesSectionProps) {
  return (
    <section className="mt-12">
      <h2 className="text-xl font-semibold text-slate-100">Distinct names</h2>
      {error ? (
        <p className="mt-2 rounded-lg border border-red-400/40 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          Unable to retrieve color names right now: {error}
        </p>
      ) : (
        <p className="mt-2 text-sm text-slate-400">{swatchCountMessage(swatches.length)}</p>
      )}

      <div className="relative mt-6" aria-live="polite" aria-busy={isUpdating}>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
          {swatches.map((segment) => (
            <SwatchCard key={segment.color.name} segment={segment} />
          ))}
        </div>
        {showOverlay && (
          <div className="absolute inset-0 flex items-center justify-center rounded-xl border border-white/5 bg-slate-950/60 backdrop-blur-sm">
            <div className="flex items-center gap-3 text-sm font-medium text-slate-200">
              <svg className="h-5 w-5 animate-spin text-slate-200" viewBox="0 0 24 24" aria-hidden="true">
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
  );
}
