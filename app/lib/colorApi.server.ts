// Base endpoint documented by The Color API for looking up an HSL tuple.
const COLOR_API_ENDPOINT = "https://www.thecolorapi.com/id";

export interface ColorDescriptor {
  readonly name: string;
  readonly rgb: {
    readonly value: string;
    readonly r: number;
    readonly g: number;
    readonly b: number;
  };
  readonly hsl: {
    readonly value: string;
    readonly h: number;
    readonly s: number;
    readonly l: number;
  };
}

interface ColorApiResponse {
  readonly name: { readonly value: string };
  readonly rgb: {
    readonly value: string;
    readonly r: number;
    readonly g: number;
    readonly b: number;
  };
  readonly hsl: {
    readonly value: string;
    readonly h: number;
    readonly s: number;
    readonly l: number;
  };
}

export interface GetColorByHslOptions {
  readonly hue: number;
  readonly saturation: number;
  readonly lightness: number;
}

// Guard against out-of-band saturation/lightness values before building the URL.
const clampPercentage = (value: number): number => {
  if (Number.isNaN(value)) {
    return 0;
  }

  if (value < 0) {
    return 0;
  }

  if (value > 100) {
    return 100;
  }

  return value;
};

// Convert arbitrary hue input into the `[0, 360)` range expected by the API.
const normalizeHue = (hue: number): number => {
  if (!Number.isFinite(hue)) {
    return 0;
  }

  const wrapped = hue % 360;
  if (wrapped < 0) {
    return wrapped + 360;
  }

  return wrapped;
};

// Query The Color API for a single color description at the provided HSL triplet.
export async function getColorByHsl({
  hue,
  saturation,
  lightness,
}: GetColorByHslOptions): Promise<ColorDescriptor> {
  const normalizedHue = normalizeHue(hue);
  const normalizedSaturation = clampPercentage(saturation);
  const normalizedLightness = clampPercentage(lightness);

  const url = new URL(COLOR_API_ENDPOINT);
  url.searchParams.set(
    "hsl",
    `${normalizedHue},${normalizedSaturation}%,${normalizedLightness}%`,
  );

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch color information (${response.status})`);
  }

  const data = (await response.json()) as ColorApiResponse;

  return {
    name: data.name.value,
    rgb: {
      value: data.rgb.value,
      r: data.rgb.r,
      g: data.rgb.g,
      b: data.rgb.b,
    },
    hsl: {
      value: data.hsl.value,
      h: data.hsl.h,
      s: data.hsl.s,
      l: data.hsl.l,
    },
  } satisfies ColorDescriptor;
}

export type { ColorDescriptor as ColorSample };
