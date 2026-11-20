// Re-encodes the source images under assets/ as WebP, in place.
//
//   pnpm optimize:assets            convert and report
//   pnpm optimize:assets --dry-run  report what would change, write nothing
//
// Every PNG and JPEG becomes a WebP with the same base name (the asset
// resolver ignores extensions, so ids and names keep working), at most
// MAX_SIDE px on its longest side (never upscaled), quality QUALITY, with
// lossless alpha so cutouts keep clean edges. A WebP that is already within
// MAX_SIDE is left alone, so running it again changes nothing. SVGs and AVIFs
// are skipped. The build makes the served sizes from these files; this only
// keeps the sources (and the repository) small.

import { existsSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from "node:fs";
import { join, relative, extname } from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const ASSETS = join(ROOT, "assets");
const MAX_SIDE = 2000;
const QUALITY = 90;
const RASTER_RE = /\.(?:png|jpe?g|webp)$/i;

const dryRun = process.argv.includes("--dry-run");

/** Every raster image under a directory, sorted. */
function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (RASTER_RE.test(entry.name)) out.push(full);
  }
  return out.toSorted();
}

const kb = (bytes) => `${(bytes / 1024).toFixed(0)} KB`;
const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

let before = 0;
let after = 0;
let changed = 0;
let failed = 0;

for (const file of walk(ASSETS)) {
  const rel = relative(ROOT, file);
  const size = statSync(file).size;
  before += size;
  const ext = extname(file).toLowerCase();
  const target = file.slice(0, -ext.length) + ".webp";

  // autoOrient applies any EXIF rotation, since the output drops metadata.
  const meta = await sharp(file, { autoOrient: true }).metadata();
  const longest = Math.max(meta.width ?? 0, meta.height ?? 0);
  if (ext === ".webp" && longest <= MAX_SIDE) {
    after += size;
    continue;
  }
  if (target !== file && existsSync(target)) {
    console.error(`  SKIP  ${rel}: ${relative(ROOT, target)} already exists`);
    after += size;
    failed++;
    continue;
  }

  const buffer = await sharp(file, { autoOrient: true })
    .resize({
      width: MAX_SIDE,
      height: MAX_SIDE,
      fit: "inside",
      withoutEnlargement: true,
    })
    .webp({ quality: QUALITY, alphaQuality: 100, smartSubsample: true, effort: 6 })
    .toBuffer({ resolveWithObject: true });

  const { width, height } = buffer.info;
  after += buffer.data.length;
  changed++;
  console.log(
    `  ${rel} (${meta.width}×${meta.height}, ${kb(size)}) → ${relative(ROOT, target)} (${width}×${height}, ${kb(buffer.data.length)})`,
  );
  if (dryRun) continue;
  writeFileSync(target + ".tmp", buffer.data);
  renameSync(target + ".tmp", target);
  if (target !== file) unlinkSync(file);
}

console.log(
  `\n${dryRun ? "Would convert" : "Converted"} ${changed} file(s): ${mb(before)} → ${mb(after)} under assets/` +
    (failed ? ` (${failed} skipped, see above)` : ""),
);
if (failed) process.exitCode = 1;
