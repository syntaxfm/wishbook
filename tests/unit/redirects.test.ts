import { describe, expect, it } from "vitest";
import { getCurrentEdition, getSections } from "../../src/lib/content";
import { redirectsFile } from "../../src/lib/redirects";

const rules = (file: string) =>
  file
    .split("\n")
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => l.split(/\s+/));

describe("redirectsFile", () => {
  it("302s every year-less section path, and the wish list, to the edition", () => {
    expect(rules(redirectsFile(2026, ["favorites", "kids-pets"]))).toEqual([
      ["/favorites/*", "/2026/favorites/:splat", "302"],
      ["/kids-pets/*", "/2026/kids-pets/:splat", "302"],
      ["/wishlist/*", "/2026/wishlist/:splat", "302"],
    ]);
  });

  it("covers every section of the current edition", async () => {
    const edition = getCurrentEdition();
    const sections = await getSections(edition);
    const from = rules(
      redirectsFile(
        edition,
        sections.map((s) => s.id),
      ),
    ).map((r) => r[0]);
    for (const s of sections) expect(from).toContain(`/${s.id}/*`);
  });
});
