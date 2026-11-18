/**
 * The tiny markup allowed in copy fields (descriptions, taglines, steps, bios…).
 * Copy is plain text plus:
 *
 *   **bold**        bold lead-in
 *   *italic*        italic (titles of books, magazines…)
 *   {page:<slug>}   cross-reference, rendered as a linked "page 6 A"
 *   {syn:<item>}    that item's catalog number ("SYN 036:41"), linked to the video
 *   {count}         number of gifts in the edition (items not marked as mentions; pickCount)
 *   {phone}         the phone number from content/global.yaml
 *   {catalog}       the plain-text catalog address, for the "curl" order line
 *
 * Anything else in braces is a content error, caught by the reader at build.
 */

export type CopyToken =
  | { kind: "page"; slug: string }
  | { kind: "syn"; slug: string }
  | { kind: "count" }
  | { kind: "phone" }
  | { kind: "catalog" };

export type CopySegment =
  | { kind: "text"; text: string }
  | { kind: "bold"; text: string }
  | { kind: "italic"; text: string }
  | CopyToken;

const TOKEN_RE = /\{([a-z]+)(?::([a-z0-9-]+))?\}/g;
const SLUG_TOKENS = new Set(["page", "syn"]);
const BARE_TOKENS = new Set(["count", "phone", "catalog"]);

export class CopyTokenError extends Error {}

function toToken(name: string, arg: string | undefined, raw: string): CopyToken {
  if (SLUG_TOKENS.has(name)) {
    if (!arg) throw new CopyTokenError(`${raw} needs a slug, like {${name}:some-slug}`);
    return { kind: name as "page" | "syn", slug: arg };
  }
  if (BARE_TOKENS.has(name)) {
    if (arg) throw new CopyTokenError(`${raw} doesn't take a slug`);
    return { kind: name as "count" | "phone" | "catalog" };
  }
  throw new CopyTokenError(`unknown token ${raw}`);
}

/** Every token in a copy string, plus a message for each malformed or unknown one. */
export function copyTokens(text: string): { tokens: CopyToken[]; errors: string[] } {
  const tokens: CopyToken[] = [];
  const errors: string[] = [];
  for (const m of text.matchAll(TOKEN_RE)) {
    try {
      tokens.push(toToken(m[1]!, m[2], m[0]));
    } catch (err) {
      if (!(err instanceof CopyTokenError)) throw err;
      errors.push(err.message);
    }
  }
  return { tokens, errors };
}

function pushText(out: CopySegment[], text: string) {
  // **bold** first, then *italic* inside the remaining runs.
  for (const [i, part] of text.split(/\*\*(.+?)\*\*/s).entries()) {
    if (i % 2 === 1) {
      out.push({ kind: "bold", text: part });
      continue;
    }
    for (const [j, run] of part.split(/\*(.+?)\*/s).entries()) {
      if (run) out.push({ kind: j % 2 === 1 ? "italic" : "text", text: run });
    }
  }
}

/** A run of copy with its emphasis: plain text or a token, bold and/or italic. */
export type CopyRun = ({ kind: "text"; text: string } | CopyToken) & {
  bold: boolean;
  italic: boolean;
};

const RUN_RE = /\*\*|\*|\{([a-z]+)(?::([a-z0-9-]+))?\}/g;

/**
 * Splits copy into runs for rendering. Unlike `parseCopy`, emphasis can wrap
 * tokens: "**See {page:icemag}.**" is one bold run of text, a bold page
 * reference, and bold text. A marker with no closing partner stays literal.
 */
export function parseCopyRuns(text: string): CopyRun[] {
  const out: CopyRun[] = [];
  let bold = false;
  let italic = false;
  let last = 0;
  const pushText = (s: string) => {
    if (!s) return;
    const prev = out.at(-1);
    if (prev?.kind === "text" && prev.bold === bold && prev.italic === italic) prev.text += s;
    else out.push({ kind: "text", text: s, bold, italic });
  };
  for (const m of text.matchAll(RUN_RE)) {
    pushText(text.slice(last, m.index));
    last = m.index + m[0].length;
    const rest = text.slice(last);
    if (m[0] === "**") {
      if (bold || rest.includes("**")) bold = !bold;
      else pushText(m[0]);
    } else if (m[0] === "*") {
      if (italic || /(?<!\*)\*(?!\*)/.test(rest)) italic = !italic;
      else pushText(m[0]);
    } else {
      out.push({ ...toToken(m[1]!, m[2], m[0]), bold, italic });
    }
  }
  pushText(text.slice(last));
  return out;
}

/** Splits multi-paragraph copy on blank lines. */
export function copyParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}

/** Splits copy into text, emphasis, and token segments for rendering. */
export function parseCopy(text: string): CopySegment[] {
  const out: CopySegment[] = [];
  let last = 0;
  for (const m of text.matchAll(TOKEN_RE)) {
    pushText(out, text.slice(last, m.index));
    out.push(toToken(m[1]!, m[2], m[0]));
    last = m.index + m[0].length;
  }
  pushText(out, text.slice(last));
  return out;
}
