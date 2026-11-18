import type { ImageMetadata } from "astro";

/**
 * What the asset resolver returns for an image slot: the processed image when
 * the file exists, otherwise a placeholder (solid color block plus a short label).
 */
export type ResolvedAsset =
  | { kind: "image"; meta: ImageMetadata }
  | { kind: "placeholder"; label: string; color: string; key: string };

/** A host as shown on stickers and quotes. */
export interface HostRef {
  name: string;
  avatar?: ResolvedAsset;
}
