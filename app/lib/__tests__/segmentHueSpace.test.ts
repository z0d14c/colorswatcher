import { describe, expect, it } from "vitest";

import type { ColorDescriptor } from "../types.server";
import { collectStreamedSegments, streamSegmentHueSpace } from "../segmentHueSpace.server";
import { normalizeHue } from "../utils.server";

interface FakeRange {
  readonly start: number;
  readonly end: number;
  readonly name: string;
}

const createFakeSampler = (ranges: FakeRange[]) => {
  return async (hue: number): Promise<ColorDescriptor> => {
    const normalized = normalizeHue(hue);
    const match = ranges.find((range) => {
      if (range.start <= range.end) {
        return normalized >= range.start && normalized < range.end;
      }

      return normalized >= range.start || normalized < range.end;
    });

    const chosen = match ?? ranges[ranges.length - 1];
    const roundedHue = Number(normalized.toFixed(2));

    return {
      name: chosen.name,
      rgb: {
        value: `rgb(${Math.round(roundedHue)}, 0, 0)`,
        r: Math.round(roundedHue),
        g: 0,
        b: 0,
      },
      hsl: {
        value: `hsl(${roundedHue}, 60%, 50%)`,
        h: roundedHue,
        s: 60,
        l: 50,
      },
    } satisfies ColorDescriptor;
  };
};

describe("segmentHueSpace", () => {
  it("splits segments on hue boundaries", async () => {
    const segments = await collectStreamedSegments({
      saturation: 60,
      lightness: 50,
      sample: createFakeSampler([
        { start: 0, end: 90, name: "Red" },
        { start: 90, end: 210, name: "Green" },
        { start: 210, end: 360, name: "Blue" },
      ]),
    });

    expect(segments).toHaveLength(3);
    expect(segments.map((segment) => segment.color.name)).toEqual([
      "Red",
      "Green",
      "Blue",
    ]);
    expect(segments[0].startHue).toBeCloseTo(0, 1);
    expect(segments[0].endHue).toBeGreaterThan(80);
    expect(segments[0].endHue).toBeLessThan(100);
  });

  it("merges wrap-around segments with the same name", async () => {
    const segments = await collectStreamedSegments({
      saturation: 60,
      lightness: 50,
      sample: createFakeSampler([
        { start: 0, end: 40, name: "Rose" },
        { start: 40, end: 300, name: "Gray" },
        { start: 300, end: 360, name: "Rose" },
      ]),
    });

    expect(segments).toHaveLength(2);

    const roseSegment = segments.find(
      (segment) => segment.color.name === "Rose",
    );

    expect(roseSegment).toBeDefined();
    expect(roseSegment?.startHue).toBeGreaterThan(295);
    expect(roseSegment?.startHue).toBeLessThan(305);
    expect(roseSegment?.endHue).toBeGreaterThan(360);
    expect(roseSegment?.endHue).toBeLessThan(406);
  });

  it("returns a single segment for grayscale values", async () => {
    let calls = 0;
    const segments = await collectStreamedSegments({
      saturation: 0,
      lightness: 50,
      sample: async (hue) => {
        calls += 1;
        const normalized = Number(normalizeHue(hue).toFixed(2));

        return {
          name: "Gray",
          rgb: {
            value: `rgb(${normalized}, ${normalized}, ${normalized})`,
            r: normalized,
            g: normalized,
            b: normalized,
          },
          hsl: {
            value: `hsl(${normalized}, 0%, 50%)`,
            h: normalized,
            s: 0,
            l: 50,
          },
        } satisfies ColorDescriptor;
      },
    });

    expect(segments).toHaveLength(1);
    expect(segments[0].startHue).toBe(0);
    expect(segments[0].endHue).toBe(360);
    expect(calls).toBe(1);
  });

  it("streams progressive batches of segments", async () => {
    const stream = streamSegmentHueSpace({
      saturation: 60,
      lightness: 50,
      sample: createFakeSampler([
        { start: 0, end: 90, name: "Red" },
        { start: 90, end: 210, name: "Green" },
        { start: 210, end: 360, name: "Blue" },
      ]),
    });

    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
    }

    buffer += decoder.decode();

    const lines = buffer
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    expect(lines.length).toBeGreaterThan(1);

    const finalPayload = JSON.parse(lines.at(-1) ?? "{}") as {
      segments: { color: { name: string } }[];
    };

    expect(finalPayload.segments).toHaveLength(3);
    expect(finalPayload.segments.map((segment) => segment.color.name)).toEqual([
      "Red",
      "Green",
      "Blue",
    ]);
  });
});
