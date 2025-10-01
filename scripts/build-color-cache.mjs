#!/usr/bin/env node
import fs from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import Database from "better-sqlite3";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");
const dataDir = path.join(projectRoot, "data");
const databasePath = path.join(dataDir, "colors.sqlite");

const parseInteger = (value, fallback) => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const concurrency = Math.max(1, parseInteger(process.env.COLOR_CACHE_CONCURRENCY, 4));
const saturationStart = parseInteger(process.env.COLOR_CACHE_SATURATION_START, 0);
const saturationEnd = parseInteger(process.env.COLOR_CACHE_SATURATION_END, 100);
const lightnessStart = parseInteger(process.env.COLOR_CACHE_LIGHTNESS_START, 0);
const lightnessEnd = parseInteger(process.env.COLOR_CACHE_LIGHTNESS_END, 100);
const retryLimit = parseInteger(process.env.COLOR_CACHE_RETRY_LIMIT, 4);

const normalizePercentage = (value) => {
  if (!Number.isFinite(value)) return 0;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return Math.round(value);
};

const normalizeHue = (value) => {
  if (!Number.isFinite(value)) return 0;
  const wrapped = value % 360;
  if (Number.isNaN(wrapped)) return 0;
  return wrapped < 0 ? wrapped + 360 : wrapped;
};

const createSchema = (db) => {
  db.exec(`
    CREATE TABLE IF NOT EXISTS colors (
      hue INTEGER NOT NULL,
      saturation INTEGER NOT NULL,
      lightness INTEGER NOT NULL,
      name TEXT NOT NULL,
      rgb_value TEXT NOT NULL,
      rgb_r INTEGER NOT NULL,
      rgb_g INTEGER NOT NULL,
      rgb_b INTEGER NOT NULL,
      hsl_value TEXT NOT NULL,
      hsl_h INTEGER NOT NULL,
      hsl_s INTEGER NOT NULL,
      hsl_l INTEGER NOT NULL,
      PRIMARY KEY (hue, saturation, lightness)
    );
  `);

  db.exec(`CREATE INDEX IF NOT EXISTS idx_colors_hsl ON colors(hue, saturation, lightness);`);
};

const ensureDatabase = async () => {
  await mkdir(dataDir, { recursive: true });
  if (!fs.existsSync(databasePath)) {
    await writeFile(databasePath, "");
  }

  const db = new Database(databasePath);
  db.pragma("journal_mode = WAL");
  createSchema(db);
  return db;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchColor = async (h, s, l, attempt = 0) => {
  const normalizedHue = normalizeHue(h);
  const normalizedSaturation = normalizePercentage(s);
  const normalizedLightness = normalizePercentage(l);

  const url = new URL("https://www.thecolorapi.com/id");
  url.searchParams.set(
    "hsl",
    `${normalizedHue},${normalizedSaturation}%,${normalizedLightness}%`,
  );

  let response;

  try {
    response = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
    });
  } catch (error) {
    if (attempt < retryLimit) {
      const delay = 500 * (attempt + 1);
      await sleep(delay);
      return fetchColor(h, s, l, attempt + 1);
    }

    throw error;
  }

  if (!response.ok) {
    if (response.status >= 500 && attempt < retryLimit) {
      const delay = 500 * (attempt + 1);
      await sleep(delay);
      return fetchColor(h, s, l, attempt + 1);
    }

    const text = await response.text();
    throw new Error(`Failed to fetch color (${response.status}): ${text}`);
  }

  const payload = await response.json();
  return {
    name: payload.name.value,
    rgb: payload.rgb,
    hsl: payload.hsl,
  };
};

const rowToColorDescriptor = (row) => ({
  name: row.name,
  rgb: {
    value: row.rgb_value,
    r: row.rgb_r,
    g: row.rgb_g,
    b: row.rgb_b,
  },
  hsl: {
    value: row.hsl_value,
    h: row.hsl_h,
    s: row.hsl_s,
    l: row.hsl_l,
  },
});

const MIN_SPAN = 1;

class AdaptiveSampler {
  constructor(fetcher) {
    this.fetcher = fetcher;
    this.promises = new Map();
    this.values = new Map();
  }

  keyFor(hue) {
    const normalized = normalizeHue(hue);
    return Number(normalized.toFixed(6));
  }

  async get(hue) {
    const key = this.keyFor(hue);
    if (this.promises.has(key)) {
      return this.promises.get(key);
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

  getCached(hue) {
    return this.values.get(this.keyFor(hue));
  }

  getKnownHues() {
    return Array.from(this.values.keys()).sort((a, b) => a - b);
  }
}

async function subdivideRange({ sampler, startHue, endHue }) {
  const span = endHue - startHue;
  if (span <= MIN_SPAN) {
    return;
  }

  const startColor = await sampler.get(startHue);
  const endColor = await sampler.get(endHue);

  const midpoint = Math.ceil(startHue + span / 2);
  const middleColor = await sampler.get(midpoint % 360);

  const namesMatch =
    startColor.name === middleColor.name && middleColor.name === endColor.name;

  if (namesMatch) {
    return;
  }

  await subdivideRange({ sampler, startHue, endHue: midpoint });
  await subdivideRange({ sampler, startHue: midpoint, endHue });
}

async function sampleHueSpace(sampler, saturation, lightness) {
  if (saturation === 0 || lightness === 0 || lightness === 100) {
    await sampler.get(0);
    return;
  }

  await sampler.get(0);
  await subdivideRange({ sampler, startHue: 0, endHue: 360 });
}

const formatPair = (saturation, lightness) => `S=${saturation} L=${lightness}`;

const main = async () => {
  const db = await ensureDatabase();

  const insert = db.prepare(`
    INSERT OR REPLACE INTO colors (
      hue,
      saturation,
      lightness,
      name,
      rgb_value,
      rgb_r,
      rgb_g,
      rgb_b,
      hsl_value,
      hsl_h,
      hsl_s,
      hsl_l
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
  `);

  const select = db.prepare(
    `SELECT name, rgb_value, rgb_r, rgb_g, rgb_b, hsl_value, hsl_h, hsl_s, hsl_l FROM colors WHERE hue = ? AND saturation = ? AND lightness = ? LIMIT 1;`,
  );

  const saturationMin = normalizePercentage(
    Math.min(saturationStart, saturationEnd),
  );
  const saturationMax = normalizePercentage(
    Math.max(saturationStart, saturationEnd),
  );
  const lightnessMin = normalizePercentage(Math.min(lightnessStart, lightnessEnd));
  const lightnessMax = normalizePercentage(Math.max(lightnessStart, lightnessEnd));

  const totalPairs =
    (saturationMax - saturationMin + 1) * (lightnessMax - lightnessMin + 1);
  if (totalPairs <= 0) {
    console.error("No saturation/lightness pairs to process.");
    db.close();
    return;
  }

  let inserted = 0;
  let reused = 0;
  let apiRequests = 0;
  let processedPairs = 0;

  const pairs = [];
  for (let saturation = saturationMin; saturation <= saturationMax; saturation += 1) {
    for (let lightness = lightnessMin; lightness <= lightnessMax; lightness += 1) {
      pairs.push({ saturation, lightness });
    }
  }

  console.log(
    `Preparing to sample ${pairs.length} saturation/lightness combinations using up to ${concurrency} workers.`,
  );

  let nextIndex = 0;
  const takeNextPair = () => {
    if (nextIndex >= pairs.length) {
      return null;
    }
    const pair = pairs[nextIndex];
    nextIndex += 1;
    return pair;
  };

  const processPair = async ({ saturation, lightness }) => {
    const sampler = new AdaptiveSampler(async (hue) => {
      const normalizedHue = Math.round(normalizeHue(hue));
      const row = select.get(normalizedHue, saturation, lightness);
      if (row) {
        reused += 1;
        return rowToColorDescriptor(row);
      }

      const color = await fetchColor(normalizedHue, saturation, lightness);
      apiRequests += 1;

      insert.run(
        normalizedHue,
        saturation,
        lightness,
        color.name,
        color.rgb.value,
        color.rgb.r,
        color.rgb.g,
        color.rgb.b,
        color.hsl.value,
        color.hsl.h,
        color.hsl.s,
        color.hsl.l,
      );

      inserted += 1;
      return color;
    });

    try {
      await sampleHueSpace(sampler, saturation, lightness);
    } catch (error) {
      console.error(
        `Failed while sampling ${formatPair(saturation, lightness)}:`,
        error,
      );
      throw error;
    }

    processedPairs += 1;

    if (processedPairs % 25 === 0 || processedPairs === pairs.length) {
      console.log(
        `Processed ${processedPairs}/${pairs.length} combinations. Inserted ${inserted} new colors (reused ${reused}).`,
      );
    }
  };

  const workerCount = Math.min(concurrency, pairs.length);
  const workers = Array.from({ length: workerCount }, async () => {
    while (true) {
      const pair = takeNextPair();
      if (!pair) {
        break;
      }

      await processPair(pair);
    }
  });

  await Promise.all(workers);

  console.log(
    `Inserted ${inserted} colors. Reused ${reused} existing samples. Sent ${apiRequests} requests to The Color API.`,
  );
  console.log(`Database saved at ${databasePath}`);

  db.close();
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
