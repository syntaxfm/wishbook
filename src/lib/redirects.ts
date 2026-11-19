/**
 * The Cloudflare Pages `_redirects` file: year-less deep links (/favorites/…)
 * go to the current edition with a 302, so the target can move to next year's
 * book. The root "/" and "/catalog.txt" are real files, not redirects.
 * Written to dist/ at build from the current edition's sections.
 */
import { editionUrl, rootUrl, type Edition } from "./urls";

/** Top-level paths inside an edition that aren't sections. */
export const EXTRA_REDIRECT_PATHS = ["wishlist"] as const;

export function redirectsFile(edition: Edition, sectionIds: readonly string[]): string {
  const segments = [...sectionIds, ...EXTRA_REDIRECT_PATHS];
  const width = Math.max(...segments.map((s) => rootUrl(s).length)) + 2;
  const lines = segments.map((s) => {
    const from = `${rootUrl(s)}*`;
    return `${from.padEnd(width)} ${editionUrl(edition, s)}:splat 302`;
  });
  return [
    "# Generated at build from the current edition's sections. Do not edit.",
    "# Year-less deep links go to the current edition (302, so the target can move",
    "# to next year's book). The root / and /catalog.txt are real files, not redirects.",
    ...lines,
    "",
  ].join("\n");
}
