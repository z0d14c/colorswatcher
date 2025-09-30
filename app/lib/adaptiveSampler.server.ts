import type { ColorDescriptor } from "./types.server";
import { normalizeHue } from "./utils.server";

export class AdaptiveSampler {
  private readonly fetcher: (hue: number) => Promise<ColorDescriptor>;

  private readonly promises = new Map<number, Promise<ColorDescriptor>>();

  private readonly values = new Map<number, ColorDescriptor>();

  constructor(fetcher: (hue: number) => Promise<ColorDescriptor>) {
    this.fetcher = fetcher;
  }

  private keyFor(hue: number): number {
    const normalized = normalizeHue(hue);
    return Number(normalized.toFixed(6));
  }

  async get(hue: number): Promise<ColorDescriptor> {
    const key = this.keyFor(hue);
    const existing = this.promises.get(key);
    if (existing) {
      return existing;
    }

    const promise = this.fetcher(normalizeHue(hue)).then((value) => {
      this.values.set(key, value);
      return value;
    });

    this.promises.set(key, promise);

    try {
      return await promise;
    } catch (error) {
      this.promises.delete(key);
      throw error;
    }
  }

  getCached(hue: number): ColorDescriptor | undefined {
    return this.values.get(this.keyFor(hue));
  }

  getKnownHues(): number[] {
    return Array.from(this.values.keys()).sort((a, b) => a - b);
  }
}
