import { normalizeHue } from "~/shared/color-utils";
import type { HueSegment } from "~/shared/types";

export const swatchSortKey = (segment: HueSegment): number => {
  if (segment.endHue > 360) {
    return 0;
  }

  return normalizeHue(segment.startHue);
};

export const sortSwatchesByHue = (
  segments: Iterable<HueSegment>
): HueSegment[] =>
  Array.from(segments).sort((left, right) => {
    const leftHue = swatchSortKey(left);
    const rightHue = swatchSortKey(right);

    if (leftHue === rightHue) {
      return normalizeHue(left.endHue) - normalizeHue(right.endHue);
    }

    return leftHue - rightHue;
  });
