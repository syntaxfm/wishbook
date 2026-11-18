import { describe, expect, it } from "vitest";
import { copyParagraphs, copyTokens, parseCopy, parseCopyRuns } from "../../src/lib/copy";

describe("parseCopy", () => {
  it("splits text, emphasis, and tokens", () => {
    expect(parseCopy("**Fan** keeps it cool. See {page:icemag}, *Guitar World*.")).toEqual([
      { kind: "bold", text: "Fan" },
      { kind: "text", text: " keeps it cool. See " },
      { kind: "page", slug: "icemag" },
      { kind: "text", text: ", " },
      { kind: "italic", text: "Guitar World" },
      { kind: "text", text: "." },
    ]);
    expect(parseCopy("{count} gifts · call {phone} · {syn:leatherman} · {catalog}")).toEqual([
      { kind: "count" },
      { kind: "text", text: " gifts · call " },
      { kind: "phone" },
      { kind: "text", text: " · " },
      { kind: "syn", slug: "leatherman" },
      { kind: "text", text: " · " },
      { kind: "catalog" },
    ]);
  });

  it("leaves braces that aren't tokens alone", () => {
    expect(copyTokens("const x = { a: 1 }")).toEqual({ tokens: [], errors: [] });
  });

  it("reports unknown and malformed tokens", () => {
    expect(copyTokens("{page} {count:x} {nope}").errors).toEqual([
      "{page} needs a slug, like {page:some-slug}",
      "{count:x} doesn't take a slug",
      "unknown token {nope}",
    ]);
  });
});

describe("parseCopyRuns", () => {
  it("lets emphasis wrap tokens", () => {
    expect(parseCopyRuns("bank. **See {page:icemag}.**")).toEqual([
      { kind: "text", text: "bank. ", bold: false, italic: false },
      { kind: "text", text: "See ", bold: true, italic: false },
      { kind: "page", slug: "icemag", bold: true, italic: false },
      { kind: "text", text: ".", bold: true, italic: false },
    ]);
  });

  it("handles italic, bold, and bare tokens", () => {
    expect(parseCopyRuns("Editor of *Guitar World*, {count} gifts, **bold**")).toEqual([
      { kind: "text", text: "Editor of ", bold: false, italic: false },
      { kind: "text", text: "Guitar World", bold: false, italic: true },
      { kind: "text", text: ", ", bold: false, italic: false },
      { kind: "count", bold: false, italic: false },
      { kind: "text", text: " gifts, ", bold: false, italic: false },
      { kind: "text", text: "bold", bold: true, italic: false },
    ]);
  });

  it("keeps unpaired markers literal", () => {
    expect(parseCopyRuns("361.74* plus one grouse")).toEqual([
      { kind: "text", text: "361.74* plus one grouse", bold: false, italic: false },
    ]);
    expect(parseCopyRuns("a ** b")).toEqual([
      { kind: "text", text: "a ** b", bold: false, italic: false },
    ]);
  });
});

describe("copyParagraphs", () => {
  it("splits on blank lines", () => {
    expect(copyParagraphs("One.\n\nTwo\nlines.\n  \nThree.")).toEqual([
      "One.",
      "Two\nlines.",
      "Three.",
    ]);
  });
});
