import { describe, it, expect } from "vitest";
import { resolve } from "path";
import { ZodTypeExtractor } from "../src/core/extractor.js";
import { formatResult } from "../src/core/type-printer.js";

const fixturesDir = resolve(import.meta.dirname, "fixtures");

describe("ZodTypeExtractor", () => {
  const extractor = new ZodTypeExtractor();

  describe("basic-schema.ts", () => {
    it("should extract UserSchema", () => {
      const result = extractor.extract({
        filePath: resolve(fixturesDir, "basic-schema.ts"),
        schemaName: "UserSchema",
      });
      expect(result).toMatchSnapshot();
    });
  });

  describe("transform-schema.ts", () => {
    it("should extract DateSchema with transforms", () => {
      const result = extractor.extract({
        filePath: resolve(fixturesDir, "transform-schema.ts"),
        schemaName: "DateSchema",
      });
      expect(result).toMatchSnapshot();
    });
  });

  describe("nested-schema.ts", () => {
    it("should extract PersonSchema with nested objects", () => {
      const result = extractor.extract({
        filePath: resolve(fixturesDir, "nested-schema.ts"),
        schemaName: "PersonSchema",
      });
      expect(result).toMatchSnapshot();
    });
  });

  describe("union-schema.ts", () => {
    it("should extract all schemas", () => {
      const results = extractor.extractAll(
        resolve(fixturesDir, "union-schema.ts")
      );
      expect(results).toMatchSnapshot();
    });
  });

  describe("intersection-schema.ts", () => {
    it("should extract all schemas", () => {
      const results = extractor.extractAll(
        resolve(fixturesDir, "intersection-schema.ts")
      );
      expect(results).toMatchSnapshot();
    });
  });

  describe("enum-schema.ts", () => {
    it("should extract all schemas", () => {
      const results = extractor.extractAll(
        resolve(fixturesDir, "enum-schema.ts")
      );
      expect(results).toMatchSnapshot();
    });
  });

  describe("utility-types-schema.ts", () => {
    it("should extract all schemas", () => {
      const results = extractor.extractAll(
        resolve(fixturesDir, "utility-types-schema.ts")
      );
      expect(results).toMatchSnapshot();
    });
  });

  describe("multi-schema.ts", () => {
    it("should extract all schemas", () => {
      const results = extractor.extractAll(
        resolve(fixturesDir, "multi-schema.ts")
      );
      expect(results).toMatchSnapshot();
    });

    it("should extract specific schemas using extractMultiple", () => {
      const results = extractor.extractMultiple(
        resolve(fixturesDir, "multi-schema.ts"),
        ["UserSchema", "PostSchema"]
      );
      expect(results).toMatchSnapshot();
    });

    it("should get schema names from file", () => {
      const names = extractor.getSchemaNames(
        resolve(fixturesDir, "multi-schema.ts")
      );
      expect(names).toMatchSnapshot();
    });
  });

  describe("lazy-schema.ts", () => {
    it("should extract all schemas with circular references", () => {
      const results = extractor.extractAll(
        resolve(fixturesDir, "lazy-schema.ts")
      );
      expect(results).toMatchSnapshot();
    });
  });

  describe("getter-schema.ts", () => {
    it("should extract all getter-based recursive schemas", () => {
      const results = extractor.extractAll(
        resolve(fixturesDir, "getter-schema.ts")
      );
      expect(results).toMatchSnapshot();
    });
  });

  describe("cross-ref-schema.ts", () => {
    it("should extract all schemas with cross-references", () => {
      const results = extractor.extractAll(
        resolve(fixturesDir, "cross-ref-schema.ts")
      );
      expect(results).toMatchSnapshot();
    });
  });

  describe("mixed-export-schema.ts", () => {
    it("should extract all schemas tracking export status", () => {
      const results = extractor.extractAll(
        resolve(fixturesDir, "mixed-export-schema.ts")
      );
      expect(results).toMatchSnapshot();
    });
  });

  describe("union-ref-schema.ts", () => {
    it("should extract all schemas with union references", () => {
      const results = extractor.extractAll(
        resolve(fixturesDir, "union-ref-schema.ts")
      );
      expect(results).toMatchSnapshot();
    });
  });

  describe("brand-schema.ts", () => {
    it("should extract all schemas with brand information", () => {
      const results = extractor.extractAll(
        resolve(fixturesDir, "brand-schema.ts")
      );
      expect(results).toMatchSnapshot();
    });
  });
});

describe("formatResult", () => {
  it("should format result with input and output sections", () => {
    const extractor = new ZodTypeExtractor();
    const result = extractor.extract({
      filePath: resolve(fixturesDir, "basic-schema.ts"),
      schemaName: "UserSchema",
    });

    const formatted = formatResult(result);
    expect(formatted).toMatchSnapshot();
  });

  it("should format result with transforms", () => {
    const extractor = new ZodTypeExtractor();
    const result = extractor.extract({
      filePath: resolve(fixturesDir, "transform-schema.ts"),
      schemaName: "DateSchema",
    });

    const formatted = formatResult(result);
    expect(formatted).toMatchSnapshot();
  });
});
