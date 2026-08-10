import { describe, it, expect } from "vitest";
import { normalizeBrandQualifiers } from "../src/core/normalizer.js";

describe("normalizeBrandQualifiers", () => {
  it("leaves an already-bare BRAND<...> unchanged", () => {
    expect(normalizeBrandQualifiers('string & BRAND<"Tag">')).toBe('string & BRAND<"Tag">');
  });

  it("strips a single-segment qualifier like z.BRAND<...>", () => {
    expect(normalizeBrandQualifiers('string & z.BRAND<"Tag">')).toBe('string & BRAND<"Tag">');
  });

  it("strips a multi-segment qualifier like z.core.$brand<...>", () => {
    expect(normalizeBrandQualifiers('string & z.core.$brand<"Tag">')).toBe('string & BRAND<"Tag">');
  });

  it("strips an import(...) qualifier", () => {
    expect(normalizeBrandQualifiers('string & import("zod").BRAND<"Tag">')).toBe(
      'string & BRAND<"Tag">',
    );
  });

  it("does not touch a case-insensitive or bare user-defined `brand<...>` that isn't Zod's marker", () => {
    const userType = 'string & SomeType.brand<"X">';
    expect(normalizeBrandQualifiers(userType)).toBe(userType);
  });

  it("replaces every occurrence when a type contains multiple brand markers", () => {
    expect(
      normalizeBrandQualifiers('{ a: string & z.BRAND<"A">; b: string & z.BRAND<"B">; }'),
    ).toBe('{ a: string & BRAND<"A">; b: string & BRAND<"B">; }');
  });
});
