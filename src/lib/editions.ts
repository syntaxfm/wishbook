import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";

export interface EditionsFile {
  editions: number[];
  current: number;
}

// Resolved from the project root: build modules are bundled, so import.meta.url
// doesn't point at the source tree.
const EDITIONS_FILE = resolve(process.cwd(), "content/editions.yaml");

/** Reads and validates content/editions.yaml. */
export function readEditions(file = EDITIONS_FILE): EditionsFile {
  const data = parse(readFileSync(file, "utf8")) as Partial<EditionsFile> | null;
  const editions = data?.editions;
  const current = data?.current;
  if (!Array.isArray(editions) || editions.length === 0) {
    throw new Error(`${file}: "editions" must be a non-empty list of years`);
  }
  for (const year of editions) {
    if (!Number.isInteger(year) || String(year).length !== 4) {
      throw new Error(`${file}: edition "${year}" is not a four-digit year`);
    }
  }
  if (typeof current !== "number" || !editions.includes(current)) {
    throw new Error(`${file}: "current" (${current}) must be one of the listed editions`);
  }
  return { editions, current };
}
