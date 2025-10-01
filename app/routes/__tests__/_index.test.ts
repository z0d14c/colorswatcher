import { describe, expect, it } from "vitest";

import type { HueSegment } from "~/shared/types";
import { swatchSortKey, sortSwatchesByHue } from "~/utils/sortSwatches";

const createSegment = (
  name: string,
  startHue: number,
  endHue: number,
): HueSegment => ({
  startHue,
  endHue,
  color: {
    name,
    rgb: {
      value: "#000000",
      r: 0,
      g: 0,
      b: 0,
    },
    hsl: {
      value: `hsl(${startHue} 0% 0%)`,
      h: startHue,
      s: 0,
      l: 0,
    },
  },
});

describe("swatchSortKey", () => {
  it("returns 0 for segments that wrap around hue 0", () => {
    const segment = createSegment("wrap", 350, 370);
    expect(swatchSortKey(segment)).toBe(0);
  });

  it("normalizes segments that do not wrap", () => {
    const segment = createSegment("direct", -30, 10);
    expect(swatchSortKey(segment)).toBe(330);
  });
});

describe("sortSwatchesByHue", () => {
  it("orders wrap-around segments before other hues", () => {
    const wrap = createSegment("wrap", 350, 380);
    const other = createSegment("other", 40, 80);

    const result = sortSwatchesByHue([other, wrap]);

    expect(result[0]).toBe(wrap);
    expect(result[1]).toBe(other);
  });

  it("falls back to end hue when start hues are equal", () => {
    const first = createSegment("first", 45, 100);
    const second = createSegment("second", 45, 90);

    const result = sortSwatchesByHue([first, second]);

    expect(result[0]).toBe(second);
    expect(result[1]).toBe(first);
  });
});

