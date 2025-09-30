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

const concurrency = Number.parseInt(process.env.COLOR_CACHE_CONCURRENCY ?? "4", 10);
const hueStart = Number.parseInt(process.env.COLOR_CACHE_HUE_START ?? "0", 10);
const hueEnd = Number.parseInt(process.env.COLOR_CACHE_HUE_END ?? "359", 10);
const saturationStart = Number.parseInt(process.env.COLOR_CACHE_SATURATION_START ?? "0", 10);
const saturationEnd = Number.parseInt(process.env.COLOR_CACHE_SATURATION_END ?? "100", 10);
const lightnessStart = Number.parseInt(process.env.COLOR_CACHE_LIGHTNESS_START ?? "0", 10);
const lightnessEnd = Number.parseInt(process.env.COLOR_CACHE_LIGHTNESS_END ?? "100", 10);
const retryLimit = Number.parseInt(process.env.COLOR_CACHE_RETRY_LIMIT ?? "4", 10);

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
    `SELECT 1 FROM colors WHERE hue = ? AND saturation = ? AND lightness = ? LIMIT 1;`,
  );

  let totalRequests = 0;
  let skipped = 0;
  let inserted = 0;
  const tasks = [];
  let active = 0;

  const enqueue = async (h, s, l) => {
    if (select.get(h, s, l)) {
      skipped += 1;
      return;
    }

    while (active >= concurrency) {
      await Promise.race(tasks);
      for (let index = tasks.length - 1; index >= 0; index -= 1) {
        if (tasks[index].settled) {
          tasks.splice(index, 1);
        }
      }
    }

    const task = (async () => {
      try {
        active += 1;
        totalRequests += 1;
        const color = await fetchColor(h, s, l);
        insert.run(
          h,
          s,
          l,
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
      } catch (error) {
        console.error(`Failed to cache ${h}/${s}/${l}:`, error);
        throw error;
      } finally {
        active -= 1;
      }
    })();

    task.settled = false;
    task.then(
      () => {
        task.settled = true;
      },
      () => {
        task.settled = true;
      },
    );

    tasks.push(task);
  };

  for (let saturation = saturationStart; saturation <= saturationEnd; saturation += 1) {
    for (let lightness = lightnessStart; lightness <= lightnessEnd; lightness += 1) {
      for (let hue = hueStart; hue <= hueEnd; hue += 1) {
        await enqueue(hue, saturation, lightness);
      }
    }
  }

  await Promise.all(tasks);

  console.log(`Inserted ${inserted} colors. Skipped ${skipped} existing entries.`);
  console.log(`Total requests sent: ${totalRequests}. Database saved at ${databasePath}`);

  db.close();
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
