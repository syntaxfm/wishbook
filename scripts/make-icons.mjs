// Makes the site icons from the grouse mascot, into public/:
//
//   pnpm icons
//
//   favicon.ico            16, 32, and 48 px (PNG-in-ICO), transparent
//   favicon-32.png         32 px, transparent, for browsers that prefer a PNG
//   apple-touch-icon.png   180 px on Syntax yellow (Apple icons must be opaque)
//   icon-192.png           192 px on Syntax yellow, for site.webmanifest
//   icon-512.png           512 px on Syntax yellow, for site.webmanifest
//
// The tab sizes crop tight to the grouse's face and elf hat, a little
// sharpened and saturated, so the hat, eye, and beak still read at 16 px. The
// home-screen sizes take the whole hat with its bell and the neck ruff, as a
// bust sitting on the icon's bottom edge. Crops are in the source's pixels.

import { writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const ROOT = process.cwd();
const SOURCE = join(ROOT, "assets/2026/generated/grouse-waving.webp");
const OUT = join(ROOT, "public");

/** Syntax yellow (--syntax), behind the opaque icons. */
const BACKGROUND = "#fabf46";

/** Square crops of the source: the tab sizes and the home-screen sizes. */
const CROPS = {
  tab: { left: 92, top: 10, size: 128 },
  home: { left: 60, top: 4, size: 162 },
};

/** The tail fan pokes into the home-screen crop's corner: cut it away first. */
const TAIL = "0,128 98,128 112,190 0,190";

async function source() {
  const { width, height } = await sharp(SOURCE).metadata();
  const mask = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><polygon points="${TAIL}"/></svg>`;
  return sharp(SOURCE)
    .composite([{ input: Buffer.from(mask), blend: "dest-out" }])
    .png()
    .toBuffer();
}

const art = await source();

/** The art cropped to a square and resized, transparent. */
function crop({ left, top, size: side }, size) {
  return sharp(art)
    .extract({ left, top, width: side, height: side })
    .resize(size, size, { kernel: "lanczos3" });
}

/** A tab icon: tight crop, a touch more colour and edge so it reads tiny. */
const tabIcon = (size) =>
  crop(CROPS.tab, size)
    .modulate({ saturation: 1.2 })
    .sharpen({ sigma: 0.5 })
    .png({ compressionLevel: 9 })
    .toBuffer();

/** A home-screen icon: the bust on an opaque square, its ruff on the bottom edge. */
async function homeIcon(size, fill = 0.88) {
  const bust = await crop(CROPS.home, Math.round(size * fill))
    .png()
    .toBuffer();
  return sharp({ create: { width: size, height: size, channels: 3, background: BACKGROUND } })
    .composite([{ input: bust, gravity: "south" }])
    .png({ compressionLevel: 9, palette: true, quality: 95 })
    .toBuffer();
}

/**
 * An ICO file holding PNG images (valid since Windows Vista and in every
 * browser): a 6-byte header, a 16-byte directory entry per image, then the PNGs.
 */
function ico(images) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(images.length, 4);
  let offset = header.length + images.length * 16;
  const entries = images.map(({ size, png }) => {
    const entry = Buffer.alloc(16);
    entry.writeUInt8(size >= 256 ? 0 : size, 0); // width (0 means 256)
    entry.writeUInt8(size >= 256 ? 0 : size, 1); // height
    entry.writeUInt8(0, 2); // palette colours: none
    entry.writeUInt8(0, 3); // reserved
    entry.writeUInt16LE(1, 4); // colour planes
    entry.writeUInt16LE(32, 6); // bits per pixel
    entry.writeUInt32LE(png.length, 8);
    entry.writeUInt32LE(offset, 12);
    offset += png.length;
    return entry;
  });
  return Buffer.concat([header, ...entries, ...images.map((i) => i.png)]);
}

const tab = await Promise.all(
  [16, 32, 48].map(async (size) => ({ size, png: await tabIcon(size) })),
);
const files = {
  "favicon.ico": ico(tab),
  "favicon-32.png": tab.find((t) => t.size === 32).png,
  "apple-touch-icon.png": await homeIcon(180),
  "icon-192.png": await homeIcon(192),
  "icon-512.png": await homeIcon(512),
};
for (const [name, data] of Object.entries(files)) {
  writeFileSync(join(OUT, name), data);
  console.log(`public/${name}  ${(data.length / 1024).toFixed(1)} KB`);
}
