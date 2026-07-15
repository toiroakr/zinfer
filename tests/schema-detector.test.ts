import { describe, it, expect } from "vitest";
import { resolve } from "path";
import { TsgoHost } from "../src/core/tsgo-host.js";
import { SchemaDetector } from "../src/core/schema-detector.js";

const fixturesDir = resolve(import.meta.dirname, "fixtures");

describe("SchemaDetector", () => {
  const detector = new SchemaDetector();
  const host = new TsgoHost();

  function getSourceFile(filename: string) {
    return host.getSourceFile(resolve(fixturesDir, filename));
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
      const sourceFile = host.createVirtualSourceFile(
        resolve(fixturesDir, "multiline-schema.ts"),
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
