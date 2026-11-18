import { describe, expect, it } from "vitest";
import { copyTokens, parseCopy } from "../../src/lib/copy";

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
