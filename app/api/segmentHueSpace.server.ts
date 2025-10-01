import { AdaptiveSampler } from "./adaptiveSampler.server";
import { getColorByHsl } from "./colorApi.server";
import type { HueSegment, SegmentHueSpaceOptions } from "~/shared/types";

// Minimum width we will subdivide; narrower bands would be visually indistinguishable.
const MIN_SPAN = 1;

// Cache keyed by the saturation/lightness tuple to avoid redundant segmentation
// when computing the full set of segments up front (for SSR or tests).
// Development rebuilds re-evaluate this module on every request, so the map clears
// between refreshes; the production build runs inside a long-lived worker where the
// memo persists and identical S/L pairs reuse the in-flight promise.
const memo = new Map<string, Promise<HueSegment[]>>();

const canonicalizeName = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]/gi, "")
    .trim();

const segmentSpan = ({ startHue, endHue }: HueSegment): number => {
  if (endHue >= startHue) {
    return endHue - startHue;
  }

  return endHue + 360 - startHue;
};

// NOTE: In theory adaptive sampling should already produce unique color names
// for any given hue, but the upstream dataset occasionally contains
// near-duplicates (for example, "Screamin' Green" vs "Screamin Green") that
// lead to overlapping segments being emitted. To guard against these data
// quirks we canonicalize names, keep only the widest representative span for
// each canonical key, and then emit at most one segment per key while
// preserving the original discovery order so incremental updates remain
// stable.
const dedupeSegments = (segments: HueSegment[]): HueSegment[] => {
  if (segments.length <= 1) {
    return segments;
  }

  const chosen = new Map<string, HueSegment>();

  for (const segment of segments) {
    const key = canonicalizeName(segment.color.name);
    const existing = chosen.get(key);

    if (!existing || segmentSpan(segment) > segmentSpan(existing)) {
      chosen.set(key, segment);
    }
  }

  const emitted = new Set<string>();
  const unique: HueSegment[] = [];

  for (const segment of segments) {
    const key = canonicalizeName(segment.color.name);
    if (emitted.has(key)) {
      continue;
    }

    const selected = chosen.get(key);
    if (selected && selected === segment) {
      unique.push(segment);
      emitted.add(key);
    }
  }

  return unique;
};

const buildSegmentsFromKnownHues = (
  sampler: AdaptiveSampler,
  knownHues: readonly number[],
): HueSegment[] => {
  if (knownHues.length === 0) {
    return [];
  }

  const sorted = Array.from(new Set<number>(knownHues))
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

  return dedupeSegments(mergeSegments(segments));
};

// Kick off adaptive sampling and turn the sampled hues into merged segments,
// calling `onProgress` whenever a new hue discovery changes the resulting
// segments.
async function createSegments(
  sampler: AdaptiveSampler,
  saturation: number,
  lightness: number,
  onProgress?: (segments: HueSegment[]) => void,
): Promise<HueSegment[]> {
  const emit = (segments: HueSegment[]): void => {
    if (segments.length > 0) {
      onProgress?.(segments);
    }
  };

  if (saturation === 0 || lightness === 0 || lightness === 100) {
    const color = await sampler.get(0);
    const grayscale = [
      {
        startHue: 0,
        endHue: 360,
        color,
      },
    ];
    emit(grayscale);
    return grayscale;
  }

  const queue: Array<{ startHue: number; endHue: number }> = [
    { startHue: 0, endHue: 360 },
  ];

  await sampler.get(0);

  let lastSignature = "";
  let lastSegments: HueSegment[] = [];

  const refreshSegments = (): HueSegment[] => {
    const knownHues = sampler.getKnownHues();
    const signature = knownHues.join(",");
    if (signature === lastSignature) {
      return lastSegments;
    }

    lastSignature = signature;
    lastSegments = buildSegmentsFromKnownHues(sampler, knownHues);
    emit(lastSegments);
    return lastSegments;
  };

  refreshSegments();

  while (queue.length > 0) {
    const { startHue, endHue } = queue.shift()!;
    const span = endHue - startHue;

    if (span <= MIN_SPAN) {
      continue;
    }

    const [startColor, endColor] = await Promise.all([
      sampler.get(startHue),
      sampler.get(endHue),
    ]);

    const midpoint = Math.ceil(startHue + span / 2);
    const middleColor = await sampler.get(midpoint % 360);

    refreshSegments();

    const namesMatch =
      startColor.name === middleColor.name &&
      middleColor.name === endColor.name;

    if (namesMatch) {
      continue;
    }

    queue.push({ startHue, endHue: midpoint });
    queue.push({ startHue: midpoint, endHue });
  }

  return refreshSegments();
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

export function streamSegmentHueSpace({
  saturation,
  lightness,
  sample,
}: SegmentHueSpaceOptions): ReadableStream<Uint8Array> {
  const sampler = new AdaptiveSampler(
    sample ?? ((hue) => getColorByHsl({ hue, saturation, lightness })),
  );

  const encoder = new TextEncoder();

  return new ReadableStream<Uint8Array>({
    start(controller) {
      let lastPayload: string | null = null;

      (async () => {
        try {
          await createSegments(sampler, saturation, lightness, (segments) => {
            if (segments.length === 0) {
              return;
            }

            const payload = JSON.stringify({ segments });
            if (payload === lastPayload) {
              return;
            }

            lastPayload = payload;
            controller.enqueue(encoder.encode(`${payload}\n`));
          });
          controller.close();
        } catch (error) {
          controller.error(error);
        }
      })();
    },
  });
}

async function consumeStream(
  stream: ReadableStream<Uint8Array>,
): Promise<HueSegment[]> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let latest: HueSegment[] = [];

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    let newlineIndex = buffer.indexOf("\n");
    while (newlineIndex !== -1) {
      const line = buffer.slice(0, newlineIndex).trim();
      buffer = buffer.slice(newlineIndex + 1);

      if (line) {
        const payload = JSON.parse(line) as { segments: HueSegment[] };
        latest = payload.segments;
      }

      newlineIndex = buffer.indexOf("\n");
    }
  }

  buffer += decoder.decode();

  let newlineIndex = buffer.indexOf("\n");
  while (newlineIndex !== -1) {
    const line = buffer.slice(0, newlineIndex).trim();
    buffer = buffer.slice(newlineIndex + 1);

    if (line) {
      const payload = JSON.parse(line) as { segments: HueSegment[] };
      latest = payload.segments;
    }

    newlineIndex = buffer.indexOf("\n");
  }

  const remaining = buffer.trim();
  if (remaining) {
    const payload = JSON.parse(remaining) as { segments: HueSegment[] };
    latest = payload.segments;
  }

  return latest;
}

export async function collectStreamedSegments({
  saturation,
  lightness,
  sample,
}: SegmentHueSpaceOptions): Promise<HueSegment[]> {
  if (sample) {
    return consumeStream(
      streamSegmentHueSpace({ saturation, lightness, sample }),
    );
  }

  const key = `${saturation}:${lightness}`;
  const cached = memo.get(key);
  if (cached) {
    return cached;
  }

  const promise = consumeStream(
    streamSegmentHueSpace({ saturation, lightness }),
  );
  memo.set(key, promise);

  try {
    return await promise;
  } catch (error) {
    memo.delete(key);
    throw error;
  }
}
