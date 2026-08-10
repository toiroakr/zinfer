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

  // Known limitation: this is a string-level rewrite of a *printed* type, with
  // no access to whether `BRAND` actually resolves to Zod's marker symbol.
  // A user-defined uppercase `SomeType.BRAND<...>` qualifier is
  // indistinguishable from Zod's own (which is qualified the same way
  // depending on how the analyzed file imported Zod - see the qualifier
  // patterns tested above) and gets stripped too. This is intentional: an
  // allowlist of "known Zod-only" qualifier prefixes would be brittle against
  // aliased imports (e.g. `import { z as zz } from "zod"`) and would trade a
  // rare false positive for a common false negative.
  it("also strips an uppercase user-defined `BRAND<...>` qualifier, indistinguishable from Zod's own", () => {
    const userType = 'string & SomeType.BRAND<"X">';
    expect(normalizeBrandQualifiers(userType)).toBe('string & BRAND<"X">');
  });

  it("replaces every occurrence when a type contains multiple brand markers", () => {
    expect(
      normalizeBrandQualifiers('{ a: string & z.BRAND<"A">; b: string & z.BRAND<"B">; }'),
    ).toBe('{ a: string & BRAND<"A">; b: string & BRAND<"B">; }');
  });
});
