/**
 * Formatting rules for the catalog's printed details: catalog numbers
 * (episode timestamps), prices, and the rotating order lines.
 */

/**
 * Parses an episode timestamp into whole seconds.
 * Accepts seconds (2201), "mm:ss" ("36:41", "036:41"), or "h:mm:ss" ("1:02:34").
 */
export function parseTimestamp(value: string | number): number {
  if (typeof value === "number") {
    if (Number.isInteger(value) && value >= 0) return value;
    throw new Error(`Invalid timestamp ${value}: expected whole seconds`);
  }
  const match = /^\s*(?:(\d+):)?(\d+):(\d{2})\s*$/.exec(value);
  if (!match) {
    throw new Error(`Invalid timestamp "${value}": expected "mm:ss" or "h:mm:ss"`);
  }
  const [, h, m, s] = match;
  const hours = Number(h ?? 0);
  const minutes = Number(m);
  const seconds = Number(s);
  if (seconds > 59 || (h !== undefined && minutes > 59)) {
    throw new Error(`Invalid timestamp "${value}": minutes and seconds must be under 60`);
  }
  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * The printed catalog number for a timestamp: "SYN 036:41" (three-digit
 * minutes) under an hour, "SYN 1:02:34" from an hour on.
 */
export function formatCatalogNumber(timestamp: string | number): string {
  const total = parseTimestamp(timestamp);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = String(total % 60).padStart(2, "0");
  return hours > 0
    ? `SYN ${hours}:${String(minutes).padStart(2, "0")}:${seconds}`
    : `SYN ${String(minutes).padStart(3, "0")}:${seconds}`;
}

export interface PriceInput {
  /** The real price, once checked. */
  confirmed?: number | null;
  /** A best guess, shown with an "est." marker until confirmed. */
  estimate?: number | null;
}

export interface ResolvedPrice {
  amount: number;
  estimated: boolean;
}

/** The confirmed price when set, otherwise the estimate; null when neither is known. */
export function resolvePrice({ confirmed, estimate }: PriceInput): ResolvedPrice | null {
  if (confirmed != null) return { amount: confirmed, estimated: false };
  if (estimate != null) return { amount: estimate, estimated: true };
  return null;
}

/** Splits a price into dollars and two-digit cents: 67.9 → { whole: "67", cents: "90" }. */
export function splitPrice(amount: number): { whole: string; cents: string } {
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`Invalid price ${amount}`);
  }
  const [whole = "0", cents = "00"] = amount.toFixed(2).split(".");
  return { whole, cents };
}

/** A price as printed in copy and order lines: 67.9 → "67.90". */
export function formatPrice(amount: number): string {
  const { whole, cents } = splitPrice(amount);
  return `${whole}.${cents}`;
}

/**
 * The order line for a page footer. Real catalogs rotate their order lines by
 * position, so each page gets the next one in the list.
 */
export function pickOrderLine(lines: readonly string[], position: number): string {
  if (lines.length === 0) throw new Error("pickOrderLine: no order lines to choose from");
  const i = ((Math.trunc(position) % lines.length) + lines.length) % lines.length;
  return lines[i] as string;
}
