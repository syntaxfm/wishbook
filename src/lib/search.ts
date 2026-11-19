/**
 * Fuzzy search over the embedded item index (⌘K). Pure, shared by the browser
 * and tests.
 *
 * Every word of the query must match one of an entry's fields. A word scores
 * best as a whole word, then as a word prefix, then as a substring, and last
 * as a subsequence of a word ("lthrmn" finds "Leatherman"). The name counts
 * most, then the brand, the shopper who picked it, the section, and the page.
 */

export interface SearchFields {
  name: string;
  brand?: string | null;
  pickers?: readonly string[];
  section?: string | null;
  /** The page label ("6 A") or title. */
  page?: string | null;
}

const WEIGHTS = { name: 4, brand: 3, pickers: 2, section: 1, page: 1 } as const;

/** Lowercase, accents stripped, punctuation as spaces. */
export function normalize(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function isSubsequence(needle: string, hay: string): boolean {
  let i = 0;
  for (const ch of hay) if (ch === needle[i] && ++i === needle.length) return true;
  return false;
}

/** How well one query word matches one normalized field (0: no match). */
function wordScore(word: string, field: string): number {
  if (!field) return 0;
  const words = field.split(" ");
  if (words.includes(word)) return 10;
  if (words.some((w) => w.startsWith(word))) return 7;
  if (field.includes(word)) return 4;
  if (word.length >= 3 && words.some((w) => w[0] === word[0] && isSubsequence(word, w))) return 2;
  return 0;
}

/** A score for an entry (0: not a match). */
export function scoreEntry(query: string, entry: SearchFields): number {
  const words = normalize(query).split(" ").filter(Boolean);
  if (words.length === 0) return 0;
  const fields = [
    [normalize(entry.name), WEIGHTS.name],
    [normalize(entry.brand ?? ""), WEIGHTS.brand],
    [normalize((entry.pickers ?? []).join(" ")), WEIGHTS.pickers],
    [normalize(entry.section ?? ""), WEIGHTS.section],
    [normalize(entry.page ?? ""), WEIGHTS.page],
  ] as const;
  let total = 0;
  for (const word of words) {
    let best = 0;
    for (const [field, weight] of fields) best = Math.max(best, wordScore(word, field) * weight);
    if (best === 0) return 0;
    total += best;
  }
  // A name that starts with the query reads as the obvious hit.
  if (fields[0][0].startsWith(words.join(" "))) total += 5;
  return total;
}

/** Entries matching the query, best first (ties keep index order), at most `limit`. */
export function search<T extends SearchFields>(
  query: string,
  entries: readonly T[],
  limit = 8,
): T[] {
  return entries
    .map((entry, i) => ({ entry, i, score: scoreEntry(query, entry) }))
    .filter((r) => r.score > 0)
    .toSorted((a, b) => b.score - a.score || a.i - b.i)
    .slice(0, limit)
    .map((r) => r.entry);
}
