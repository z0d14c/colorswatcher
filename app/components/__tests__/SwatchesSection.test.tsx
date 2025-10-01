/**
 * @vitest-environment jsdom
 */
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SwatchesSection } from "../SwatchesSection";
import type { HueSegment } from "~/lib/types.server";

const createSwatch = (name: string): HueSegment => ({
  startHue: 0,
  endHue: 10,
  color: {
    name,
    rgb: { value: "#000000", r: 0, g: 0, b: 0 },
    hsl: { value: "hsl(0, 0%, 0%)", h: 0, s: 0, l: 0 },
  },
});

describe("SwatchesSection", () => {
  it("renders the provided swatches", () => {
    const swatches = [createSwatch("Red"), createSwatch("Blue"), createSwatch("Green")];

    render(
      <SwatchesSection
        swatches={swatches}
        error={null}
        isUpdating={false}
        showOverlay={false}
      />,
    );

    expect(screen.getAllByRole("article")).toHaveLength(swatches.length);
  });
});
