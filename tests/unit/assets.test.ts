import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  indexAssets,
  parseItemFile,
  PLACEHOLDER_COLOR,
  resolveFrom,
  type ResolverContent,
} from "../../src/lib/assets";
import { createContentReader } from "../../src/lib/content";

const content = createContentReader(resolve(import.meta.dirname, "../fixtures"));

// The real fixture files, globbed the same way src/lib/assets.ts globs assets/.
const fixtureFiles = import.meta.glob<string>(
  "/tests/fixtures/assets/**/*.{png,jpg,jpeg,webp,avif,svg}",
  { eager: true, import: "default" },
);
const fixtureIndex = indexAssets(fixtureFiles, "/tests/fixtures/assets");

async function resolverContent(edition: number): Promise<ResolverContent> {
  const e = await content.getEdition(edition);
  return { manifest: e.assets, items: e.items, hosts: e.hosts };
}

describe("parseItemFile", () => {
  it("reads the id prefix (any zero padding) and an optional suffix", () => {
    expect(parseItemFile("001-silicone-cables")).toEqual({ id: 1, suffix: null });
    expect(parseItemFile("1-silicone-cables")).toEqual({ id: 1, suffix: null });
    expect(parseItemFile("012-anker-735-charger")).toEqual({ id: 12, suffix: null });
    expect(parseItemFile("012-anker-735-charger-2")).toEqual({ id: 12, suffix: "2" });
    expect(parseItemFile("012-ollee-hero")).toEqual({ id: 12, suffix: "hero" });
    expect(parseItemFile("012")).toEqual({ id: 12, suffix: null });
    expect(parseItemFile("012-3")).toEqual({ id: 12, suffix: "3" });
    expect(parseItemFile("cover-art")).toBeNull();
  });
});

describe("resolveFrom with fixture files", () => {
  it("finds item photos by id prefix and suffix", async () => {
    const c = await resolverContent(2026);
    expect(resolveFrom(fixtureIndex, 2026, "item:1", c)).toMatchObject({
      kind: "image",
      file: "/tests/fixtures/assets/2026/items/001-cables.svg",
    });
    // Unpadded id, extra photo.
    expect(resolveFrom(fixtureIndex, 2026, "item:2-2", c)).toMatchObject({
      kind: "image",
      file: "/tests/fixtures/assets/2026/items/2-power-bank-2.svg",
    });
    expect(resolveFrom(fixtureIndex, 2026, "item:3-hero", c)).toMatchObject({ kind: "image" });
  });

  it("gives a placeholder for a missing item photo", async () => {
    const c = await resolverContent(2026);
    expect(resolveFrom(fixtureIndex, 2026, "item:2", c)).toEqual({
      kind: "placeholder",
      key: "item:2",
      label: "Fixture Power Bank",
      color: "#C5301F",
    });
    expect(resolveFrom(fixtureIndex, 2026, "item:1-3", c)).toMatchObject({ kind: "placeholder" });
  });

  it("finds generated art by its manifest file, ignoring the extension", async () => {
    const c = await resolverContent(2026);
    // The manifest says stockings.png; the file is stockings.svg.
    expect(resolveFrom(fixtureIndex, 2026, "IMG-S1", c)).toMatchObject({
      kind: "image",
      file: "/tests/fixtures/assets/2026/generated/stockings.svg",
    });
    expect(resolveFrom(fixtureIndex, 2026, "IMG-C1", c)).toEqual({
      kind: "placeholder",
      key: "IMG-C1",
      label: "IMG-C1 · centerfold scene",
      color: PLACEHOLDER_COLOR,
    });
  });

  it("resolves host photos and shared brand assets", async () => {
    const c = await resolverContent(2026);
    expect(resolveFrom(fixtureIndex, 2026, "host:wes", c)).toMatchObject({ kind: "image" });
    expect(resolveFrom(fixtureIndex, 2026, "host:scott", c)).toMatchObject({
      kind: "placeholder",
      label: "Fixture Host Two",
    });
    expect(resolveFrom(fixtureIndex, 2026, "brand:logo", c)).toMatchObject({
      kind: "image",
      file: "/tests/fixtures/assets/brand/logo.svg",
    });
  });

  it("throws for keys that don't exist in the edition's content", async () => {
    const c = await resolverContent(2026);
    expect(() => resolveFrom(fixtureIndex, 2026, "item:42", c)).toThrow(/no item with id 42/);
    expect(() => resolveFrom(fixtureIndex, 2026, "host:nobody", c)).toThrow(/no host/);
    expect(() => resolveFrom(fixtureIndex, 2026, "IMG-NOPE", c)).toThrow(/not in content\/2026/);
    expect(() => resolveFrom(fixtureIndex, 2026, "item:1-x", c)).toThrow(/Bad item asset key/);
  });

  it("keeps editions apart", async () => {
    const old = await resolverContent(2025);
    expect(resolveFrom(fixtureIndex, 2025, "item:1", old)).toMatchObject({
      kind: "image",
      file: "/tests/fixtures/assets/2025/items/001-old-cable.svg",
    });
    // 2026's art and photos aren't visible from 2025.
    expect(() => resolveFrom(fixtureIndex, 2025, "IMG-S1", old)).toThrow();
    expect(() => resolveFrom(fixtureIndex, 2025, "item:3-hero", old)).toThrow(/no item with id 3/);
    expect(resolveFrom(fixtureIndex, 2025, "host:wes", old)).toMatchObject({
      kind: "placeholder",
      label: "Last Year Host",
    });
  });
});

describe("resolveFrom with any extension", () => {
  const c: ResolverContent = {
    manifest: [{ key: "ART", file: "generated/art.png", label: "Art", color: "#2A6E3B" }],
    items: [{ id: 7, name: "Seven", section: { color: "#123456" } }],
    hosts: [],
  };

  for (const ext of ["png", "jpg", "jpeg", "webp", "avif", "svg"]) {
    it(`matches .${ext}`, () => {
      const index = indexAssets({
        [`/assets/2026/items/007-seven.${ext}`]: ext,
        [`/assets/2026/generated/art.${ext}`]: ext,
      });
      expect(resolveFrom(index, 2026, "item:7", c)).toMatchObject({ kind: "image", meta: ext });
      expect(resolveFrom(index, 2026, "ART", c)).toMatchObject({ kind: "image", meta: ext });
    });
  }

  it("throws when two files claim the same photo", () => {
    const index = indexAssets({
      "/assets/2026/items/007-seven.png": "a",
      "/assets/2026/items/7-seven-again.webp": "b",
    });
    expect(() => resolveFrom(index, 2026, "item:7", c)).toThrow(/More than one file/);
  });

  it("ignores the archive folder (old photos kept for reference)", () => {
    const index = indexAssets({
      "/assets/2026/items/007-seven.webp": "current",
      "/assets/2026/archive/007-seven-old.webp": "old",
      "/assets/2026/archive/007-seven-2.webp": "old extra",
    });
    expect(resolveFrom(index, 2026, "item:7", c)).toMatchObject({ kind: "image", meta: "current" });
    expect(resolveFrom(index, 2026, "item:7-2", c)).toMatchObject({ kind: "placeholder" });
  });
});
