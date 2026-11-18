import { parse } from "yaml";

/**
 * Parsing for content/editions.yaml with no Node APIs, so the Keystatic admin
 * (which runs in the browser) can use it too. Node code reads the file through
 * `readEditions` in editions.ts.
 */

export interface EditionsFile {
  editions: number[];
  current: number;
}

/** Parses and validates the text of content/editions.yaml. */
export function parseEditions(source: string, file = "content/editions.yaml"): EditionsFile {
  const data = parse(source) as Partial<EditionsFile> | null;
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
  if (new Set(editions).size !== editions.length) {
    throw new Error(`${file}: "editions" lists a year more than once`);
  }
  if (typeof current !== "number" || !editions.includes(current)) {
    throw new Error(`${file}: "current" (${current}) must be one of the listed editions`);
  }
  return { editions, current };
}
