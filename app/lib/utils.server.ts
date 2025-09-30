export const normalizeHue = (hue: number): number => {
  if (!Number.isFinite(hue)) {
    return 0;
  }

  const wrapped = hue % 360;

  if (Number.isNaN(wrapped)) {
    return 0;
  }

  return wrapped < 0 ? wrapped + 360 : wrapped;
};
