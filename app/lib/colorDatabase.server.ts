import fs from "node:fs";
import path from "node:path";

import BetterSqlite3 from "better-sqlite3";
import type { Database as SqliteDatabase, Statement } from "better-sqlite3";

import type { ColorDescriptor, GetColorByHslOptions } from "./types.server";
import { normalizeHue } from "./utils.server";

const DEFAULT_DATABASE_PATH = path.resolve(process.cwd(), "data", "colors.sqlite");

let connection: SqliteDatabase | null = null;
let initializationAttempted = false;
interface ColorRow {
  readonly name: string;
  readonly rgb_value: string;
  readonly rgb_r: number;
  readonly rgb_g: number;
  readonly rgb_b: number;
  readonly hsl_value: string;
  readonly hsl_h: number;
  readonly hsl_s: number;
  readonly hsl_l: number;
}

let selectStatement: Statement<[number, number, number], ColorRow> | null = null;

const getDatabasePath = (): string => {
  const override = process.env.COLOR_DATABASE_PATH;
  return override && override.length > 0 ? override : DEFAULT_DATABASE_PATH;
};

const openDatabase = (): SqliteDatabase | null => {
  if (connection) {
    return connection;
  }

  const dbPath = getDatabasePath();
  if (!fs.existsSync(dbPath)) {
    initializationAttempted = true;
    return null;
  }

  connection = new BetterSqlite3(dbPath, { readonly: true });
  connection.pragma("journal_mode = WAL");
  selectStatement = connection.prepare<[number, number, number], ColorRow>(
    `SELECT name, rgb_value, rgb_r, rgb_g, rgb_b, hsl_value, hsl_h, hsl_s, hsl_l FROM colors WHERE hue = ? AND saturation = ? AND lightness = ? LIMIT 1;`,
  );
  initializationAttempted = true;
  return connection;
};

export const isDatabaseAvailable = (): boolean => {
  if (connection) {
    return true;
  }

  if (!initializationAttempted) {
    const dbPath = getDatabasePath();
    if (!fs.existsSync(dbPath)) {
      return false;
    }
  }

  const db = openDatabase();
  return db !== null;
};

export const getColorFromDatabase = ({
  hue,
  saturation,
  lightness,
}: GetColorByHslOptions): ColorDescriptor | null => {
  const db = openDatabase();
  if (!db || !selectStatement) {
    return null;
  }

  const normalizedHue = Math.round(normalizeHue(hue));
  const normalizedSaturation = Math.max(0, Math.min(100, Math.round(saturation)));
  const normalizedLightness = Math.max(0, Math.min(100, Math.round(lightness)));

  const row = selectStatement.get(normalizedHue, normalizedSaturation, normalizedLightness);
  if (!row) {
    return null;
  }

  return {
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
  } satisfies ColorDescriptor;
};
