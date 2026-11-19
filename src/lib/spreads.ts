/**
 * Spreads from page numbers. Pure and dependency-free, so the build
 * (pagination) and the browser (book engine) pair pages the same way.
 *
 *   - Page 1 (the cover) sits alone on the right.
 *   - Then even (left) | odd (right) pairs.
 *   - A page spanning two numbers (the centerfold) fills both sides.
 */

/** Anything with a first and last page number. */
export interface Numbered {
  n: number;
  end: number;
}

export interface Spread<P> {
  left: P | null;
  right: P | null;
}

export function buildSpreads<P extends Numbered>(pages: readonly P[]): Spread<P>[] {
  const byNumber = new Map<number, P>();
  let last = 0;
  for (const p of pages) {
    for (let k = p.n; k <= p.end; k++) byNumber.set(k, p);
    last = Math.max(last, p.end);
  }
  const spreads: Spread<P>[] = [];
  if (last >= 1) spreads.push({ left: null, right: byNumber.get(1) ?? null });
  for (let k = 2; k <= last; k += 2) {
    spreads.push({ left: byNumber.get(k) ?? null, right: byNumber.get(k + 1) ?? null });
  }
  return spreads;
}

/** The distinct pages of a spread, left first (the centerfold appears once). */
export function spreadPages<P>(spread: Spread<P>): P[] {
  const out: P[] = [];
  if (spread.left) out.push(spread.left);
  if (spread.right && spread.right !== spread.left) out.push(spread.right);
  return out;
}
