import { describe, it, expect } from "vitest";
import { createTempTypeAlias } from "../src/core/normalizer.js";

describe("createTempTypeAlias", () => {
  it("builds a __TempInput alias reading the schema's `~types` input", () => {
    expect(createTempTypeAlias("UserSchema", "input")).toBe(
      'type __TempInput = __Normalize<NonNullable<(typeof UserSchema)["~types"]>["input"]>;',
    );
  });

  it("builds a __TempOutput alias reading the schema's `~types` output", () => {
    expect(createTempTypeAlias("UserSchema", "output")).toBe(
      'type __TempOutput = __Normalize<NonNullable<(typeof UserSchema)["~types"]>["output"]>;',
    );
  });

  it("uses the given schema name verbatim, not a fixed placeholder", () => {
    expect(createTempTypeAlias("BrandedCoordSchema", "input")).toBe(
      'type __TempInput = __Normalize<NonNullable<(typeof BrandedCoordSchema)["~types"]>["input"]>;',
    );
  });
});
