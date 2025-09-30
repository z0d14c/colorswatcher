import type { HueSegment } from "~/lib/types.server";
import { luminanceTextClass } from "~/lib/color-utils";

interface SwatchCardProps {
  readonly segment: HueSegment;
}

export function SwatchCard({ segment }: SwatchCardProps) {
  const {
    color: { name, rgb, hsl },
  } = segment;
  const textClass = luminanceTextClass(rgb);

  return (
    <article className="overflow-hidden rounded-xl border border-white/10 shadow-lg">
      <div
        className={`p-6 transition-colors duration-300 ${textClass}`}
        style={{ backgroundColor: rgb.value }}
      >
        <h3 className="text-lg font-semibold">{name}</h3>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="font-medium uppercase tracking-wide opacity-80">RGB</dt>
            <dd className="font-mono">{rgb.value}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="font-medium uppercase tracking-wide opacity-80">HSL</dt>
            <dd className="font-mono">{hsl.value}</dd>
          </div>
        </dl>
      </div>
    </article>
  );
}
