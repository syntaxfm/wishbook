import { describe, expect, it } from "vitest";
import {
  formatCatalogNumber,
  formatPrice,
  parseTimestamp,
  pickOrderLine,
  resolvePrice,
  splitPrice,
} from "../../src/lib/catalog";

describe("parseTimestamp", () => {
  it("reads mm:ss, padded minutes, and h:mm:ss", () => {
    expect(parseTimestamp("0:36")).toBe(36);
    expect(parseTimestamp("36:41")).toBe(2201);
    expect(parseTimestamp("036:41")).toBe(2201);
    expect(parseTimestamp("1:02:34")).toBe(3754);
  });

  it("passes whole seconds through", () => {
    expect(parseTimestamp(2201)).toBe(2201);
  });

  it("rejects malformed values", () => {
    expect(() => parseTimestamp("36")).toThrow();
    expect(() => parseTimestamp("1:75")).toThrow();
    expect(() => parseTimestamp("1:75:00")).toThrow();
    expect(() => parseTimestamp(-1)).toThrow();
    expect(() => parseTimestamp(1.5)).toThrow();
  });
});

describe("formatCatalogNumber", () => {
  it("prints three-digit minutes under an hour", () => {
    expect(formatCatalogNumber("0:36")).toBe("SYN 000:36");
    expect(formatCatalogNumber("36:41")).toBe("SYN 036:41");
    expect(formatCatalogNumber(59 * 60 + 59)).toBe("SYN 059:59");
  });

  it("prints h:mm:ss from an hour on", () => {
    expect(formatCatalogNumber(3600)).toBe("SYN 1:00:00");
    expect(formatCatalogNumber("1:02:34")).toBe("SYN 1:02:34");
    expect(formatCatalogNumber("62:34")).toBe("SYN 1:02:34");
  });
});

describe("prices", () => {
  it("prefers the confirmed price, then the estimate", () => {
    expect(resolvePrice({ confirmed: 67.9, estimate: 60 })).toEqual({
      amount: 67.9,
      estimated: false,
    });
    expect(resolvePrice({ confirmed: null, estimate: 49.99 })).toEqual({
      amount: 49.99,
      estimated: true,
    });
    expect(resolvePrice({ confirmed: 0 })).toEqual({ amount: 0, estimated: false });
    expect(resolvePrice({})).toBeNull();
  });

  it("formats dollars and cents", () => {
    expect(formatPrice(67.9)).toBe("67.90");
    expect(formatPrice(149.99)).toBe("149.99");
    expect(formatPrice(69)).toBe("69.00");
    expect(splitPrice(67.9)).toEqual({ whole: "67", cents: "90" });
    expect(() => splitPrice(Number.NaN)).toThrow();
  });
});

describe("pickOrderLine", () => {
  const lines = ["Call any time", "Dial any SYN number"];

  it("rotates by position", () => {
    expect(pickOrderLine(lines, 0)).toBe("Call any time");
    expect(pickOrderLine(lines, 1)).toBe("Dial any SYN number");
    expect(pickOrderLine(lines, 2)).toBe("Call any time");
    expect(pickOrderLine(lines, -1)).toBe("Dial any SYN number");
  });

  it("needs at least one line", () => {
    expect(() => pickOrderLine([], 0)).toThrow();
  });
});
