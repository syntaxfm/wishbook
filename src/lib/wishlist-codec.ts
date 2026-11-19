/**
 * The wish-list share code: a bitset of item ids, encoded as base64url.
 *
 * Bit `id` is set for every item on the list (byte id >> 3, bit id & 7, least
 * significant bit first). Trailing zero bytes are dropped and there is no "="
 * padding, so the code only grows with the highest id on the list:
 *
 *   encodeWishlist([1, 2, 9])  → "BgI"
 *   decodeWishlist("BgI")      → [1, 2, 9]
 *
 * Item ids are permanent and never reused within an edition, so a code keeps
 * meaning the same items as ids are added; ids that no longer exist are
 * filtered out by the caller (they simply match no item). Order is not kept:
 * decoding returns ids ascending. Pure: used at build, in tests, and in the
 * browser.
 */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const VALUE = new Map([...ALPHABET].map((c, i) => [c, i]));

/** Codes longer than this are rejected (it already covers ids up to ~6000). */
export const MAX_CODE_LENGTH = 1024;

/** The share code for a set of item ids ("" for an empty list). Invalid ids are skipped. */
export function encodeWishlist(ids: Iterable<number>): string {
  const bytes: number[] = [];
  for (const id of ids) {
    if (!Number.isInteger(id) || id < 0 || id >= MAX_CODE_LENGTH * 6) continue;
    const at = id >> 3;
    while (bytes.length <= at) bytes.push(0);
    bytes[at]! |= 1 << (id & 7);
  }
  while (bytes.length && bytes[bytes.length - 1] === 0) bytes.pop();

  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const [a = 0, b = 0, c = 0] = [bytes[i], bytes[i + 1], bytes[i + 2]];
    const n = (a << 16) | (b << 8) | c;
    const chars = Math.min(4, Math.ceil(((bytes.length - i) * 8) / 6));
    for (let k = 0; k < chars; k++) out += ALPHABET[(n >> (18 - 6 * k)) & 63];
  }
  return out;
}

/**
 * The item ids in a share code, ascending. Empty, malformed, or oversized
 * codes give an empty list rather than an error: a broken link should open an
 * empty wish list, not a broken page.
 */
export function decodeWishlist(code: string | null | undefined): number[] {
  if (!code || code.length > MAX_CODE_LENGTH) return [];
  const clean = code.trim().replace(/=+$/, "");
  if (clean.length % 4 === 1) return [];
  const values: number[] = [];
  for (const ch of clean) {
    const v = VALUE.get(ch);
    if (v === undefined) return [];
    values.push(v);
  }

  const ids: number[] = [];
  let bits = 0;
  let acc = 0;
  let byteIndex = 0;
  for (const v of values) {
    acc = (acc << 6) | v;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      const byte = (acc >> bits) & 0xff;
      acc &= (1 << bits) - 1;
      for (let bit = 0; bit < 8; bit++) {
        if (byte & (1 << bit)) ids.push(byteIndex * 8 + bit);
      }
      byteIndex++;
    }
  }
  return ids;
}
