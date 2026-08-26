import { describe, it, expect } from "vitest";
import { generateTypeTests, type TestFileInfo } from "../src/core/test-generator.js";

const baseFile: TestFileInfo = {
  schemaFilePath: "../fixtures/brand-schema",
  typesFilePath: "./brand-schema",
  importPrefix: "BrandSchema",
  schemas: [
    {
      schemaName: "UserIdSchema",
      inputTypeName: "UserIdInput",
      outputTypeName: "UserIdOutput",
      hasBrand: true,
    },
    {
      schemaName: "PlainSchema",
      inputTypeName: "PlainInput",
      outputTypeName: "PlainOutput",
      hasBrand: false,
    },
  ],
};

describe("generateTypeTests (brandStrategy: local-symbol)", () => {
  it("keeps the plain toEqualTypeOf assertion for a non-branded schema", () => {
    const output = generateTypeTests([baseFile], { brandStrategy: "local-symbol" });

    expect(output).toContain(
      "expectTypeOf<BrandSchemaPlainOutput>().toEqualTypeOf<z.output<typeof BrandSchemaPlainSchema>>();",
    );
  });

  it("uses a brand-canonicalizing assertion instead of plain toEqualTypeOf for a branded schema's output", () => {
    const output = generateTypeTests([baseFile], { brandStrategy: "local-symbol" });

    expect(output).not.toContain(
      "expectTypeOf<BrandSchemaUserIdOutput>().toEqualTypeOf<z.output<typeof BrandSchemaUserIdSchema>>();",
    );
    expect(output).toContain(
      "__ZinferCanonBrand<BrandSchemaUserIdOutput, typeof BrandSchema__brand>",
    );
    expect(output).toContain(
      "__ZinferCanonBrand<z.output<typeof BrandSchemaUserIdSchema>, typeof $brand>",
    );
  });

  it("keeps the plain input assertion for a branded schema (brands never touch the input side)", () => {
    const output = generateTypeTests([baseFile], { brandStrategy: "local-symbol" });

    expect(output).toContain(
      "expectTypeOf<BrandSchemaUserIdInput>().toEqualTypeOf<z.input<typeof BrandSchemaUserIdSchema>>();",
    );
  });

  it("imports $brand from zod and the aliased local __brand symbol only when a schema actually has a brand", () => {
    const output = generateTypeTests([baseFile], { brandStrategy: "local-symbol" });

    expect(output).toContain("$brand");
    expect(output).toContain("__brand as BrandSchema__brand");
  });

  it("does not import $brand or emit the canonicalization utility when no schema has a brand", () => {
    const noBrandFile: TestFileInfo = {
      ...baseFile,
      schemas: [
        { schemaName: "PlainSchema", inputTypeName: "PlainInput", outputTypeName: "PlainOutput" },
      ],
    };
    const output = generateTypeTests([noBrandFile], { brandStrategy: "local-symbol" });

    expect(output).not.toContain("$brand");
    expect(output).not.toContain("__ZinferCanonBrand");
    expect(output).not.toContain("__brand");
  });

  it("does not import $brand or use the canonicalizing assertion under the default zod-import strategy, even for a branded schema", () => {
    const output = generateTypeTests([baseFile]);

    expect(output).not.toContain("$brand");
    expect(output).not.toContain("__ZinferCanonBrand");
    expect(output).toContain(
      "expectTypeOf<BrandSchemaUserIdOutput>().toEqualTypeOf<z.output<typeof BrandSchemaUserIdSchema>>();",
    );
  });
});
