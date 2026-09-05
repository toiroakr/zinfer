import { describe, it, expect } from "vitest";
import { resolve } from "path";
import { Project } from "ts-morph";
import { SchemaDetector } from "../src/core/schema-detector.js";

const fixturesDir = resolve(import.meta.dirname, "fixtures");

describe("SchemaDetector", () => {
  const detector = new SchemaDetector();

  function getSourceFile(filename: string) {
    const project = new Project();
    return project.addSourceFileAtPath(resolve(fixturesDir, filename));
  }

  describe("detectExportedSchemas", () => {
    it("should detect schemas from basic-schema.ts", () => {
      const sourceFile = getSourceFile("basic-schema.ts");
      const schemas = detector.detectExportedSchemas(sourceFile);
      expect(schemas).toMatchSnapshot();
    });

    it("should detect schemas from multi-schema.ts", () => {
      const sourceFile = getSourceFile("multi-schema.ts");
      const schemas = detector.detectExportedSchemas(sourceFile);
      expect(schemas).toMatchSnapshot();
    });

    it("should detect schemas from utility-types-schema.ts", () => {
      const sourceFile = getSourceFile("utility-types-schema.ts");
      const schemas = detector.detectExportedSchemas(sourceFile);
      expect(schemas).toMatchSnapshot();
    });

    it("should detect schemas from union-schema.ts", () => {
      const sourceFile = getSourceFile("union-schema.ts");
      const schemas = detector.detectExportedSchemas(sourceFile);
      expect(schemas).toMatchSnapshot();
    });

    it("should detect schemas from mixed-export-schema.ts", () => {
      const sourceFile = getSourceFile("mixed-export-schema.ts");
      const schemas = detector.detectExportedSchemas(sourceFile);
      expect(schemas).toMatchSnapshot();
    });

    it("should detect schemas whose builder chain is formatted across multiple lines", () => {
      // Inline source keeps the line breaks that formatters like prettier
      // insert between "z" and the builder method, which fixtures on disk
      // would lose to this repository's own formatter.
      const project = new Project();
      const sourceFile = project.createSourceFile(
        "multiline-schema.ts",
        [
          'import { z } from "zod";',
          "export const MultilineUnionSchema = z",
          '  .union([z.literal("active"), z.literal("inactive")])',
          '  .describe("status of the entity");',
          "export const MultilineStringSchema = z",
          "  .string()",
          "  .min(1)",
          '  .describe("non-empty string");',
          "export const MultilineLazySchema = z",
          "  .lazy(() => z.object({ name: z.string() }));",
        ].join("\n"),
      );
      const names = detector.detectExportedSchemas(sourceFile).map((s) => s.name);
      expect(names).toEqual([
        "MultilineUnionSchema",
        "MultilineStringSchema",
        "MultilineLazySchema",
      ]);
    });

    it("should detect a bare z.templateLiteral() declaration", () => {
      // A z.templateLiteral() call with nothing chained onto it has no
      // ".describe("/".optional("/... to fall back on, so it is only ever
      // found by the builder-name check - and being skipped there means the
      // schema is silently dropped from the output entirely.
      const project = new Project();
      const sourceFile = project.createSourceFile(
        "template-literal-inline.ts",
        [
          'import { z } from "zod";',
          'export const EnumPartSchema = z.templateLiteral(["v", z.enum(["1", "2"])]);',
          'export const StringPartSchema = z.templateLiteral(["hello, ", z.string()]);',
          "export const MultilineSchema = z",
          '  .templateLiteral(["n", z.number()]);',
        ].join("\n"),
      );
      const names = detector.detectExportedSchemas(sourceFile).map((s) => s.name);
      expect(names).toEqual(["EnumPartSchema", "StringPartSchema", "MultilineSchema"]);
    });

    it("should detect schemas from template-literal-schema.ts", () => {
      const sourceFile = getSourceFile("template-literal-schema.ts");
      const schemas = detector.detectExportedSchemas(sourceFile);
      expect(schemas).toMatchSnapshot();
    });
  });

  describe("getSchemaNames", () => {
    it("should return schema names from basic-schema.ts", () => {
      const sourceFile = getSourceFile("basic-schema.ts");
      const names = detector.getSchemaNames(sourceFile);
      expect(names).toMatchSnapshot();
    });

    it("should return schema names from multi-schema.ts", () => {
      const sourceFile = getSourceFile("multi-schema.ts");
      const names = detector.getSchemaNames(sourceFile);
      expect(names).toMatchSnapshot();
    });
  });
});
