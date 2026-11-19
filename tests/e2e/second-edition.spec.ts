import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { expect, test } from "@playwright/test";

/**
 * A second edition builds side by side without affecting the current one.
 *
 * Copies the project into a temporary directory, adds the fixture 2025 edition
 * (tests/fixtures/content/2025 and its assets) next to the real 2026 content,
 * lists it in editions.yaml (2026 stays current), and runs a real `astro build`
 * there. The real content and dist/ are never touched. node_modules is linked,
 * so Astro's image cache and the share-card cache are shared with the main build.
 */

const ROOT = resolve(import.meta.dirname, "../..");
// The e2e web server runs `pnpm build` first, so dist/ is fresh.
const DIST = join(ROOT, "dist");
const FIXTURES = join(ROOT, "tests/fixtures");
const SITE = "https://wishbook.syntax.fm";
const PROJECT_FILES = [
  "astro.config.mjs",
  "keystatic.config.ts",
  "package.json",
  "tsconfig.json",
  "src",
  "public",
  "content",
  "assets",
];

const filesIn = (dir: string) =>
  readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile())
    .map((e) => relative(dir, join(e.parentPath, e.name)))
    .toSorted();

test.describe.configure({ mode: "serial" });

test.describe("a fixture second edition", () => {
  let tmp = "";
  let out = "";
  const read = (path: string) => readFileSync(join(out, path), "utf8");

  test.beforeAll(() => {
    test.setTimeout(300_000);
    tmp = mkdtempSync(join(tmpdir(), "wishbook-editions-"));
    for (const f of PROJECT_FILES) cpSync(join(ROOT, f), join(tmp, f), { recursive: true });
    symlinkSync(join(ROOT, "node_modules"), join(tmp, "node_modules"), "dir");
    cpSync(join(FIXTURES, "content/2025"), join(tmp, "content/2025"), { recursive: true });
    cpSync(join(FIXTURES, "assets/2025"), join(tmp, "assets/2025"), { recursive: true });
    writeFileSync(
      join(tmp, "content/editions.yaml"),
      "editions:\n  - 2025\n  - 2026\ncurrent: 2026\n",
    );
    execFileSync(process.execPath, [join(ROOT, "node_modules/astro/bin/astro.mjs"), "build"], {
      cwd: tmp,
      stdio: "pipe",
      env: { ...process.env, ASTRO_TELEMETRY_DISABLED: "1" },
    });
    out = join(tmp, "dist");
  });

  test.afterAll(() => {
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  });

  test("builds its own year-scoped pages, share cards, catalog, and wish list", () => {
    const cover = read("2025/index.html");
    expect(cover).toContain('data-edition="2025"');
    const paths = [...new Set([...cover.matchAll(/\sdata-path="([^"]+)"/g)].map((m) => m[1]!))];
    expect(paths).toContain("/2025/");
    for (const path of paths) {
      expect(path).toMatch(/^\/2025\//);
      const html = read(join(path.slice(1), "index.html"));
      expect(html).toContain(`<link rel="canonical" href="${SITE}${path}"`);
    }
    for (const file of ["2025/catalog.txt", "2025/wishlist/index.html", "2025/og/cover.png"]) {
      expect(existsSync(join(out, file)), file).toBe(true);
    }
    expect(read("2025/catalog.txt")).toMatch(/old cable/i);
    expect(read("2025/catalog.txt")).not.toEqual(read("2026/catalog.txt"));
    // 2025 never links into 2026, and the other way round.
    for (const file of filesIn(join(out, "2025")).filter((f) => f.endsWith(".html"))) {
      for (const m of read(join("2025", file)).matchAll(/\s[\w:-]+="(\/[^"]*)"/g)) {
        expect(m[1], file).toMatch(/^\/(2025\/|_astro\/)/);
      }
    }
    for (const file of filesIn(join(out, "2026")).filter((f) => f.endsWith(".html"))) {
      expect(read(join("2026", file)), file).not.toContain('"/2025/');
    }
  });

  test("leaves the 2026 edition, the root copies, and _redirects byte for byte the same", () => {
    const current = filesIn(join(DIST, "2026"));
    expect(current.length).toBeGreaterThan(50);
    expect(filesIn(join(out, "2026"))).toEqual(current);
    for (const file of [
      ...current.map((f) => join("2026", f)),
      "index.html",
      "catalog.txt",
      "_redirects",
      "_headers",
    ]) {
      const ours = readFileSync(join(out, file));
      expect(ours.equals(readFileSync(join(DIST, file))), file).toBe(true);
    }
  });
});
