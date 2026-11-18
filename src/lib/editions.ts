import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseEditions, type EditionsFile } from "./editions-core";

export type { EditionsFile } from "./editions-core";

// Resolved from the project root: build modules are bundled, so import.meta.url
// doesn't point at the source tree.
const EDITIONS_FILE = resolve(process.cwd(), "content/editions.yaml");

/** Reads and validates content/editions.yaml. */
export function readEditions(file = EDITIONS_FILE): EditionsFile {
  return parseEditions(readFileSync(file, "utf8"), file);
}
