// Reports every asset an edition expects, present or missing, plus the items
// that still need a buy or maker link.
//
//   pnpm assets            current edition: assets, then links
//   pnpm assets 2026       a specific edition
//   pnpm assets --links    links only (also: pnpm links)
//   pnpm assets --prompts  print prompts for present art too (default: missing only)
//
// It reads content through the real reader and resolves files with the real
// resolver (src/lib), so it sees exactly what the build sees. Runs under tsx so
// it can import the TypeScript sources. Always exits 0 unless the content
// itself is invalid.

import { readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { indexAssets, resolveFrom } from "../src/lib/assets.ts";
import { ContentError, createContentReader } from "../src/lib/content.ts";

const ROOT = process.cwd();
const IMAGE_RE = /\.(?:png|jpe?g|webp|avif|svg)$/i;

const args = process.argv.slice(2);
const flags = new Set(args.filter((a) => a.startsWith("--")));
const linksOnly = flags.has("--links");
const allPrompts = flags.has("--prompts");

const reader = createContentReader(ROOT);
const edition = Number(args.find((a) => !a.startsWith("--")) ?? reader.getCurrentEdition());

/** Every image under assets/, keyed the way import.meta.glob keys them ("/assets/…"). */
function scanAssets(dir = join(ROOT, "assets")) {
  const files = {};
  let entries = [];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) Object.assign(files, scanAssets(full));
    else if (IMAGE_RE.test(entry.name)) {
      const rel = relative(ROOT, full).split("\\").join("/");
      files[`/${rel}`] = rel;
    }
  }
  return files;
}

const pad = (id) => String(id).padStart(3, "0");
const slugName = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    // A trailing "-<digit>" would read as an extra-photo suffix.
    .replace(/-\d$/, "");
const indent = (text, by = "      ") =>
  text
    .split("\n")
    .map((line) => (line ? by + line : line))
    .join("\n");

let content;
try {
  content = await reader.getEdition(edition);
} catch (err) {
  console.error(err instanceof ContentError ? err.message : err);
  process.exit(1);
}

const files = scanAssets();
const index = indexAssets(files);
const resolverContent = { manifest: content.assets, items: content.items, hosts: content.hosts };
const resolve = (key) => resolveFrom(index, edition, key, resolverContent);
const dir = `assets/${edition}`;
const itemById = new Map(content.items.map((i) => [i.id, i]));
const itemBySlug = new Map(content.items.map((i) => [i.slug, i]));
const used = new Set();
const counts = { present: 0, missing: 0 };

/** One expected asset: resolves it, prints a line, and counts it. */
function report({ key, target, label, aspect, source, prompt }) {
  let found;
  try {
    found = resolve(key);
  } catch (err) {
    console.log(`  ERROR    ${key}: ${err instanceof Error ? err.message : err}`);
    return;
  }
  const present = found.kind === "image";
  counts[present ? "present" : "missing"]++;
  if (present) used.add(found.meta);
  const path = present ? found.meta : target;
  console.log(`  ${present ? "present" : "MISSING"}  ${key.padEnd(18)} ${path}`);
  const details = [
    label && `label:  ${label}`,
    aspect && `aspect: ${aspect}`,
    source && `source: ${source}`,
  ].filter(Boolean);
  for (const line of details) console.log(`      ${line}`);
  if (prompt && (!present || allPrompts))
    console.log(`      prompt:\n${indent(prompt, "        ")}`);
}

/** The file a manifest key points at, if any, so item rows don't repeat art rows. */
const manifestFiles = new Set(
  content.assets.map((a) => `${dir}/${a.file}`.replace(/\.[^./]+$/, "")),
);
const isManifestFile = (path) => manifestFiles.has(path.replace(/\.[^./]+$/, ""));

function itemSource(item) {
  const main = resolve(`item:${item.id}`);
  return main.kind === "image" ? main.meta : `(no photo yet) ${item.sources[0] ?? ""}`.trim();
}

if (!linksOnly) {
  console.log(`\nWishBook ${edition}: assets\n`);

  // Item photos: every pick's main photo, every suffix a page or variant uses,
  // and any extra photo already in the folder.
  console.log(`Item photos (${dir}/items/<id>-<name>.<ext>, extras -2…-9)`);
  const itemKeys = new Map();
  for (const item of content.items) {
    if (!item.mention) itemKeys.set(`item:${item.id}`, item);
    for (const v of item.variants) {
      if (v.imageSuffix) itemKeys.set(`item:${item.id}-${v.imageSuffix}`, item);
    }
  }
  for (const page of content.pages) {
    for (const pi of page.items) {
      if (pi.photo) itemKeys.set(`item:${pi.item.id}-${pi.photo}`, pi.item);
    }
  }
  for (const rel of Object.values(files)) {
    const m = new RegExp(`^${dir}/items/(\\d+)-.*-([2-9])\\.[^.]+$`).exec(rel);
    const item = m && itemById.get(Number(m[1]));
    if (item && !isManifestFile(rel)) itemKeys.set(`item:${item.id}-${m[2]}`, item);
  }
  const sortedKeys = [...itemKeys].toSorted(([a], [b]) =>
    a.localeCompare(b, "en", { numeric: true }),
  );
  for (const [key, item] of sortedKeys) {
    const suffix = key.split("-")[1];
    const file = `${pad(item.id)}-${slugName(item.name)}${suffix ? `-${suffix}` : ""}`;
    report({
      key,
      target: `${dir}/items/${file}.(png|jpg|webp)`,
      label: suffix ? `${item.name} (photo ${suffix})` : item.name,
      source: suffix ? undefined : item.sources[0],
    });
  }

  console.log(`\nHost photos (${dir}/hosts/<id>.<ext>)`);
  for (const host of content.hosts) {
    report({
      key: `host:${host.slug}`,
      target: `${dir}/hosts/${host.slug}.(jpg|png)`,
      label: host.name,
    });
  }

  console.log(`\nGenerated art and cover (content/${edition}/assets.yaml)`);
  for (const a of content.assets) {
    const item = a.sourceItem ? itemBySlug.get(a.sourceItem) : undefined;
    report({
      key: a.key,
      target: `${dir}/${a.file}${/\.[a-z0-9]+$/i.test(a.file) ? "" : ".png"}`,
      label: a.label,
      aspect: a.aspect,
      source: item ? itemSource(item) : undefined,
      prompt: a.prompt,
    });
  }

  // Art keys used by pages and fillers that aren't manifest entries (item:, host:, brand:).
  const manifestKeys = new Set(content.assets.map((a) => a.key));
  const artKeys = new Set(
    [
      ...content.pages.flatMap((p) => [p.art, p.inset.art]),
      ...content.site.fillers.map((f) => f.art),
    ].filter((k) => k && !manifestKeys.has(k)),
  );
  if (artKeys.size) {
    console.log("\nOther page art");
    for (const key of artKeys) report({ key, target: key });
  }

  console.log("\nShared brand assets (assets/brand/)");
  for (const rel of Object.values(files).filter((f) => f.startsWith("assets/brand/"))) {
    const name = rel.slice("assets/brand/".length).replace(/\.[^.]+$/, "");
    report({ key: `brand:${name}`, target: rel });
  }

  const unused = Object.values(files).filter((f) => f.startsWith(`${dir}/`) && !used.has(f));
  if (unused.length) {
    console.log(`\nFiles in ${dir}/ that nothing expects (check the name or id)`);
    for (const f of unused) console.log(`  ${f}`);
  }

  console.log(`\nAssets: ${counts.present} present, ${counts.missing} missing`);
}

// Links: every pick should have a buy link (affiliate when possible) and a maker link.
const picks = content.items.filter((i) => !i.mention);
const noBuy = picks.filter((i) => !i.buyLink);
const noMaker = picks.filter((i) => !i.makerLink);
const row = (i) => `  ${pad(i.id)}  ${i.name.padEnd(46)} content/${edition}/items/${i.slug}.yaml`;
console.log(`\nWishBook ${edition}: links (${picks.length} picks; mentions skipped)\n`);
console.log(`Missing buy link (${noBuy.length})`);
for (const i of noBuy) console.log(row(i));
console.log(`\nMissing maker link (${noMaker.length})`);
for (const i of noMaker) console.log(row(i));
console.log(
  `\nLinks: buy ${picks.length - noBuy.length}/${picks.length}, maker ${picks.length - noMaker.length}/${picks.length}\n`,
);
