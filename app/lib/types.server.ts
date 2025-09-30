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

export interface GetColorByHslOptions {
  readonly hue: number;
  readonly saturation: number;
  readonly lightness: number;
}

export interface HueSegment {
  readonly startHue: number;
  readonly endHue: number;
  readonly color: ColorDescriptor;
}

export interface SegmentHueSpaceOptions {
  readonly saturation: number;
  readonly lightness: number;
  readonly sample?: (hue: number) => Promise<ColorDescriptor>;
}

export type ColorSample = ColorDescriptor;

export type ColorSource = "api" | "database";
