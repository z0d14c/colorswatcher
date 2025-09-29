import { getColorByHsl, type ColorDescriptor } from "./colorApi.server";

export interface HueSegment {
  readonly startHue: number;
  readonly endHue: number;
  readonly color: ColorDescriptor;
}

export interface SegmentHueSpaceOptions {
  readonly saturation: number;
  readonly lightness: number;
  readonly sample?: (hue: number) => Promise<ColorDescriptor>;
}

// Minimum width we will subdivide; narrower bands would be visually indistinguishable.
const MIN_SPAN = 0.5;
// Heuristic cap for considering a range "uniform" before forcing more samples.
const MAX_UNIFORM_SPAN = 6;

// Cache keyed by the saturation/lightness tuple to avoid redundant segmentation.
// Development rebuilds re-evaluate this module on every request, so the map clears
// between refreshes; the production build runs inside a long-lived worker where the
// memo persists and identical S/L pairs reuse the in-flight promise.
const memo = new Map<string, Promise<HueSegment[]>>();

// Collapse arbitrary hue input to a canonical form so cache keys remain stable.
const normalizeHue = (hue: number): number => {
  const wrapped = hue % 360;
  if (Number.isNaN(wrapped)) {
    return 0;
  }

  return wrapped < 0 ? wrapped + 360 : wrapped;
};

// Deduplicates sampler requests while preserving the asynchronous contract.
class AdaptiveSampler {
  private readonly fetcher: (hue: number) => Promise<ColorDescriptor>;
  private readonly promises = new Map<number, Promise<ColorDescriptor>>();
  private readonly values = new Map<number, ColorDescriptor>();

  constructor(fetcher: (hue: number) => Promise<ColorDescriptor>) {
    this.fetcher = fetcher;
  }

  private keyFor(hue: number): number {
    const normalized = normalizeHue(hue);
    return Number(normalized.toFixed(6));
  }

  async get(hue: number): Promise<ColorDescriptor> {
    const key = this.keyFor(hue);
    const existing = this.promises.get(key);
    if (existing) {
      return existing;
    }

    const promise = this.fetcher(normalizeHue(hue)).then((value) => {
      this.values.set(key, value);
      return value;
    });

    this.promises.set(key, promise);

    try {
      return await promise;
    } catch (error) {
      this.promises.delete(key);
      throw error;
    }
  }

  getCached(hue: number): ColorDescriptor | undefined {
    return this.values.get(this.keyFor(hue));
  }

  getKnownHues(): number[] {
    return Array.from(this.values.keys()).sort((a, b) => a - b);
  }
}

// Kick off adaptive sampling and turn the sampled hues into merged segments.
async function createSegments(
  sampler: AdaptiveSampler,
  saturation: number,
  lightness: number,
): Promise<HueSegment[]> {
  if (saturation === 0 || lightness === 0 || lightness === 100) {
    const color = await sampler.get(0);
    return [
      {
        startHue: 0,
        endHue: 360,
        color,
      },
    ];
  }

  await sampler.get(0);

  await subdivideRange({ sampler, startHue: 0, endHue: 360 });

  const knownHues = sampler.getKnownHues();
  if (knownHues.length === 0) {
    return [];
  }

  const sorted = Array.from(new Set<number>([...knownHues, 0]))
    .filter((hue) => hue >= 0 && hue < 360)
    .sort((a, b) => a - b);

  const segments: HueSegment[] = [];

  for (let index = 0; index < sorted.length; index += 1) {
    const startHue = sorted[index];
    const endHue = index + 1 < sorted.length ? sorted[index + 1] : 360;
    const color = sampler.getCached(startHue);

    if (!color) {
      continue;
    }

    segments.push({ startHue, endHue, color });
  }

  const merged = mergeSegments(segments);

  return merged;
}

interface SubdivideInput {
  readonly sampler: AdaptiveSampler;
  readonly startHue: number;
  readonly endHue: number;
}

// Recursively sample until a span is either uniform or too small to matter.
async function subdivideRange({
  sampler,
  startHue,
  endHue,
}: SubdivideInput): Promise<void> {
  const span = endHue - startHue;
  if (span <= MIN_SPAN) {
    return;
  }

  const startColor = await sampler.get(startHue);
  const endColor = endHue === 360 ? startColor : await sampler.get(endHue);

  if (span > MAX_UNIFORM_SPAN) {
    const midpoint = startHue + span / 2;
    await sampler.get(midpoint % 360);
    await subdivideRange({ sampler, startHue, endHue: midpoint });
    await subdivideRange({ sampler, startHue: midpoint, endHue });
    return;
  }

  const midpoint = startHue + span / 2;
  const middleColor = await sampler.get(midpoint % 360);

  const namesMatch =
    startColor.name === middleColor.name &&
    middleColor.name === endColor.name;

  if (namesMatch) {
    return;
  }

  await subdivideRange({ sampler, startHue, endHue: midpoint });
  await subdivideRange({ sampler, startHue: midpoint, endHue });
}

// Combine adjacent segments that map to the same color name, handling wrap-around.
const mergeSegments = (segments: HueSegment[]): HueSegment[] => {
  if (segments.length === 0) {
    return [];
  }

  const ordered = segments
    .slice()
    .sort((left, right) => left.startHue - right.startHue);

  const merged: HueSegment[] = [ordered[0]];

  for (let index = 1; index < ordered.length; index += 1) {
    const segment = ordered[index];
    const previous = merged[merged.length - 1];

    if (segment.color.name === previous.color.name) {
      merged[merged.length - 1] = {
        ...previous,
        endHue: segment.endHue,
      };
    } else {
      merged.push(segment);
    }
  }

  if (merged.length > 1) {
    const first = merged[0];
    const last = merged[merged.length - 1];

    if (first.color.name === last.color.name) {
      merged[0] = {
        ...first,
        startHue: last.startHue,
        endHue: first.endHue + 360,
      };
      merged.pop();
    }
  }

  return merged;
};

export async function segmentHueSpace({
  saturation,
  lightness,
  sample,
}: SegmentHueSpaceOptions): Promise<HueSegment[]> {
  const sampler = new AdaptiveSampler(
    sample ?? ((hue) => getColorByHsl({ hue, saturation, lightness })),
  );

  const buildSegments = () => createSegments(sampler, saturation, lightness);

  if (sample) {
    return buildSegments();
  }

  const key = `${saturation}:${lightness}`;
  const cached = memo.get(key);
  if (cached) {
    return cached;
  }

  const promise = buildSegments();
  memo.set(key, promise);

  try {
    return await promise;
  } catch (error) {
    memo.delete(key);
    throw error;
  }
}

export function clearSegmentCache(): void {
  memo.clear();
}
