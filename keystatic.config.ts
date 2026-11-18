// The Keystatic admin (dev only) always edits the current edition from
// content/editions.yaml. The schema itself lives in src/lib/schema.ts.
// This file also runs in the browser, so editions.yaml is imported as text.
import editionsSource from "./content/editions.yaml?raw";
import { parseEditions } from "./src/lib/editions-core";
import { createKeystaticConfig } from "./src/lib/schema";

const { current } = parseEditions(editionsSource);

export default createKeystaticConfig(current);
