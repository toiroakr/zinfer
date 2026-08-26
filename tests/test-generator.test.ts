import { describe, it, expect } from "vitest";
import {
  generateTypeTests,
  createTestSchemaInfo,
  type TestFileInfo,
} from "../src/core/test-generator.js";

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
      "__ZinferCanonBrand<z.output<typeof BrandSchemaUserIdSchema>, __ZinferZodBrandKey>",
    );
  });

  it("keeps the plain input assertion for a branded schema (brands never touch the input side)", () => {
    const output = generateTypeTests([baseFile], { brandStrategy: "local-symbol" });

    expect(output).toContain(
      "expectTypeOf<BrandSchemaUserIdInput>().toEqualTypeOf<z.input<typeof BrandSchemaUserIdSchema>>();",
    );
  });

  it("imports the aliased local __brand symbol, and derives the zod-side brand key without importing a specific zod export, only when a schema actually has a brand", () => {
    const output = generateTypeTests([baseFile], { brandStrategy: "local-symbol" });

    expect(output).toContain("__ZinferZodBrandKey");
    expect(output).not.toMatch(/\bimport\s*\{[^}]*\$brand/);
    expect(output).toContain("__brand as BrandSchema__brand");
  });

  it("emits __ZinferBuildTuple so a branded tuple's element positions are verified rather than widened to a same-element-type array", () => {
    const output = generateTypeTests([baseFile], { brandStrategy: "local-symbol" });

    expect(output).toContain("__ZinferBuildTuple");
  });

  it("does not emit the canonicalization utility when no schema has a brand", () => {
    const noBrandFile: TestFileInfo = {
      ...baseFile,
      schemas: [
        { schemaName: "PlainSchema", inputTypeName: "PlainInput", outputTypeName: "PlainOutput" },
      ],
    };
    const output = generateTypeTests([noBrandFile], { brandStrategy: "local-symbol" });

    expect(output).not.toContain("__ZinferCanonBrand");
    expect(output).not.toContain("__ZinferZodBrandKey");
    expect(output).not.toContain("__ZinferBuildTuple");
    expect(output).not.toContain("__brand");
  });

  it("does not emit the canonicalizing assertion under the default zod-import strategy, even for a branded schema", () => {
    const output = generateTypeTests([baseFile]);

    expect(output).not.toContain("__ZinferCanonBrand");
    expect(output).not.toContain("__ZinferZodBrandKey");
    expect(output).not.toContain("__ZinferBuildTuple");
    expect(output).toContain(
      "expectTypeOf<BrandSchemaUserIdOutput>().toEqualTypeOf<z.output<typeof BrandSchemaUserIdSchema>>();",
    );
  });
});

describe("createTestSchemaInfo", () => {
  it("threads an explicit hasBrand through to the returned TestSchemaInfo", () => {
    const info = createTestSchemaInfo(
      "UserIdSchema",
      {
        originalName: "UserIdSchema",
        inputName: "UserIdInput",
        outputName: "UserIdOutput",
        unifiedName: "UserIdOutput",
      },
      true,
    );

    expect(info.hasBrand).toBe(true);
  });

  it("leaves hasBrand undefined when not passed (defaults to the plain toEqualTypeOf assertion)", () => {
    const info = createTestSchemaInfo("PlainSchema", {
      originalName: "PlainSchema",
      inputName: "PlainInput",
      outputName: "PlainOutput",
      unifiedName: "PlainOutput",
    });

    expect(info.hasBrand).toBeUndefined();
  });
});
