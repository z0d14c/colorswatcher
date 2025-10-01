import { AdaptiveSampler } from "./adaptiveSampler.server";
import { getColorByHsl } from "./colorApi.server";
import type { HueSegment, SegmentHueSpaceOptions } from "./types.server";
import { normalizeHue } from "./utils.server";

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
    await sampler.get(0);
    return buildSegmentsFromSampler(sampler);
  }

  await sampler.get(0);

  await subdivideRange({ sampler, startHue: 0, endHue: 360 });

  return buildSegmentsFromSampler(sampler);
}

function buildSegmentsFromSampler(sampler: AdaptiveSampler): HueSegment[] {
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

  return mergeSegments(segments);
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

const encoder = new TextEncoder();

function emitSegments(
  sampler: AdaptiveSampler,
  controller: ReadableStreamDefaultController<Uint8Array>,
  lastPayloadRef: { current: string | null },
): void {
  const segments = buildSegmentsFromSampler(sampler);
  const payload = JSON.stringify({ segments });

  if (payload === lastPayloadRef.current) {
    return;
  }

  lastPayloadRef.current = payload;
  controller.enqueue(encoder.encode(`event: segments\ndata: ${payload}\n\n`));
}

async function streamRange(
  sampler: AdaptiveSampler,
  controller: ReadableStreamDefaultController<Uint8Array>,
  saturation: number,
  lightness: number,
): Promise<void> {
  const lastPayload = { current: null as string | null };

  const sampleHue = async (hue: number) => {
    const normalized = normalizeHue(hue);
    const cached = sampler.getCached(normalized);
    if (cached) {
      return cached;
    }

    const color = await sampler.get(normalized);
    emitSegments(sampler, controller, lastPayload);
    return color;
  };

  const finish = () => {
    controller.enqueue(encoder.encode("event: complete\ndata: {}\n\n"));
    controller.close();
  };

  if (saturation === 0 || lightness === 0 || lightness === 100) {
    await sampleHue(0);
    emitSegments(sampler, controller, lastPayload);
    finish();
    return;
  }

  await sampleHue(0);

  const stack: Array<{ startHue: number; endHue: number }> = [
    { startHue: 0, endHue: 360 },
  ];

  while (stack.length > 0) {
    const { startHue, endHue } = stack.pop()!;
    const span = endHue - startHue;
    if (span <= MIN_SPAN) {
      continue;
    }

    const startColor = await sampleHue(startHue);
    const endColor = await sampleHue(endHue);
    const midpoint = Math.ceil(startHue + span / 2);
    const middleColor = await sampleHue(midpoint % 360);

    const namesMatch =
      startColor.name === middleColor.name && middleColor.name === endColor.name;

    if (!namesMatch) {
      stack.push({ startHue, endHue: midpoint });
      stack.push({ startHue: midpoint, endHue });
    }
  }

  emitSegments(sampler, controller, lastPayload);
  finish();
}

export function segmentHueSpaceStream({
  saturation,
  lightness,
  sample,
}: SegmentHueSpaceOptions): ReadableStream<Uint8Array> {
  const sampler = new AdaptiveSampler(
    sample ?? ((hue) => getColorByHsl({ hue, saturation, lightness })),
  );

  return new ReadableStream<Uint8Array>({
    start(controller) {
      streamRange(sampler, controller, saturation, lightness).catch((error) => {
        controller.error(error);
      });
    },
  });
}
