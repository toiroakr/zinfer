import { describe, it, expect } from "vitest";
import { relativizeImportPaths, relativizeResultImportPaths } from "../src/core/type-printer.js";

const sourceFile = "/repo/src/schemas/schema.ts";
const outputFile = "/repo/out/schemas.generated.ts";

describe("relativizeImportPaths", () => {
  it("rebases source-relative specifiers onto the output file", () => {
    // TypeScript prints module specifiers relative to the schema file, so
    // "../shared/kind" resolves from src/schemas/ - not from out/.
    const content = 'export type A = { kind: import("../shared/kind").Kind };';

    expect(relativizeImportPaths(content, outputFile, sourceFile)).toBe(
      'export type A = { kind: import("../src/shared/kind").Kind };',
    );
  });

  it("rebases same-directory specifiers", () => {
    const content = 'export type A = import("./local").Local;';

    expect(relativizeImportPaths(content, outputFile, sourceFile)).toBe(
      'export type A = import("../src/schemas/local").Local;',
    );
  });

  it("still relativizes absolute paths", () => {
    const content = 'export type A = import("/repo/src/shared/kind").Kind;';

    expect(relativizeImportPaths(content, outputFile, sourceFile)).toBe(
      'export type A = import("../src/shared/kind").Kind;',
    );
  });

  it("relativizes absolute paths without a source file, as before", () => {
    const content = 'export type A = import("/repo/out/nested/kind").Kind;';

    expect(relativizeImportPaths(content, outputFile)).toBe(
      'export type A = import("./nested/kind").Kind;',
    );
  });

  it("leaves source-relative specifiers alone when no source file is given", () => {
    const content = 'export type A = import("../shared/kind").Kind;';

    expect(relativizeImportPaths(content, outputFile)).toBe(content);
  });

  it("leaves bare specifiers and subpath imports untouched", () => {
    const content = [
      'export type A = import("zod").ZodType;',
      'export type B = import("@scope/pkg").Thing;',
      'export type C = import("#/alias").Aliased;',
    ].join("\n");

    expect(relativizeImportPaths(content, outputFile, sourceFile)).toBe(content);
  });
});

describe("relativizeResultImportPaths", () => {
  it("rebases both the input and output type of a result", () => {
    const result = {
      schemaName: "ModelSchema",
      input: '{ kind: import("../shared/kind").Kind }',
      output: '{ kind: import("../shared/kind").Kind }',
      isExported: true,
    };

    expect(relativizeResultImportPaths(result, outputFile, sourceFile)).toEqual({
      ...result,
      input: '{ kind: import("../src/shared/kind").Kind }',
      output: '{ kind: import("../src/shared/kind").Kind }',
    });
  });
});
