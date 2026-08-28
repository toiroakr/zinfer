import { describe, it, expect } from "vitest";
import { containsBrandMarker } from "../src/core/type-printer.js";

describe("containsBrandMarker", () => {
  it("detects a real brand marker", () => {
    expect(containsBrandMarker('string & BRAND<"Tag">')).toBe(true);
  });

  it("ignores a string literal that merely contains the text BRAND<", () => {
    expect(containsBrandMarker('{ kind: "BRAND<Fake>"; }')).toBe(false);
  });

  it("does not get stuck inside a string literal ending in an escaped backslash (even backslash count before the closing quote)", () => {
    // The printed literal is `"a\\"` (a, one escaped backslash, close quote) -
    // two literal backslash characters precede the closing quote, an even
    // count, so that quote genuinely closes the string. A scanner that
    // treats *any* backslash-preceded quote as escaped would stay "inside"
    // the string past this point and miss the real marker that follows.
    const typeStr = '{ note: "a\\\\"; } & BRAND<"Tag">';
    expect(containsBrandMarker(typeStr)).toBe(true);
  });

  it("does not mistake a genuinely escaped closing quote for the end of the string (odd backslash count)", () => {
    // The printed literal is `"a\""` (a, one escaped quote, close quote) -
    // one backslash precedes the embedded quote, an odd count, so that quote
    // does not close the string; only the final quote does. A brand-looking
    // substring embedded before that real close must stay unrewritten.
    const typeStr = '{ note: "a\\"BRAND<X>"; }';
    expect(containsBrandMarker(typeStr)).toBe(false);
  });

  it("requires a word boundary before BRAND< (e.g. does not match inside a longer identifier)", () => {
    expect(containsBrandMarker("FOOBRAND<Tag>")).toBe(false);
  });

  it("treats $ as an identifier character too, since it's valid in a TypeScript identifier", () => {
    expect(containsBrandMarker("FOO$BRAND<Tag>")).toBe(false);
  });
});
