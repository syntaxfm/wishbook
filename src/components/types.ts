/**
 * What the asset resolver returns for an image slot: the processed image when
 * the file exists, otherwise a placeholder (solid color block plus a short label).
 */
import type { ResolvedAsset } from "../lib/assets";

export type { ResolvedAsset };

/** A host as shown on stickers and quotes. */
export interface HostRef {
  name: string;
  avatar?: ResolvedAsset;
}
