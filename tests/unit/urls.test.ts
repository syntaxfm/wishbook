import { describe, expect, it } from "vitest";
import { absoluteUrl, editionFromPath, editionUrl, rootUrl, videoAtTime } from "../../src/lib/urls";

describe("editionUrl", () => {
  it("builds year-scoped directory URLs with a trailing slash", () => {
    expect(editionUrl(2026)).toBe("/2026/");
    expect(editionUrl(2026, "favorites")).toBe("/2026/favorites/");
    expect(editionUrl("2026", "/favorites/wes/")).toBe("/2026/favorites/wes/");
  });

  it("leaves file paths without a trailing slash", () => {
    expect(editionUrl(2026, "catalog.txt")).toBe("/2026/catalog.txt");
    expect(editionUrl(2026, "og/cover.png")).toBe("/2026/og/cover.png");
  });

  it("keeps query strings", () => {
    expect(editionUrl(2026, "wishlist?w=abc")).toBe("/2026/wishlist/?w=abc");
  });
});

describe("videoAtTime", () => {
  it("adds the time to a watch URL", () => {
    expect(videoAtTime("https://www.youtube.com/watch?v=abc", 2201)).toBe(
      "https://www.youtube.com/watch?v=abc&t=2201",
    );
  });

  it("works on short links and replaces an existing time", () => {
    expect(videoAtTime("https://youtu.be/abc", 36)).toBe("https://youtu.be/abc?t=36");
    expect(videoAtTime("https://youtu.be/abc?t=10", 36)).toBe("https://youtu.be/abc?t=36");
  });

  it("rejects bad input", () => {
    expect(() => videoAtTime("not a url", 36)).toThrow();
    expect(() => videoAtTime("https://youtu.be/abc", 1.5)).toThrow();
  });
});

describe("rootUrl / absoluteUrl / editionFromPath", () => {
  it("builds root copies", () => {
    expect(rootUrl()).toBe("/");
    expect(rootUrl("catalog.txt")).toBe("/catalog.txt");
  });

  it("makes absolute production URLs", () => {
    expect(absoluteUrl(editionUrl(2026))).toBe("https://wishbook.syntax.fm/2026/");
  });

  it("reads the edition from a pathname", () => {
    expect(editionFromPath("/2026/favorites/wes/")).toBe("2026");
    expect(editionFromPath("/")).toBeNull();
    expect(editionFromPath("/favorites/")).toBeNull();
  });
});
