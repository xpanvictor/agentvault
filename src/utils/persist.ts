/**
 * persist.ts — lightweight JSON file persistence for demo state.
 *
 * Writes to `data/<filename>` relative to the project root.
 * Non-fatal on failure — the server keeps running even if a write fails.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT     = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DATA_DIR = join(ROOT, 'data');

/** Read a JSON file from the data directory, returning `fallback` if missing or corrupt. */
export function loadJson<T>(filename: string, fallback: T): T {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    const raw = readFileSync(join(DATA_DIR, filename), 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

/** Write a value as JSON to the data directory. Silently swallows errors. */
export function saveJson(filename: string, data: unknown): void {
  try {
    mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(join(DATA_DIR, filename), JSON.stringify(data, null, 2), 'utf-8');
  } catch {
    // non-fatal
  }
}
