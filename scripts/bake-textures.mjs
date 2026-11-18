// Bakes the paper, print, and wood textures into small static image tiles.
//
// The textures are SVG noise filters (feTurbulence). Rendering those live in the
// browser costs paint time on every page, so they are rasterized once here and
// committed. Run `pnpm textures` after changing a source below; the CSS in
// src/styles/textures.css references the outputs.
//
// Fine-grained tiles are baked at 1x and 2x (served with image-set) so the
// grain stays crisp on high-density screens. Smooth tiles only need 1x (or
// less). The output name is always the CSS tile size; "@2x" marks the dense copy.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const OUT_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../src/styles/textures");

const svg = (width, height, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${body}</svg>`;

/** Wood grain: stretched fractal noise, growth rings, pores, knots, dents, scratches. */
const wood = ({ seeds, base, extra = "" }) =>
  svg(
    640,
    420,
    `<filter id="w" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.0028 0.075" numOctaves="4" seed="${seeds[0]}" stitchTiles="stitch"/><feColorMatrix type="matrix" values="${base}"/></filter>` +
      `<filter id="rings" x="0" y="0" width="100%" height="100%"><feTurbulence type="turbulence" baseFrequency="0.0018 0.035" numOctaves="2" seed="${seeds[1]}" stitchTiles="stitch"/><feColorMatrix type="matrix" values="0 0 0 0 .12  0 0 0 0 .05  0 0 0 0 .02  -2.4 0 0 0 1.05"/></filter>` +
      `<filter id="pores" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.02 0.9" numOctaves="2" seed="${seeds[2]}" stitchTiles="stitch"/><feColorMatrix type="matrix" values="0 0 0 0 .08  0 0 0 0 .04  0 0 0 0 .01  1.6 0 0 0 -.78"/></filter>` +
      `<rect width="100%" height="100%" filter="url(#w)"/>` +
      `<rect width="100%" height="100%" filter="url(#rings)" opacity=".55"/>` +
      `<rect width="100%" height="100%" filter="url(#pores)" opacity=".7"/>` +
      `<g fill="#1e0f06" opacity=".35"><ellipse cx="380" cy="95" rx="22" ry="7"/><ellipse cx="150" cy="300" rx="16" ry="5"/></g>` +
      `<g fill="#1e0f06" opacity=".22"><ellipse cx="130" cy="110" rx="6" ry="2.2"/><ellipse cx="470" cy="210" rx="4" ry="1.6"/><ellipse cx="260" cy="320" rx="7" ry="2.5"/><ellipse cx="580" cy="370" rx="3" ry="1.2"/><ellipse cx="60" cy="350" rx="4" ry="1.5"/></g>` +
      `<g stroke="#f6dfb8" stroke-opacity=".2" stroke-width=".9" fill="none"><path d="M40 62 l150 -6"/><path d="M300 140 l120 4"/><path d="M90 260 l210 -3"/><path d="M420 330 l160 -8"/><path d="M520 40 l90 5"/><path d="M200 380 l140 2"/><path d="M10 190 l60 1"/></g>` +
      extra,
  );

/** Grayscale fractal noise at a given opacity (paper grain, fibers). */
const noise = (size, frequency, opacity, { octaves = 2, seed } = {}) =>
  svg(
    size,
    size,
    `<filter id="n"><feTurbulence type="fractalNoise" baseFrequency="${frequency}" numOctaves="${octaves}"${seed === undefined ? "" : ` seed="${seed}"`} stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/></filter>` +
      `<rect width="100%" height="100%" filter="url(#n)" opacity="${opacity}"/>`,
  );

/** Alpha-only noise, used as a mask (alpha = a * noise + b). */
const alphaNoise = (width, height, frequency, octaves, seed, a, b) =>
  svg(
    width,
    height,
    `<filter id="m" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="${frequency}" numOctaves="${octaves}" seed="${seed}" stitchTiles="stitch"/><feColorMatrix type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  ${a} 0 0 0 ${b}"/></filter>` +
      `<rect width="100%" height="100%" filter="url(#m)"/>`,
  );

const TEXTURES = [
  // Paper: fine grain and stretched pulp fibers (multiply layer).
  // Grain is the bottom layer of a multiply stack, so it is flattened onto white
  // (identical result under multiply, and a much smaller file).
  {
    name: "grain",
    source: noise(180, ".85", ".28"),
    scales: [1, 2],
    flatten: "#fff",
    quality: 100,
  },
  {
    name: "fibers",
    source: noise(520, ".006 .22", ".16", { octaves: 3, seed: 7 }),
    scales: [1],
    quality: 60,
  },
  // Foxing: small brown age spots (multiply layer).
  {
    name: "foxing",
    source: svg(
      700,
      700,
      `<defs><radialGradient id="s"><stop offset="0" stop-color="#955f23" stop-opacity=".35"/><stop offset="1" stop-color="#955f23" stop-opacity="0"/></radialGradient></defs>` +
        `<g fill="url(#s)"><circle cx="80" cy="120" r="5"/><circle cx="430" cy="60" r="3"/><circle cx="610" cy="390" r="6"/><circle cx="220" cy="540" r="4"/><circle cx="520" cy="630" r="3"/><circle cx="330" cy="300" r="2.5"/></g>`,
    ),
    scales: [1, 2],
  },
  // Dust and specks: white flecks (screen layer).
  {
    name: "dust",
    source: svg(
      420,
      420,
      `<g fill="#fff"><circle cx="37" cy="52" r=".9" opacity=".7"/><circle cx="211" cy="18" r=".6" opacity=".6"/><circle cx="330" cy="140" r="1.2" opacity=".5"/><circle cx="95" cy="300" r=".7" opacity=".7"/><circle cx="260" cy="370" r="1" opacity=".55"/><circle cx="390" cy="280" r=".6" opacity=".6"/><path d="M150 200 q8 -3 14 2" stroke="#fff" stroke-width=".6" fill="none" opacity=".45"/></g>`,
    ),
    scales: [1, 2],
  },
  // Wood: warm walnut (photo frames) and honey-oak planks (workbench).
  {
    name: "wood-warm",
    source: wood({
      seeds: [4, 7, 11],
      base: "0.46 0 0 0 0.33  0.2 0 0 0 0.14  0.09 0 0 0 0.06  0 0 0 0 1",
    }),
    scales: [1],
  },
  {
    name: "wood-floor",
    source: wood({
      seeds: [11, 14, 18],
      base: "0.44 0 0 0 0.3  0.26 0 0 0 0.17  0.13 0 0 0 0.07  0 0 0 0 1",
      extra:
        `<g stroke="#1e0f06" stroke-opacity=".6" stroke-width="2.2"><path d="M0 0H640"/><path d="M0 105H640"/><path d="M0 210H640"/><path d="M0 315H640"/></g>` +
        `<g stroke="#1e0f06" stroke-opacity=".5" stroke-width="1.6"><path d="M180 0v105"/><path d="M470 105v105"/><path d="M90 210v105"/><path d="M390 315v105"/></g>` +
        `<g stroke="#f0d3a6" stroke-opacity=".18" stroke-width="1"><path d="M0 2H640"/><path d="M0 107H640"/><path d="M0 212H640"/><path d="M0 317H640"/></g>`,
    }),
    scales: [1],
  },
  // Worn ink (cover type): speckled dropouts and large soft fades, used as masks.
  { name: "ink-speck", source: alphaNoise(240, 240, ".85", 2, 5, -10, 8.3), scales: [1, 2] },
  // Smooth, so half resolution is plenty (shown at 700×500 or larger).
  { name: "ink-fade", source: alphaNoise(700, 500, ".012", 3, 9, -1.5, 1.75), scales: [0.5] },
  // Fine grain for printed solids on the cover (masthead, band, sky fade).
  { name: "grain-fine", source: noise(160, ".95", ".55"), scales: [1], quality: 60 },
  // Cover scuffs: fine light scratches (soft-light layer).
  {
    name: "scuffs",
    source: svg(
      600,
      600,
      `<g stroke="#fff" fill="none" stroke-linecap="round"><path d="M40 80 q60 -8 130 -4" stroke-width="1.1" opacity=".5"/><path d="M420 140 l90 6" stroke-width=".8" opacity=".45"/><path d="M120 420 q40 6 110 -2" stroke-width="1" opacity=".4"/><path d="M360 520 l120 -10" stroke-width=".9" opacity=".45"/><path d="M520 300 l50 22" stroke-width=".7" opacity=".4"/><path d="M60 560 l70 -4" stroke-width=".8" opacity=".35"/></g>`,
    ),
    scales: [1, 2],
  },
];

await mkdir(OUT_DIR, { recursive: true });

for (const { name, source, scales, flatten, quality = 80 } of TEXTURES) {
  for (const scale of scales) {
    const file = `${name}${scale > 1 ? `@${scale}x` : ""}.webp`;
    let image = sharp(Buffer.from(source), { density: 72 * scale });
    if (flatten) image = image.flatten({ background: flatten });
    const data = await image.webp({ quality, alphaQuality: 90, effort: 6 }).toBuffer();
    await writeFile(resolve(OUT_DIR, file), data);
    console.log(`${file.padEnd(22)} ${(data.length / 1024).toFixed(1)} KB`);
  }
}
