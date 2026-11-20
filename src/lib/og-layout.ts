import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Resvg } from "@resvg/resvg-js";
import satori, { type Font } from "satori";
import sharp, { type PngOptions } from "sharp";
import type { OgCard, OgHost, OgImage, OgItem, OgPanel, OgPrice, OgRun, OgSection } from "./og";

/**
 * Share card layouts, drawn with Satori (flexbox only: no CSS filters, masks,
 * or blend modes). Photos are resized and color graded with sharp first; the
 * paper and print effects are baked texture layers composited onto the
 * rendered card.
 */

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

const root = (path: string) => resolve(process.cwd(), path);

// ---------------------------------------------------------------- tokens

const C = {
  red: "#C5301F",
  green: "#2A6E3B",
  yellow: "#F7D838",
  gold1: "#F3CF6A",
  gold2: "#B8862B",
  cream: "#F1E2C4",
  peach: "#F0CFAE",
  ink: "#2b2119",
  midnight: "#1C2A5A",
  navy: "#0e1530",
  bandText: "#f3e3b0",
  blackish: "#1d1d1d",
};

const F = {
  masthead: "Pinyon Script",
  display: "Playfair Display",
  item: "Old Standard TT",
  tru: "Gelasio",
  body: "Libre Caslon Text",
  kicker: "Antonio",
  mono: "JetBrains Mono",
  hand: "Permanent Marker",
};

/** The masthead word set in script beside the Syntax logo. */
const MASTHEAD = "WishBook";
/** Height of the masthead band at the bottom of most cards. */
const BAND = 78;
/** Card area above the band. */
const BODY_H = OG_HEIGHT - BAND;

const FONT_FILES: [name: string, pkg: string, weight: 400 | 700, style: "normal" | "italic"][] = [
  [F.masthead, "pinyon-script", 400, "normal"],
  [F.display, "playfair-display", 700, "italic"],
  [F.item, "old-standard-tt", 700, "normal"],
  [F.tru, "gelasio", 700, "normal"],
  [F.body, "libre-caslon-text", 400, "normal"],
  [F.body, "libre-caslon-text", 400, "italic"],
  [F.body, "libre-caslon-text", 700, "normal"],
  [F.kicker, "antonio", 700, "normal"],
  [F.mono, "jetbrains-mono", 400, "normal"],
  [F.hand, "permanent-marker", 400, "normal"],
];

let fonts: Promise<Font[]> | undefined;
/** The self-hosted fonts, as .woff from the @fontsource packages (Satori can't read woff2). */
function loadFonts() {
  fonts ??= Promise.all(
    FONT_FILES.map(async ([name, pkg, weight, style]) => ({
      name,
      weight,
      style,
      data: await readFile(
        root(`node_modules/@fontsource/${pkg}/files/${pkg}-latin-${weight}-${style}.woff`),
      ),
    })),
  );
  return fonts;
}

// ---------------------------------------------------------------- elements

type Style = Record<string, string | number | undefined>;
type Child = El | string | null | false | undefined | Child[];
export interface El {
  type: string;
  props: { style?: Style; children?: (El | string)[] } & Record<string, unknown>;
}

function flat(children: Child[]): (El | string)[] {
  const out: (El | string)[] = [];
  for (const c of children) {
    if (Array.isArray(c)) out.push(...flat(c));
    else if (c !== null && c !== false && c !== undefined && c !== "") out.push(c);
  }
  return out;
}

/** A div: flex and border-box by default. */
function h(style: Style, ...children: Child[]): El {
  return {
    type: "div",
    props: {
      style: { display: "flex", boxSizing: "border-box", ...style },
      children: flat(children),
    },
  };
}
const span = (style: Style, text: string): El => ({
  type: "span",
  props: { style, children: [text] },
});
const abs = (style: Style, ...children: Child[]) =>
  h({ position: "absolute", ...style }, ...children);

const display = (fontSize: number, color: string): Style => ({
  fontFamily: F.display,
  fontWeight: 700,
  fontStyle: "italic",
  fontSize,
  color,
  lineHeight: 1.02,
});
const kicker = (fontSize: number, color: string, spacing = 0.05): Style => ({
  fontFamily: F.kicker,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: fontSize * spacing,
  fontSize,
  color,
  lineHeight: 1.1,
});
const itemName = (fontSize: number, color = C.ink): Style => ({
  fontFamily: F.item,
  fontWeight: 700,
  textTransform: "uppercase",
  fontSize,
  color,
  lineHeight: 1.1,
});
/** Ink misregistration on big type: a dark plate and a faint red plate, slightly off. */
const misreg = (size: number, dark = "rgba(36,20,4,.55)") =>
  `${(size * 0.03).toFixed(1)}px ${(size * 0.035).toFixed(1)}px 0 ${dark}, -${(size * 0.012).toFixed(1)}px -${(size * 0.008).toFixed(1)}px 0 rgba(220,40,60,.3)`;

/** Title size by length, so long page titles still fit their column. */
function titleSize(text: string, sizes: [number, number, number]) {
  if (text.length <= 16) return sizes[0];
  if (text.length <= 28) return sizes[1];
  return sizes[2];
}

/** Clamps runs of copy to about `max` characters, ending in an ellipsis. */
function clampRuns(runs: OgRun[], max: number): OgRun[] {
  const out: OgRun[] = [];
  let left = max;
  for (const r of runs) {
    if (left <= 0) break;
    if (r.text.length <= left) {
      out.push(r);
      left -= r.text.length;
      continue;
    }
    const cut = r.text.slice(0, left).replace(/\s+\S*$/, "");
    out.push({ ...r, text: `${cut.replace(/[\s,;:.]+$/, "")}…` });
    break;
  }
  return out;
}

function richText(runs: OgRun[], style: Style): El {
  return {
    type: "div",
    props: {
      style: { display: "block", ...style },
      children: runs.map((r) =>
        span(
          {
            fontWeight: r.bold ? 700 : 400,
            fontStyle: r.italic && !r.bold ? "italic" : "normal",
          },
          r.text,
        ),
      ),
    },
  };
}

// ---------------------------------------------------------------- images

interface Prepared {
  src: string;
  width: number;
  height: number;
}

interface PrepOptions {
  fit: "cover" | "contain";
  /** Focal point for "cover" crops, 0–1. */
  focus?: { x: number; y: number };
  /** Fade the edges into the background (photos shot on their own background). */
  fade?: boolean;
  /** Fade the left edge over this many pixels (art bleeding into a panel). */
  fadeLeft?: number;
  /** A baked drop shadow under a cut-out. */
  shadow?: boolean;
  /** The catalog's photo color grade (default on). */
  grade?: boolean;
}

/** Sepia at a given strength, as a color matrix. */
function sepia(
  a: number,
): [[number, number, number], [number, number, number], [number, number, number]] {
  const s = [
    [0.393, 0.769, 0.189],
    [0.349, 0.686, 0.168],
    [0.272, 0.534, 0.131],
  ];
  return s.map((row, i) => row.map((v, j) => (i === j ? 1 - a : 0) + a * v)) as never;
}

const prepCache = new Map<string, Promise<Prepared>>();

/** Resizes, grades, and encodes a local image as a data URI for Satori. */
function prepImage(file: string, w: number, bh: number, opts: PrepOptions): Promise<Prepared> {
  const key = JSON.stringify([file, w, bh, opts]);
  let found = prepCache.get(key);
  if (!found) {
    found = doPrepImage(file, Math.round(w), Math.round(bh), opts);
    prepCache.set(key, found);
  }
  return found;
}

async function doPrepImage(
  file: string,
  w: number,
  bh: number,
  opts: PrepOptions,
): Promise<Prepared> {
  const path = root(`.${file}`);
  const input = await readFile(path);
  const meta = await sharp(input, { density: 144 }).metadata();
  const sw = meta.width ?? w;
  const sh = meta.height ?? bh;
  let img = sharp(input, { density: 144 }).rotate();
  let width: number;
  let height: number;

  if (opts.fit === "cover") {
    const scale = Math.max(w / sw, bh / sh);
    const rw = Math.max(w, Math.round(sw * scale));
    const rh = Math.max(bh, Math.round(sh * scale));
    const fx = opts.focus?.x ?? 0.5;
    const fy = opts.focus?.y ?? 0.5;
    const left = Math.min(rw - w, Math.max(0, Math.round(rw * fx - w / 2)));
    const top = Math.min(rh - bh, Math.max(0, Math.round(rh * fy - bh / 2)));
    img = img.resize(rw, rh).extract({ left, top, width: w, height: bh });
    width = w;
    height = bh;
  } else {
    const scale = Math.min(w / sw, bh / sh);
    width = Math.max(1, Math.round(sw * scale));
    height = Math.max(1, Math.round(sh * scale));
    img = img.resize(width, height);
  }

  if (opts.grade !== false) {
    img = img.recomb(sepia(0.12)).modulate({ saturation: 1.1 }).linear(1.05, -6);
  }

  const stats = await img.clone().stats();
  let alpha = !stats.isOpaque;
  let out = await img.png().toBuffer();

  if (opts.fade || opts.fadeLeft) {
    const gradient = opts.fadeLeft
      ? `<linearGradient id="g" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="${opts.fadeLeft}" y2="0"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="1"/></linearGradient>`
      : `<radialGradient id="g" cx="50%" cy="50%" r="50%"><stop offset="0.62" stop-color="#000" stop-opacity="1"/><stop offset="0.98" stop-color="#000" stop-opacity="0"/></radialGradient>`;
    const mask = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><defs>${gradient}</defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`,
    );
    out = await sharp(out)
      .ensureAlpha()
      .composite([{ input: mask, blend: "dest-in" }])
      .png()
      .toBuffer();
    alpha = true;
  }

  if (opts.shadow && alpha) {
    const pad = Math.round(Math.min(width, height) * 0.12);
    const drop = Math.round(pad * 0.45);
    const { data } = await sharp(out).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const shadow = Buffer.alloc(width * height * 4);
    for (let i = 0; i < width * height; i++) shadow[i * 4 + 3] = Math.round(data[i * 4 + 3]! * 0.5);
    out = await sharp(shadow, { raw: { width, height, channels: 4 } })
      .extend({
        top: pad,
        bottom: pad,
        left: pad,
        right: pad,
        background: { r: 0, g: 0, b: 0, alpha: 0 },
      })
      .blur(pad / 3)
      .composite([{ input: out, left: pad, top: pad - drop }])
      .png()
      .toBuffer();
    width += pad * 2;
    height += pad * 2;
  }

  const data = alpha
    ? `data:image/png;base64,${(await sharp(out).png({ compressionLevel: 9 }).toBuffer()).toString("base64")}`
    : `data:image/jpeg;base64,${(await sharp(out).flatten({ background: "#fff" }).jpeg({ quality: 86 }).toBuffer()).toString("base64")}`;
  return { src: data, width, height };
}

const img = (p: Prepared, style: Style = {}): El => ({
  type: "img",
  props: {
    src: p.src,
    width: p.width,
    height: p.height,
    style: { width: p.width, height: p.height, ...style },
  },
});

/** A missing image: a solid color block with its label. */
function placeholder(
  p: { label: string; color: string },
  w: number,
  hgt: number,
  style: Style = {},
  small = false,
): El {
  return h(
    {
      width: w,
      height: hgt,
      backgroundColor: p.color,
      alignItems: "center",
      justifyContent: "center",
      padding: small ? 4 : 16,
      ...style,
    },
    small
      ? null
      : h(
          {
            fontFamily: F.mono,
            fontSize: Math.max(12, Math.min(18, Math.round(w / 22))),
            lineHeight: 1.35,
            color: "rgba(255,255,255,.92)",
            textAlign: "center",
            maxWidth: w - 32,
          },
          p.label,
        ),
  );
}

/** An image or its placeholder, sized to the box. */
async function picture(
  image: OgImage,
  w: number,
  hgt: number,
  opts: PrepOptions,
  style: Style = {},
): Promise<El> {
  if (image.kind === "placeholder") return placeholder(image, w, hgt, style);
  return img(await prepImage(image.file, w, hgt, opts), style);
}

let logo: Promise<string> | undefined;
/** The Syntax logo, rasterized once. */
function logoSrc() {
  logo ??= (async () => {
    const png = await sharp(await readFile(root("assets/brand/syntax-logo-wide-stacked.svg")), {
      density: 72,
    })
      .resize({ height: 160 })
      .png()
      .toBuffer();
    return `data:image/png;base64,${png.toString("base64")}`;
  })();
  return logo;
}
const LOGO_RATIO = 2650 / 803;

async function logoEl(height: number, style: Style = {}): Promise<El> {
  const width = Math.round(height * LOGO_RATIO);
  return {
    type: "img",
    props: { src: await logoSrc(), width, height, style: { width, height, ...style } },
  };
}

// ---------------------------------------------------------------- pieces

/** Black square, white letter, red offset shadow. */
function letterBox(letter: string, size: number, style: Style = {}): El {
  return h(
    {
      width: size,
      height: size,
      backgroundColor: "#000",
      color: "#fff",
      boxShadow: `${Math.round(size * 0.14)}px ${Math.round(size * 0.14)}px 0 ${C.red}`,
      alignItems: "center",
      justifyContent: "center",
      fontFamily: F.item,
      fontWeight: 700,
      fontSize: Math.round(size * 0.6),
      lineHeight: 1,
      ...style,
    },
    letter,
  );
}

/** Dollars with superscript cents: 67⁹⁰. */
function amount(
  price: { whole: string; cents: string },
  size: number,
  color: string,
  font = F.item,
  style: Style = {},
): El {
  return h(
    { alignItems: "flex-start", fontFamily: font, fontWeight: 700, color, lineHeight: 1, ...style },
    span({ fontSize: size }, price.whole),
    span(
      { fontSize: Math.round(size * 0.48), marginTop: Math.round(size * 0.06), marginLeft: 1 },
      price.cents,
    ),
  );
}

/** The yellow price box with a red offset shadow. */
function priceBox(price: OgPrice, size: number, style: Style = {}): El {
  const inner =
    "label" in price
      ? span({ fontFamily: F.tru, fontWeight: 700, fontSize: Math.round(size * 0.62) }, price.label)
      : h(
          { alignItems: "flex-end" },
          amount(price, size, C.ink, F.tru),
          price.estimate
            ? span(
                {
                  fontFamily: F.body,
                  fontStyle: "italic",
                  fontSize: Math.round(size * 0.36),
                  marginLeft: 4,
                  marginBottom: 3,
                },
                "est.",
              )
            : null,
        );
  return h(
    {
      backgroundColor: C.yellow,
      border: "1px solid #c9a800",
      boxShadow: `${Math.round(size * 0.14)}px ${Math.round(size * 0.14)}px 0 ${C.red}`,
      padding: `${Math.round(size * 0.04)}px ${Math.round(size * 0.24)}px`,
      color: C.ink,
      ...style,
    },
    inner,
  );
}

/** "$13.99 est." for list rows. */
function priceText(price: OgPrice | null, size: number): El | null {
  if (!price) return null;
  if ("label" in price) return span({ ...itemName(size), textTransform: "none" }, price.label);
  return h(
    { alignItems: "flex-end" },
    span(
      { fontFamily: F.item, fontWeight: 700, fontSize: size, color: C.ink },
      `$${price.whole}.${price.cents}`,
    ),
    price.estimate
      ? span(
          {
            fontFamily: F.body,
            fontStyle: "italic",
            fontSize: Math.round(size * 0.7),
            color: C.ink,
            marginLeft: 4,
          },
          "est.",
        )
      : null,
  );
}

function sectionTab(section: OgSection | null, style: Style = {}): El | null {
  if (!section) return null;
  return h(
    {
      alignSelf: "flex-start",
      backgroundColor: section.color,
      color: "#fff",
      fontFamily: F.tru,
      fontWeight: 700,
      fontSize: 24,
      lineHeight: 1,
      padding: "11px 22px 12px 48px",
      boxShadow: "2px 3px 0 rgba(43,33,25,.35)",
      ...style,
    },
    section.tabLabel,
  );
}

async function avatar(host: OgHost, size: number): Promise<El> {
  const ring: Style = {
    borderRadius: size / 2,
    border: "3px solid #fff",
    boxShadow: "0 2px 5px rgba(0,0,0,.35)",
  };
  if (host.image.kind === "placeholder") return placeholder(host.image, size, size, ring, true);
  return img(
    await prepImage(host.image.file, size, size, { fit: "cover", focus: { x: 0.5, y: 0.4 } }),
    ring,
  );
}

async function pickedBy(hosts: OgHost[], size = 54): Promise<El | null> {
  if (!hosts.length) return null;
  const names = hosts.map((x) => x.shortName);
  const label = names.length > 1 ? `${names.slice(0, -1).join(", ")} & ${names.at(-1)}` : names[0]!;
  const avatars = await Promise.all(hosts.slice(0, 3).map((x) => avatar(x, size)));
  return h(
    { alignItems: "center" },
    h({}, ...avatars.map((a, i) => h({ marginLeft: i ? -size * 0.28 : 0 }, a))),
    h(
      { flexDirection: "column", marginLeft: 14 },
      span({ fontFamily: F.body, fontStyle: "italic", fontSize: 17, color: C.ink }, "Picked by"),
      span({ ...itemName(22, C.red) }, label),
    ),
  );
}

/** A product photo in a red-ruled frame, with its letter and price box. */
async function frame(
  item: OgItem,
  w: number,
  hgt: number,
  opts: { size?: number; style?: Style } = {},
): Promise<El> {
  const size = opts.size ?? 36;
  const dark = item.image.kind === "image" && item.image.dark;
  const pad = Math.round(Math.min(w, hgt) * 0.06);
  const photo = await picture(
    item.image,
    item.image.kind === "image" ? w - 6 - pad * 2 : w - 6,
    item.image.kind === "image" ? hgt - 6 - pad * 2 : hgt - 6,
    { fit: "contain" },
  );
  return h(
    {
      position: "relative",
      width: w,
      height: hgt,
      border: `3px solid ${C.red}`,
      backgroundColor: dark ? C.blackish : "#fff",
      alignItems: "center",
      justifyContent: "center",
      ...opts.style,
    },
    photo,
    letterBox(item.letter, size, { position: "absolute", top: 10, left: 10 }),
    item.price
      ? priceBox(item.price, Math.round(size * 0.95), {
          position: "absolute",
          right: 12,
          bottom: 12,
        })
      : null,
  );
}

/** One line of an item list: letter, name, dot leader, price. */
function itemRow(item: OgItem, size = 19): El {
  return h(
    { alignItems: "flex-end", width: "100%", marginTop: 9 },
    letterBox(item.letter, size + 7, { marginRight: 12, marginBottom: 2, flexShrink: 0 }),
    span(
      {
        ...itemName(size),
        flexShrink: 1,
        minWidth: 0,
        overflow: "hidden",
        whiteSpace: "nowrap",
        textOverflow: "ellipsis",
      },
      item.name,
    ),
    h({
      flexGrow: 1,
      borderBottom: `2px dotted ${C.ink}`,
      margin: "0 6px 6px",
      minWidth: 12,
      opacity: 0.6,
    }),
    h({ flexShrink: 0 }, priceText(item.price, size + 1)),
  );
}

/** The masthead lockup: the Syntax logo with "WishBook" in script. */
async function masthead(size: number, color = C.gold1): Promise<El> {
  return h(
    { alignItems: "center" },
    await logoEl(Math.round(size * 0.62), { marginTop: Math.round(size * 0.04) }),
    span(
      {
        fontFamily: F.masthead,
        fontSize: size,
        color,
        lineHeight: 1,
        marginLeft: Math.round(size * 0.14),
        paddingRight: Math.round(size * 0.1),
        textShadow: misreg(size, "rgba(20,12,4,.7)"),
      },
      MASTHEAD,
    ),
  );
}

/** The green masthead band along the bottom, with the site and the folio. */
async function band(card: OgCard): Promise<El> {
  const folio = card.folio
    ? h(
        {
          height: "100%",
          alignItems: "center",
          padding: "0 26px",
          marginLeft: 28,
          backgroundColor: card.side === "left" ? C.green : C.yellow,
          borderLeft: card.side === "left" ? `2px solid ${C.gold1}` : "none",
          color: card.side === "left" ? "#fff" : C.ink,
        },
        span({ fontFamily: F.item, fontWeight: 700, fontSize: 34, lineHeight: 1 }, card.folio),
      )
    : null;
  return abs(
    {
      left: 0,
      right: 0,
      bottom: 0,
      height: BAND,
      alignItems: "center",
      borderTop: `5px solid ${C.gold1}`,
      backgroundImage: "linear-gradient(180deg, #2c7640, #1e5a2f)",
      paddingLeft: 34,
    },
    await masthead(52),
    h({ flexGrow: 1 }),
    h(
      { flexDirection: "column", alignItems: "flex-end", paddingRight: folio ? 0 : 34 },
      span(kicker(15, C.bandText, 0.12), `${MASTHEAD} ${card.edition}`),
      span({ ...kicker(24, "#fff", 0.04), marginTop: 2 }, card.brand.site),
    ),
    folio,
  );
}

function paper(...children: Child[]): El {
  return h(
    {
      position: "relative",
      width: OG_WIDTH,
      height: OG_HEIGHT,
      backgroundColor: C.cream,
      fontFamily: F.body,
      color: C.ink,
      overflow: "hidden",
    },
    ...children,
  );
}

/** The left column shared by text-led cards: section tab, title, kicker. */
function headColumn(
  card: OgCard,
  kickerText: string | null,
  width: number,
  sizes: [number, number, number],
  extra: Child[] = [],
): El {
  const size = titleSize(card.title, sizes);
  return abs(
    {
      left: 0,
      top: 0,
      width,
      height: BODY_H,
      flexDirection: "column",
      padding: "34px 28px 28px 48px",
    },
    card.section
      ? sectionTab(card.section, { marginLeft: -48, marginBottom: 22 })
      : h({ height: 16 }),
    kickerText ? span({ ...kicker(20, C.green, 0.06), marginBottom: 10 }, kickerText) : null,
    h(
      {
        ...display(size, C.red),
        textShadow: misreg(size, "rgba(80,20,10,.25)"),
        lineClamp: 3,
        display: "block",
      },
      card.title,
    ),
    ...extra,
  );
}

// ---------------------------------------------------------------- variants

type Of<V extends OgCard["variant"]> = Extract<OgCard, { variant: V }>;

async function coverCard(card: Of<"cover">): Promise<El> {
  const artW = 640;
  const bandH = 116;
  const art = await picture(card.art, artW, OG_HEIGHT - bandH + 6, {
    fit: "cover",
    focus: { x: 0.5, y: 0.4 },
    fadeLeft: 200,
  });
  return paper(
    abs({
      inset: 0,
      backgroundImage: `linear-gradient(180deg, ${C.navy} 0%, #16214a 60%, ${C.midnight} 100%)`,
    }),
    abs({ right: 0, top: 0 }, art),
    card.price
      ? abs(
          {
            right: 28,
            top: 22,
            padding: "2px 14px",
            backgroundColor: C.red,
            boxShadow: "4px 4px 0 rgba(20,12,4,.55)",
            ...itemName(40, C.yellow),
            letterSpacing: 4,
            textShadow: "2px 2px 0 rgba(0,0,0,.45)",
          },
          card.price,
        )
      : null,
    abs(
      { left: 56, top: 50, flexDirection: "column", width: 640 },
      span(kicker(22, C.gold1, 0.3), `${MASTHEAD} ${card.edition}`),
      await logoEl(104, { marginTop: 18 }),
      span(
        {
          fontFamily: F.masthead,
          fontSize: 172,
          lineHeight: 1,
          marginTop: -18,
          paddingRight: 30,
          color: C.gold1,
          backgroundImage:
            "linear-gradient(180deg, #fff0bf 0%, #f0c95e 30%, #c8952f 62%, #e9c46a 100%)",
          backgroundClip: "text",
          textShadow: "4px 5px 0 rgba(36,20,4,.9), -1px -1px 0 rgba(200,40,40,.3)",
        },
        MASTHEAD,
      ),
    ),
    abs(
      {
        left: 0,
        right: 0,
        bottom: 0,
        height: bandH,
        borderTop: `7px solid ${C.gold1}`,
        backgroundImage:
          "radial-gradient(ellipse 70% 120% at 30% 0%, rgba(255,255,220,.10), rgba(255,255,220,0) 60%), linear-gradient(180deg, #2c7640, #1e5a2f)",
        flexDirection: "column",
        justifyContent: "center",
        padding: "0 40px 0 48px",
        color: "#fff",
      },
      // As on the page: the tagline across the band, then the note and the
      // order line ("Order by terminal / $ curl …") side by side under it.
      card.tagline
        ? span(
            {
              ...display(33, "#fff"),
              whiteSpace: "nowrap",
              textShadow: misreg(33, "rgba(10,30,15,.6)"),
            },
            card.tagline,
          )
        : null,
      h(
        { alignItems: "flex-end", justifyContent: "space-between", marginTop: 4 },
        span(
          { ...kicker(19, C.bandText, 0.08), flexShrink: 1 },
          // The site address once: the order line may already print it ("$ curl wishbook…").
          [card.note, card.line?.text.includes(card.brand.site) ? null : card.brand.site]
            .filter(Boolean)
            .join("  ·  "),
        ),
        card.line
          ? h(
              { flexDirection: "column", alignItems: "flex-end", marginLeft: 24, flexShrink: 0 },
              card.line.kicker ? span(kicker(17, C.bandText, 0.08), card.line.kicker) : null,
              span(
                {
                  fontFamily: F.mono,
                  fontSize: 21,
                  color: C.yellow,
                  whiteSpace: "nowrap",
                  marginTop: 2,
                  textShadow: misreg(21, "rgba(10,30,15,.6)"),
                },
                card.line.text,
              ),
            )
          : null,
      ),
    ),
  );
}

async function dividerCard(card: Of<"divider">): Promise<El> {
  const color = card.section?.color ?? C.red;
  const artW = 560;
  const artH = 430;
  const art = await picture(card.art, artW, artH, { fit: "cover" });
  const inset = card.inset ? await picture(card.inset, 150, 150, { fit: "cover" }) : null;
  return paper(
    abs(
      {
        left: 0,
        top: 0,
        width: 540,
        height: BODY_H,
        backgroundColor: color,
        backgroundImage:
          "radial-gradient(ellipse 90% 80% at 30% 20%, rgba(255,255,255,.12), rgba(0,0,0,0) 60%), linear-gradient(180deg, rgba(0,0,0,0) 50%, rgba(0,0,0,.25) 100%)",
        flexDirection: "column",
        padding: "56px 44px 34px 52px",
        color: "#fff",
      },
      card.section?.kicker
        ? span({ ...kicker(24, C.bandText, 0.08), marginBottom: 14 }, card.section.kicker)
        : null,
      h(
        {
          ...display(titleSize(card.title, [86, 72, 60]), "#fff"),
          textShadow: misreg(80, "rgba(0,0,0,.35)"),
          display: "block",
          lineClamp: 3,
        },
        card.title,
      ),
      h({ width: 90, height: 5, backgroundColor: C.gold1, marginTop: 26, marginBottom: 20 }),
      card.count
        ? span(
            kicker(28, C.yellow, 0.06),
            `${card.count} ${card.count === 1 ? "gift" : "gifts"} inside`,
          )
        : null,
      h(
        { flexDirection: "column", marginTop: "auto" },
        ...card.pages.slice(0, 4).map((p) =>
          span(
            {
              fontFamily: F.body,
              fontStyle: "italic",
              fontSize: 19,
              color: "rgba(255,255,255,.88)",
              marginTop: 4,
              lineClamp: 1,
            },
            `· ${p}`,
          ),
        ),
      ),
    ),
    abs(
      {
        left: 590,
        top: 50,
        padding: 10,
        backgroundColor: "#fff",
        boxShadow: "0 8px 22px rgba(43,33,25,.35)",
        transform: "rotate(1.2deg)",
      },
      art,
    ),
    inset
      ? abs(
          {
            left: 1010,
            top: 380,
            border: `7px solid ${C.cream}`,
            boxShadow: "0 6px 14px rgba(0,0,0,.35)",
            transform: "rotate(-3deg)",
          },
          inset,
        )
      : null,
    await band(card),
  );
}

async function itemsCard(card: Of<"items">): Promise<El> {
  const shown = (() => {
    const real = card.items.filter((i) => i.image.kind === "image");
    const rest = card.items.filter((i) => i.image.kind !== "image");
    return [...real, ...rest].slice(0, 3).toSorted((a, b) => a.letter.localeCompare(b.letter));
  })();
  const W = 690;
  const H = BODY_H - 34 - 34;
  const gap = 16;
  let frames: El;
  if (shown.length === 1) {
    frames = await frame(shown[0]!, W, H, { size: 46 });
  } else if (shown.length === 2) {
    const w = (W - gap) / 2;
    frames = h(
      { gap },
      await frame(shown[0]!, w, H, { size: 42 }),
      await frame(shown[1]!, w, H, { size: 42 }),
    );
  } else {
    const big = 380;
    const sw = W - big - gap;
    const sh = (H - gap) / 2;
    frames = h(
      { gap },
      await frame(shown[0]!, big, H, { size: 42 }),
      h(
        { flexDirection: "column", gap },
        await frame(shown[1]!, sw, sh),
        await frame(shown[2]!, sw, sh),
      ),
    );
  }
  const rows = card.items.slice(0, card.more ? 4 : 5);
  const extra = card.items.length - rows.length;
  return paper(
    headColumn(
      card,
      card.kicker,
      470,
      [60, 52, 44],
      [
        card.hosts.length ? h({ marginTop: 20 }, await pickedBy(card.hosts)) : null,
        h(
          { flexDirection: "column", marginTop: "auto", width: "100%" },
          ...rows.map((i) => itemRow(i)),
          extra > 0
            ? span(
                {
                  fontFamily: F.body,
                  fontStyle: "italic",
                  fontSize: 18,
                  marginTop: 10,
                  color: C.ink,
                },
                `…and ${extra} more on this page`,
              )
            : null,
        ),
      ],
    ),
    abs({ left: 480, top: 34 }, frames),
    await band(card),
  );
}

const HOLIDAY_STAGE = [
  "radial-gradient(circle at 12% 18%, rgba(214,40,40,.75) 0%, rgba(214,40,40,.75) 5%, rgba(214,40,40,0) 9%)",
  "radial-gradient(circle at 8% 32%, rgba(255,170,160,.55) 0%, rgba(255,170,160,.55) 1.2%, rgba(255,170,160,0) 2%)",
  "radial-gradient(circle at 88% 14%, rgba(240,190,80,.55) 0%, rgba(240,190,80,.55) 4%, rgba(240,190,80,0) 8%)",
  "radial-gradient(circle at 94% 56%, rgba(214,40,40,.45) 0%, rgba(214,40,40,.45) 3%, rgba(214,40,40,0) 7%)",
  "radial-gradient(circle at 18% 86%, rgba(240,190,80,.35) 0%, rgba(240,190,80,.35) 5%, rgba(240,190,80,0) 10%)",
  "radial-gradient(ellipse 70% 60% at 50% 45%, #3d8a52 0%, #1d5530 55%, #0d2c18 100%)",
].join(", ");
const BENCH_STAGE =
  "radial-gradient(ellipse 60% 55% at 50% 42%, #fbf1dc 0%, #eedcb7 45%, #c9a573 80%, #9a7446 100%)";

async function featureCard(card: Of<"feature">): Promise<El> {
  const stageW = 650;
  const holiday = card.stage === "holiday";
  const shot =
    card.item.image.kind === "image"
      ? img(
          await prepImage(card.item.image.file, holiday ? 520 : 540, holiday ? 410 : 430, {
            fit: "contain",
            shadow: holiday,
            fade: !holiday,
          }),
        )
      : placeholder(card.item.image, 420, 340);
  const price = card.item.price;
  const priceEl =
    price && !("label" in price)
      ? abs(
          { right: 34, bottom: BAND + 22, flexDirection: "column", alignItems: "flex-end" },
          h(
            { alignItems: "flex-end" },
            span(
              {
                ...display(46, holiday ? "#fff" : C.ink),
                marginRight: 10,
                marginBottom: 22,
                textShadow: holiday ? "2px 2px 0 rgba(0,0,0,.35)" : "none",
              },
              "only",
            ),
            amount(price, price.whole.length > 2 ? 120 : 150, holiday ? "#fff" : C.red, F.item, {
              textShadow: holiday
                ? misreg(150, "rgba(0,0,0,.45)")
                : "5px 5px 0 rgba(255,250,235,.9)",
            }),
          ),
          h(
            { alignItems: "flex-end", marginTop: -6 },
            span(
              {
                ...display(30, holiday ? "#fff" : C.ink),
                textShadow: holiday ? "2px 2px 0 rgba(0,0,0,.35)" : "none",
              },
              price.unit,
            ),
            price.estimate
              ? span(
                  {
                    fontFamily: F.body,
                    fontStyle: "italic",
                    fontSize: 20,
                    marginLeft: 8,
                    color: holiday ? "#fff" : C.ink,
                  },
                  "est.",
                )
              : null,
          ),
        )
      : price
        ? abs({ right: 34, bottom: BAND + 30 }, priceBox(price, 50))
        : null;

  const headline = card.headline;
  const hsize = titleSize(headline, [64, 54, 46]);
  return paper(
    abs(
      {
        left: 0,
        top: 0,
        width: OG_WIDTH - stageW,
        height: BODY_H,
        flexDirection: "column",
        padding: "34px 36px 26px 48px",
      },
      card.section
        ? sectionTab(card.section, { marginLeft: -48, marginBottom: 22 })
        : h({ height: 12 }),
      card.item.brand
        ? span({ ...itemName(19, C.green), letterSpacing: 6, marginBottom: 10 }, card.item.brand)
        : null,
      h(
        {
          ...display(hsize, C.ink),
          textShadow: misreg(hsize, "rgba(120,30,20,.25)"),
          display: "block",
          lineClamp: 3,
        },
        headline,
      ),
      card.body
        ? richText(clampRuns(card.body, 170), {
            fontSize: 21,
            lineHeight: 1.42,
            marginTop: 18,
            color: C.ink,
          })
        : null,
      h({ marginTop: "auto" }, await pickedBy(card.hosts, 58)),
    ),
    abs(
      {
        right: 0,
        top: 0,
        width: stageW,
        height: BODY_H,
        backgroundImage: holiday ? HOLIDAY_STAGE : BENCH_STAGE,
        alignItems: "center",
        justifyContent: "center",
        paddingBottom: holiday ? 70 : 60,
        borderLeft: `8px solid ${C.red}`,
      },
      shot,
    ),
    letterBox(card.item.letter, 46, {
      position: "absolute",
      left: OG_WIDTH - stageW + 26,
      top: 24,
    }),
    priceEl,
    await band(card),
  );
}

async function centerfoldCard(card: Of<"centerfold">): Promise<El> {
  const artW = 790;
  const artH = BODY_H;
  let art: El;
  let place = (x: number, y: number) => ({ x: (x / 100) * artW, y: (y / 100) * artH });
  if (card.art.kind === "image") {
    // Same crop math as the image prep, so hotspots land on the art.
    const meta = await sharp(root(`.${card.art.file}`)).metadata();
    const sw = meta.width ?? artW;
    const sh = meta.height ?? artH;
    const scale = Math.max(artW / sw, artH / sh);
    const rw = Math.max(artW, Math.round(sw * scale));
    const rh = Math.max(artH, Math.round(sh * scale));
    const fx = card.focal.x / 100;
    const fy = card.focal.y / 100;
    const left = Math.min(rw - artW, Math.max(0, Math.round(rw * fx - artW / 2)));
    const top = Math.min(rh - artH, Math.max(0, Math.round(rh * fy - artH / 2)));
    place = (x, y) => ({ x: (x / 100) * rw - left, y: (y / 100) * rh - top });
    art = img(
      await prepImage(card.art.file, artW, artH, { fit: "cover", focus: { x: fx, y: fy } }),
    );
  } else {
    art = placeholder(card.art, artW, artH);
  }
  const dot = 34;
  const dots = card.hotspots
    .map((s) => ({ s, p: place(s.x, s.y) }))
    .filter(
      ({ p }) => p.x > dot / 2 && p.x < artW - dot / 2 && p.y > dot / 2 && p.y < artH - dot / 2,
    )
    .map(({ s, p }) =>
      abs(
        {
          left: p.x - dot / 2,
          top: p.y - dot / 2,
          width: dot,
          height: dot,
          borderRadius: dot / 2,
          border: "3px solid #fff",
          backgroundColor: C.red,
          color: "#fff",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: F.item,
          fontWeight: 700,
          fontSize: 16,
          boxShadow: "0 2px 6px rgba(0,0,0,.45)",
        },
        String(s.n),
      ),
    );
  const list = card.hotspots.slice(0, 10);
  return paper(
    abs({ left: 0, top: 0 }, art),
    ...dots,
    abs(
      {
        right: 22,
        top: 22,
        width: 390,
        height: BODY_H - 44,
        backgroundColor: "rgba(241,226,196,.97)",
        border: `4px solid ${C.red}`,
        boxShadow: "0 6px 18px rgba(0,0,0,.35)",
        flexDirection: "column",
        padding: "20px 24px",
      },
      card.kicker ? span(kicker(20, C.green, 0.12), card.kicker) : null,
      h(
        {
          ...display(titleSize(card.title, [44, 38, 32]), C.red),
          marginTop: 6,
          display: "block",
          lineClamp: 2,
        },
        card.title,
      ),
      card.subhead
        ? span(
            { fontFamily: F.body, fontStyle: "italic", fontSize: 19, marginTop: 8 },
            card.subhead,
          )
        : null,
      h(
        { flexDirection: "column", marginTop: 12 },
        ...list.map((s) =>
          h(
            { alignItems: "center", marginTop: 6 },
            h(
              {
                width: 25,
                height: 25,
                borderRadius: 13,
                backgroundColor: C.red,
                color: "#fff",
                alignItems: "center",
                justifyContent: "center",
                fontFamily: F.item,
                fontWeight: 700,
                fontSize: 13,
                flexShrink: 0,
              },
              String(s.n),
            ),
            span({ fontFamily: F.body, fontSize: 17, marginLeft: 10, lineClamp: 1 }, s.label),
          ),
        ),
      ),
    ),
    await band(card),
  );
}

async function panelEl(panel: OgPanel, w: number, hgt: number): Promise<El | null> {
  switch (panel.kind) {
    case "none":
      return null;
    case "hosts": {
      const cols = panel.hosts.length > 4 ? 3 : 2;
      const size = cols === 3 ? 150 : 170;
      const cells = await Promise.all(
        panel.hosts.slice(0, 6).map(async (host) =>
          h(
            {
              flexDirection: "column",
              alignItems: "center",
              width: Math.floor((w - 24 * (cols - 1)) / cols),
            },
            await avatar(host, size),
            span({ ...itemName(22, C.red), marginTop: 10 }, host.name),
          ),
        ),
      );
      return h(
        {
          flexWrap: "wrap",
          gap: 24,
          width: w,
          height: hgt,
          alignContent: "center",
          justifyContent: "center",
        },
        ...cells,
      );
    }
    case "steps":
      return h(
        {
          flexDirection: "column",
          width: w,
          height: hgt,
          justifyContent: "center",
          gap: 16,
          paddingLeft: 26,
          borderLeft: `3px solid ${C.red}`,
        },
        ...panel.steps.slice(0, 4).map((step, i) =>
          h(
            { alignItems: "flex-start" },
            h(
              {
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: C.red,
                color: "#fff",
                alignItems: "center",
                justifyContent: "center",
                ...itemName(22, "#fff"),
                flexShrink: 0,
                marginRight: 16,
              },
              String(i + 1),
            ),
            richText(clampRuns(step, 110), { fontSize: 20, lineHeight: 1.35, width: w - 90 }),
          ),
        ),
      );
    case "art":
      return h(
        {
          padding: 10,
          backgroundColor: "#fff",
          boxShadow: "0 8px 22px rgba(43,33,25,.35)",
          transform: "rotate(-1.2deg)",
        },
        await picture(panel.art, w - 40, hgt - 40, { fit: "cover" }),
      );
    case "items": {
      const items = panel.items.slice(0, 6);
      const cols = 3;
      const gap = 16;
      const fw = Math.floor((w - gap * (cols - 1)) / cols);
      const rowsN = Math.ceil(items.length / cols);
      const fh = Math.floor((hgt - gap * (rowsN - 1)) / rowsN);
      return h(
        { flexWrap: "wrap", gap, width: w },
        ...(await Promise.all(items.map((it) => frame(it, fw, fh, { size: 30 })))),
      );
    }
  }
}

async function pageCard(card: Of<"page">): Promise<El> {
  const panel = await panelEl(card.panel, 650, BODY_H - 68);
  if (!panel) {
    return paper(
      abs(
        {
          left: 0,
          top: 0,
          right: 0,
          height: BODY_H,
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 80px",
        },
        card.kicker ? span({ ...kicker(24, C.green, 0.1), marginBottom: 16 }, card.kicker) : null,
        h(
          {
            ...display(titleSize(card.title, [96, 80, 64]), C.red),
            textShadow: misreg(90, "rgba(80,20,10,.25)"),
            textAlign: "center",
            display: "block",
            lineClamp: 2,
          },
          card.title,
        ),
        card.subtitle
          ? span(
              {
                fontFamily: F.body,
                fontStyle: "italic",
                fontSize: 26,
                marginTop: 20,
                textAlign: "center",
              },
              card.subtitle,
            )
          : null,
      ),
      card.section ? abs({ left: 0, top: 34 }, sectionTab(card.section)) : null,
      await band(card),
    );
  }
  return paper(
    headColumn(
      card,
      card.kicker,
      500,
      [72, 60, 50],
      [
        card.subtitle
          ? span(
              {
                fontFamily: F.body,
                fontStyle: "italic",
                fontSize: 22,
                lineHeight: 1.35,
                marginTop: 18,
                lineClamp: 3,
              },
              card.subtitle,
            )
          : null,
      ],
    ),
    abs(
      {
        left: 520,
        top: 34,
        width: 650,
        height: BODY_H - 68,
        alignItems: "center",
        justifyContent: "center",
      },
      panel,
    ),
    await band(card),
  );
}

/** A loop of red marker around a photo, baked to an image. */
async function markerCircle(w: number, hgt: number): Promise<El> {
  const cx = w / 2;
  const cy = hgt / 2;
  const rx = w / 2 - 8;
  const ry = hgt / 2 - 8;
  const d = `M ${cx + rx * 0.2} ${cy - ry} C ${cx + rx * 1.1} ${cy - ry * 1.02}, ${cx + rx * 1.04} ${cy + ry * 1.02}, ${cx} ${cy + ry} C ${cx - rx * 1.08} ${cy + ry * 0.98}, ${cx - rx * 1.06} ${cy - ry * 1.04}, ${cx - rx * 0.05} ${cy - ry * 0.96} L ${cx + rx * 0.35} ${cy - ry * 0.9}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${hgt}"><path d="${d}" fill="none" stroke="${C.red}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" opacity="0.88"/></svg>`;
  const png = await sharp(Buffer.from(svg)).png().toBuffer();
  return img(
    { src: `data:image/png;base64,${png.toString("base64")}`, width: w, height: hgt },
    { position: "absolute", left: 0, top: 0 },
  );
}

async function wishlistCard(card: Of<"wishlist">): Promise<El> {
  const items = card.items.slice(0, 3);
  const fw = 176;
  const fh = 210;
  // The marker loop runs around the frame, under it where they overlap.
  const tw = fw + 66;
  const th = fh + 72;
  const tiles = await Promise.all(
    items.map(async (it, i) =>
      h(
        {
          position: "relative",
          width: tw,
          height: th,
          alignItems: "center",
          justifyContent: "center",
          marginTop: [0, 56, 16][i],
        },
        await markerCircle(tw, th),
        await frame(it, fw, fh, { size: 30 }),
      ),
    ),
  );
  return paper(
    abs(
      {
        left: 0,
        top: 0,
        width: 470,
        height: BODY_H,
        flexDirection: "column",
        padding: "52px 30px 30px 52px",
      },
      span(kicker(22, C.green, 0.12), `${MASTHEAD} ${card.edition} · Order Form`),
      h(
        {
          fontFamily: F.hand,
          fontSize: 92,
          color: C.red,
          lineHeight: 1,
          marginTop: 18,
          transform: "rotate(-4deg)",
          display: "block",
        },
        card.title,
      ),
      h(
        { flexDirection: "column", marginTop: "auto", width: "100%" },
        ...items.map((it) =>
          h(
            {
              alignItems: "flex-end",
              borderBottom: `2px solid rgba(43,33,25,.45)`,
              paddingBottom: 4,
              marginTop: 14,
            },
            letterBox(it.letter, 26, { marginRight: 12, marginBottom: 4, flexShrink: 0 }),
            span(
              {
                fontFamily: F.hand,
                fontSize: 24,
                color: C.ink,
                flexGrow: 1,
                flexShrink: 1,
                minWidth: 0,
                overflow: "hidden",
                whiteSpace: "nowrap",
                textOverflow: "ellipsis",
              },
              it.name,
            ),
            h({ flexShrink: 0, marginLeft: 10 }, priceText(it.price, 19)),
          ),
        ),
      ),
    ),
    abs(
      {
        left: 456,
        top: 24,
        width: 734,
        height: BODY_H - 48,
        alignItems: "center",
        justifyContent: "center",
      },
      ...tiles,
    ),
    await band(card),
  );
}

async function defaultCard(card: Of<"default">): Promise<El> {
  const items = card.items.slice(0, 4);
  const fw = 270;
  const fh = 215;
  const frames = await Promise.all(items.map((it) => frame(it, fw, fh, { size: 30 })));
  return paper(
    abs({
      inset: 0,
      backgroundImage: `linear-gradient(180deg, ${C.navy} 0%, #16214a 60%, ${C.midnight} 100%)`,
    }),
    abs(
      {
        left: 0,
        top: 0,
        width: 600,
        height: BODY_H,
        flexDirection: "column",
        justifyContent: "center",
        padding: "0 40px 0 56px",
      },
      span(kicker(22, C.gold1, 0.3), `${MASTHEAD} ${card.edition}`),
      await logoEl(92, { marginTop: 18 }),
      span(
        {
          fontFamily: F.masthead,
          fontSize: 124,
          lineHeight: 1,
          marginTop: -10,
          paddingRight: 30,
          color: C.gold1,
          textShadow: "4px 5px 0 rgba(36,20,4,.9), -1px -1px 0 rgba(200,40,40,.3)",
        },
        MASTHEAD,
      ),
      card.tagline
        ? span({ ...display(30, "#fff"), marginTop: 8, lineHeight: 1.15 }, card.tagline)
        : null,
    ),
    abs(
      {
        left: 610,
        top: 0,
        width: 590,
        height: BODY_H,
        backgroundColor: C.cream,
        flexWrap: "wrap",
        gap: 16,
        padding: "40px 0 0 18px",
        alignContent: "flex-start",
      },
      ...frames,
    ),
    await band({ ...card }),
  );
}

/** The Satori element tree for a card. */
export async function cardElement(card: OgCard): Promise<El> {
  switch (card.variant) {
    case "cover":
      return coverCard(card);
    case "divider":
      return dividerCard(card);
    case "items":
      return itemsCard(card);
    case "feature":
      return featureCard(card);
    case "centerfold":
      return centerfoldCard(card);
    case "page":
      return pageCard(card);
    case "wishlist":
      return wishlistCard(card);
    case "default":
      return defaultCard(card);
  }
}

// ---------------------------------------------------------------- paper

/**
 * A texture tile, cropped to fit the card (sharp can't tile a larger image).
 * `strength` < 1 lightens an opaque multiply tile toward white.
 */
async function tex(name: string, strength = 1): Promise<Buffer> {
  const file = root(`src/styles/textures/${name}.webp`);
  const { width = 0, height = 0 } = await sharp(file).metadata();
  let tile = sharp(file).extract({
    left: 0,
    top: 0,
    width: Math.min(width, OG_WIDTH),
    height: Math.min(height, OG_HEIGHT),
  });
  if (strength < 1) tile = tile.linear(strength, 255 * (1 - strength));
  return tile.png().toBuffer();
}

/**
 * Paper grain strength on cards. The page's full-strength grain is noise in
 * every pixel, which PNG can't compress; at share-card sizes half reads the same.
 */
const GRAIN = 0.5;

const overlayCache = new Map<string, Promise<{ multiply: Buffer; screen: Buffer }>>();

/**
 * The paper & print effects, baked once per binding side into two layers:
 * a multiply layer (warm grade, yellowed edges, gutter shadow, foxing, fibers,
 * grain) and a screen layer (glossy sheen, worn corner, dust).
 */
function paperOverlays(side: "left" | "right") {
  let found = overlayCache.get(side);
  if (!found) {
    found = bakeOverlays(side);
    overlayCache.set(side, found);
  }
  return found;
}

async function bakeOverlays(side: "left" | "right") {
  const W = OG_WIDTH;
  const H = OG_HEIGHT;
  const outer = side === "left" ? 0 : W;
  const gutterFrom = side === "left" ? W : 0;
  const gutterTo = side === "left" ? W - 84 : 84;
  const gradients = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs>
      <radialGradient id="edge" gradientUnits="userSpaceOnUse" cx="0" cy="0" r="1" gradientTransform="translate(${W / 2} ${H / 2}) scale(${W * 0.75} ${H * 0.7})">
        <stop offset="0.55" stop-color="rgb(165,112,40)" stop-opacity="0"/>
        <stop offset="1" stop-color="rgb(165,112,40)" stop-opacity="0.3"/>
      </radialGradient>
      <linearGradient id="gutter" gradientUnits="userSpaceOnUse" x1="${gutterFrom}" y1="0" x2="${gutterTo}" y2="0">
        <stop offset="0" stop-color="rgb(60,35,10)" stop-opacity="0.26"/>
        <stop offset="0.35" stop-color="rgb(60,35,10)" stop-opacity="0.07"/>
        <stop offset="1" stop-color="rgb(60,35,10)" stop-opacity="0"/>
      </linearGradient>
    </defs>
    <rect width="100%" height="100%" fill="rgb(242,178,100)" fill-opacity="0.1"/>
    <rect width="100%" height="100%" fill="url(#edge)"/>
    <rect width="100%" height="100%" fill="url(#gutter)"/>
  </svg>`;
  const light = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
    <defs>
      <linearGradient id="sheen" x1="0" y1="0" x2="1" y2="0.55">
        <stop offset="0.3" stop-color="#fff" stop-opacity="0"/>
        <stop offset="0.42" stop-color="#fff" stop-opacity="0.06"/>
        <stop offset="0.46" stop-color="#fff" stop-opacity="0.1"/>
        <stop offset="0.58" stop-color="#fff" stop-opacity="0"/>
      </linearGradient>
      <radialGradient id="corner" gradientUnits="userSpaceOnUse" cx="${outer}" cy="${H}" r="80">
        <stop offset="0" stop-color="rgb(255,250,235)" stop-opacity="0.55"/>
        <stop offset="0.4" stop-color="rgb(255,250,235)" stop-opacity="0.18"/>
        <stop offset="1" stop-color="rgb(255,250,235)" stop-opacity="0"/>
      </radialGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#sheen)"/>
    <rect width="100%" height="100%" fill="url(#corner)"/>
  </svg>`;

  const multiply = await sharp({
    create: { width: W, height: H, channels: 3, background: "#ffffff" },
  })
    .composite([
      { input: await tex("grain", GRAIN), tile: true, blend: "multiply" },
      { input: await tex("fibers"), tile: true },
      { input: await tex("foxing"), tile: true },
      { input: Buffer.from(gradients) },
    ])
    .png()
    .toBuffer();
  const screen = await sharp({
    create: { width: W, height: H, channels: 3, background: "#000000" },
  })
    .composite([{ input: await tex("dust"), tile: true }, { input: Buffer.from(light) }])
    .png()
    .toBuffer();
  return { multiply, screen };
}

/** Renders a card element with its paper effects, as a lossless PNG. */
export async function renderFull(element: El, card: Pick<OgCard, "side">): Promise<Buffer> {
  const svg = await satori(element as unknown as Parameters<typeof satori>[0], {
    width: OG_WIDTH,
    height: OG_HEIGHT,
    fonts: await loadFonts(),
  });
  const raw = new Resvg(svg, { fitTo: { mode: "original" }, font: { loadSystemFonts: false } })
    .render()
    .asPng();
  const { multiply, screen } = await paperOverlays(card.side);
  return sharp(raw)
    .composite([
      { input: multiply, blend: "multiply" },
      { input: screen, blend: "screen" },
    ])
    .png({ compressionLevel: 1 })
    .toBuffer();
}

/** Largest card file we aim for. */
export const OG_MAX_BYTES = 290_000;
const PNG_OPTIONS: PngOptions = { palette: true, quality: 80, effort: 8, dither: 0.3 };

/**
 * Encodes the finished card as a quantized PNG, stepping the palette quality
 * down for photo-heavy cards until it fits OG_MAX_BYTES.
 */
async function encodePng(full: Buffer): Promise<Buffer> {
  let out = await sharp(full).png(PNG_OPTIONS).toBuffer();
  for (const quality of [70, 60, 50]) {
    if (out.length <= OG_MAX_BYTES) break;
    out = await sharp(full)
      .png({ ...PNG_OPTIONS, quality })
      .toBuffer();
  }
  return out;
}

/** Renders a card element to the finished PNG: Satori → resvg → paper effects. */
export async function renderPng(element: El, card: Pick<OgCard, "side">): Promise<Buffer> {
  return encodePng(await renderFull(element, card));
}
