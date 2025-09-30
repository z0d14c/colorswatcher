import { AdaptiveSampler } from "./adaptiveSampler.server";
import { getColorByHsl } from "./colorApi.server";
import type { HueSegment, SegmentHueSpaceOptions } from "./types.server";

// Minimum width we will subdivide; narrower bands would be visually indistinguishable.
const MIN_SPAN = 1;

// Cache keyed by the saturation/lightness tuple to avoid redundant segmentation.
// Development rebuilds re-evaluate this module on every request, so the map clears
// between refreshes; the production build runs inside a long-lived worker where the
// memo persists and identical S/L pairs reuse the in-flight promise.
const memo = new Map<string, Promise<HueSegment[]>>();

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

  const sorted = Array.from(new Set<number>([...knownHues]))
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

// Recursively sample until a span is either uniform (begin, middle, end are the same) 
// or we reach the base case of MIN_SPAN
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
  const endColor = await sampler.get(endHue);

  const midpoint = Math.ceil(startHue + span / 2);
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
  sample, // primarily for the purpose of testing (skipping the dependency on the color api)
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
