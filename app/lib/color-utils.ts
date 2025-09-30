export const clampPercentage = (value: number, fallback: number): number => {
  if (Number.isNaN(value)) {
    return fallback;
  }

  if (value < 0) {
    return 0;
  }

  if (value > 100) {
    return 100;
  }

  return value;
};

export const readPercentageParam = (
  url: URL,
  key: string,
  fallback: number,
): number => {
  const values = url.searchParams.getAll(key);
  const raw = values.at(-1);
  const numeric = raw === null ? Number.NaN : Number(raw);
  return clampPercentage(Number.isFinite(numeric) ? numeric : Number.NaN, fallback);
};

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

export const luminanceTextClass = ({
  r,
  g,
  b,
}: {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}): string => {
  const toLinear = (value: number): number => {
    const channel = value / 255;
    return channel <= 0.03928
      ? channel / 12.92
      : Math.pow((channel + 0.055) / 1.055, 2.4);
  };

  const luminance =
    0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);

  return luminance > 0.55 ? "text-slate-900" : "text-slate-50";
};
