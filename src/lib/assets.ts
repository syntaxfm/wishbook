import type { ImageMetadata } from "astro";
import { getEdition } from "./content";
import type { Edition } from "./urls";

/**
 * The asset resolver. Images are found by file name, never by stored paths, so a
 * file dropped into the right folder just shows up. Anything missing resolves to
 * a placeholder (a solid color block with a short title).
 *
 * Keys:
 *   item:<id>            item photo         assets/<year>/items/<id>-<name>.<ext>
 *   item:<id>-<suffix>   extra / art        assets/<year>/items/<id>-<name>-2.<ext>, -3, -hero
 *   host:<slug>          host photo         assets/<year>/hosts/<slug>.<ext>
 *   brand:<name>         shared brand art   assets/brand/<name>.<ext>
 *   <manifest key>       generated art      file listed in content/<year>/assets.yaml
 *
 * assets/<year>/archive/ holds old photos kept for reference; nothing resolves
 * them and the build never emits them.
 *
 * File ids are written zero-padded to three digits (001-silicone-cables.png), but
 * any padding matches: 1-…, 01-…, and 001-… are all item 1. Only the id prefix
 * and suffix matter; the name and the extension are free. A name must not end in
 * "-<digit>" (that reads as an extra-photo suffix).
 */

export type ResolvedAsset<T = ImageMetadata> =
  | { kind: "image"; meta: T; file: string }
  | { kind: "placeholder"; key: string; label: string; color: string };

export interface ResolverContent {
  manifest: readonly { key: string; file: string; label: string; color: string | null }[];
  items: readonly { id: number; name: string; section: { color: string } }[];
  hosts: readonly { slug: string; name: string }[];
}

/** Placeholder color when nothing more specific is known (warm ink). */
export const PLACEHOLDER_COLOR = "#5a4a3a";

const ITEM_FILE_RE = /^(\d+)(?:-(.*))?$/;
const SUFFIX_RE = /^(?:[2-9]|hero)$/;

interface Found<T> {
  file: string;
  meta: T;
}

interface EditionIndex<T> {
  /** "<id>" or "<id>-<suffix>" → files */
  items: Map<string, Found<T>[]>;
  /** path under assets/<year>/ without extension → files */
  files: Map<string, Found<T>[]>;
}

export interface AssetIndex<T> {
  editions: Map<string, EditionIndex<T>>;
  brand: Map<string, Found<T>[]>;
}

const stripExt = (path: string) => path.replace(/\.[^./]+$/, "");
const push = <T>(map: Map<string, Found<T>[]>, key: string, found: Found<T>) => {
  const list = map.get(key);
  if (list) list.push(found);
  else map.set(key, [found]);
};

/** Parses an item file name (no extension) into its id and optional suffix. */
export function parseItemFile(base: string): { id: number; suffix: string | null } | null {
  const m = ITEM_FILE_RE.exec(base);
  if (!m) return null;
  const parts = (m[2] ?? "").split("-");
  const last = parts.at(-1) ?? "";
  return { id: Number(m[1]), suffix: SUFFIX_RE.test(last) ? last : null };
}

/**
 * Indexes a file map (from import.meta.glob) by edition. `root` is the glob's
 * base directory, e.g. "/assets".
 */
export function indexAssets<T>(files: Record<string, T>, root = "/assets"): AssetIndex<T> {
  const index: AssetIndex<T> = { editions: new Map(), brand: new Map() };
  const prefix = `${root.replace(/\/$/, "")}/`;
  for (const [file, meta] of Object.entries(files)) {
    if (!file.startsWith(prefix)) continue;
    const [top, ...rest] = file.slice(prefix.length).split("/");
    if (!top || rest.length === 0) continue;
    const found = { file, meta };
    if (top === "brand") {
      push(index.brand, stripExt(rest.join("/")), found);
      continue;
    }
    if (!/^\d{4}$/.test(top)) continue;
    // Old photos kept for reference: never resolved (the build doesn't glob them).
    if (rest[0] === "archive") continue;
    let edition = index.editions.get(top);
    if (!edition) {
      edition = { items: new Map(), files: new Map() };
      index.editions.set(top, edition);
    }
    push(edition.files, stripExt(rest.join("/")), found);
    if (rest[0] === "items" && rest.length === 2) {
      const parsed = parseItemFile(stripExt(rest[1]!));
      if (parsed) {
        push(
          edition.items,
          parsed.suffix ? `${parsed.id}-${parsed.suffix}` : `${parsed.id}`,
          found,
        );
      }
    }
  }
  return index;
}

function one<T>(found: Found<T>[] | undefined, what: string): Found<T> | undefined {
  if (found && found.length > 1) {
    throw new Error(`More than one file for ${what}: ${found.map((f) => f.file).join(", ")}`);
  }
  return found?.[0];
}

/** Resolves a key against an asset index and one edition's content. Pure: no I/O. */
export function resolveFrom<T>(
  index: AssetIndex<T>,
  edition: Edition,
  key: string,
  content: ResolverContent,
): ResolvedAsset<T> {
  const year = String(edition);
  const files = index.editions.get(year);
  const image = (found: Found<T> | undefined) =>
    found ? ({ kind: "image", meta: found.meta, file: found.file } as const) : undefined;

  const [kind, ...restParts] = key.split(":");
  const rest = restParts.join(":");

  if (kind === "item" && rest) {
    const m = /^(\d+)(?:-([2-9]|hero))?$/.exec(rest);
    if (!m) throw new Error(`Bad item asset key "${key}" (use item:<id> or item:<id>-<2-9|hero>)`);
    const id = Number(m[1]);
    const item = content.items.find((i) => i.id === id);
    if (!item) throw new Error(`Asset "${key}": edition ${year} has no item with id ${id}`);
    const lookup = m[2] ? `${id}-${m[2]}` : `${id}`;
    return (
      image(one(files?.items.get(lookup), `${key} in assets/${year}/items/`)) ?? {
        kind: "placeholder",
        key,
        label: m[2] === "hero" ? `${item.name} (art)` : item.name,
        color: item.section.color,
      }
    );
  }

  if (kind === "host" && rest) {
    const host = content.hosts.find((h) => h.slug === rest);
    if (!host) throw new Error(`Asset "${key}": edition ${year} has no host "${rest}"`);
    return (
      image(one(files?.files.get(`hosts/${rest}`), `${key} in assets/${year}/hosts/`)) ?? {
        kind: "placeholder",
        key,
        label: host.name,
        color: PLACEHOLDER_COLOR,
      }
    );
  }

  if (kind === "brand" && rest) {
    return (
      image(one(index.brand.get(rest), `${key} in assets/brand/`)) ?? {
        kind: "placeholder",
        key,
        label: rest,
        color: PLACEHOLDER_COLOR,
      }
    );
  }

  const entry = content.manifest.find((a) => a.key === key);
  if (!entry) throw new Error(`Asset "${key}" is not in content/${year}/assets.yaml`);
  return (
    image(one(files?.files.get(stripExt(entry.file)), `${key} (${entry.file})`)) ?? {
      kind: "placeholder",
      key,
      label: `${key} · ${entry.label}`,
      color: entry.color ?? PLACEHOLDER_COLOR,
    }
  );
}

// Every image in assets/, processed by astro:assets. assets/<year>/archive/
// (old photos kept for reference) is left out, so it's never built.
let projectIndex: AssetIndex<ImageMetadata> | undefined;
function getProjectIndex() {
  projectIndex ??= indexAssets(
    import.meta.glob<ImageMetadata>(
      ["/assets/**/*.{png,jpg,jpeg,webp,avif,svg}", "!/assets/*/archive/**"],
      { eager: true, import: "default" },
    ),
  );
  return projectIndex;
}

/** Resolves an asset key for an edition to an image or a placeholder. */
export async function resolveAsset(edition: Edition, key: string): Promise<ResolvedAsset> {
  const content = await getEdition(edition);
  return resolveFrom(getProjectIndex(), edition, key, {
    manifest: content.assets,
    items: content.items,
    hosts: content.hosts,
  });
}

/** An item's photo: main (no suffix), extra ("2", "3"), or art ("hero"). */
export function resolveItemImage(
  edition: Edition,
  id: number,
  suffix?: string | null,
): Promise<ResolvedAsset> {
  return resolveAsset(edition, suffix ? `item:${id}-${suffix}` : `item:${id}`);
}
