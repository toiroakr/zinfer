import { describe, it, expect } from "vitest";
import { isEscaped } from "../src/core/string-scan.js";

describe("isEscaped", () => {
  it("returns false when there is no preceding backslash", () => {
    expect(isEscaped('a"', 1)).toBe(false);
  });

  it("returns false at index 0 (nothing precedes it)", () => {
    expect(isEscaped('"a', 0)).toBe(false);
  });

  it("returns true for a single (odd) preceding backslash", () => {
    // `a\"` - one backslash directly escapes the quote.
    expect(isEscaped('a\\"', 2)).toBe(true);
  });

  it("returns false for two (even) preceding backslashes", () => {
    // `a\\"` - the two backslashes escape each other, leaving the quote unescaped.
    expect(isEscaped('a\\\\"', 3)).toBe(false);
  });

  it("returns true for three (odd) preceding backslashes", () => {
    expect(isEscaped('a\\\\\\"', 4)).toBe(true);
  });
});
