import { describe, it, expect } from "vitest";
import { resolve } from "path";
import { ZodTypeExtractor } from "../src/core/extractor.js";
import {
  formatAsDeclaration,
  generateDeclarationFile
} from "../src/core/type-printer.js";
import { createNameMapper } from "../src/core/name-mapper.js";

const fixturesDir = resolve(import.meta.dirname, "fixtures");
const mapName = createNameMapper({ removeSuffix: "Schema" });

describe("ZodTypeExtractor - Generated TypeScript Declarations", () => {
  const extractor = new ZodTypeExtractor();

  describe("basic-schema.ts", () => {
    it("should generate TypeScript declarations", () => {
      const results = extractor.extractAll(
        resolve(fixturesDir, "basic-schema.ts")
      );
      const output = generateDeclarationFile(
        results,
        mapName
      );
      expect(output).toMatchSnapshot();
    });
  });

  describe("transform-schema.ts", () => {
    it("should generate TypeScript declarations with transforms", () => {
      const results = extractor.extractAll(
        resolve(fixturesDir, "transform-schema.ts")
      );
      const output = generateDeclarationFile(
        results,
        mapName
      );
      expect(output).toMatchSnapshot();
    });
  });

  describe("nested-schema.ts", () => {
    it("should generate TypeScript declarations with nested objects", () => {
      const results = extractor.extractAll(
        resolve(fixturesDir, "nested-schema.ts")
      );
      const output = generateDeclarationFile(
        results,
        mapName
      );
      expect(output).toMatchSnapshot();
    });
  });

  describe("union-schema.ts", () => {
    it("should generate TypeScript declarations with unions", () => {
      const results = extractor.extractAll(
        resolve(fixturesDir, "union-schema.ts")
      );
      const output = generateDeclarationFile(
        results,
        mapName
      );
      expect(output).toMatchSnapshot();
    });
  });

  describe("intersection-schema.ts", () => {
    it("should generate TypeScript declarations with intersections", () => {
      const results = extractor.extractAll(
        resolve(fixturesDir, "intersection-schema.ts")
      );
      const output = generateDeclarationFile(
        results,
        mapName
      );
      expect(output).toMatchSnapshot();
    });
  });

  describe("enum-schema.ts", () => {
    it("should generate TypeScript declarations with enums", () => {
      const results = extractor.extractAll(
        resolve(fixturesDir, "enum-schema.ts")
      );
      const output = generateDeclarationFile(
        results,
        mapName
      );
      expect(output).toMatchSnapshot();
    });
  });

  describe("utility-types-schema.ts", () => {
    it("should generate TypeScript declarations with utility types", () => {
      const results = extractor.extractAll(
        resolve(fixturesDir, "utility-types-schema.ts")
      );
      const output = generateDeclarationFile(
        results,
        mapName
      );
      expect(output).toMatchSnapshot();
    });
  });

  describe("multi-schema.ts", () => {
    it("should generate TypeScript declarations for multiple schemas", () => {
      const results = extractor.extractAll(
        resolve(fixturesDir, "multi-schema.ts")
      );
      const output = generateDeclarationFile(
        results,
        mapName
      );
      expect(output).toMatchSnapshot();
    });
  });

  describe("lazy-schema.ts", () => {
    it("should generate TypeScript declarations with circular references", () => {
      const results = extractor.extractAll(
        resolve(fixturesDir, "lazy-schema.ts")
      );
      const output = generateDeclarationFile(
        results,
        mapName
      );
      expect(output).toMatchSnapshot();
    });
  });

  describe("getter-schema.ts", () => {
    it("should generate TypeScript declarations with getter-based recursive schemas", () => {
      const results = extractor.extractAll(
        resolve(fixturesDir, "getter-schema.ts")
      );
      const output = generateDeclarationFile(
        results,
        mapName
      );
      expect(output).toMatchSnapshot();
    });
  });

  describe("cross-ref-schema.ts", () => {
    it("should generate TypeScript declarations with cross-references", () => {
      const results = extractor.extractAll(
        resolve(fixturesDir, "cross-ref-schema.ts")
      );
      const output = generateDeclarationFile(
        results,
        mapName
      );
      expect(output).toMatchSnapshot();
    });
  });

  describe("mixed-export-schema.ts", () => {
    it("should generate TypeScript declarations respecting export status", () => {
      const results = extractor.extractAll(
        resolve(fixturesDir, "mixed-export-schema.ts")
      );
      const output = generateDeclarationFile(
        results,
        mapName
      );
      expect(output).toMatchSnapshot();
    });
  });

  describe("union-ref-schema.ts", () => {
    it("should generate TypeScript declarations with union references", () => {
      const results = extractor.extractAll(
        resolve(fixturesDir, "union-ref-schema.ts")
      );
      const output = generateDeclarationFile(
        results,
        mapName
      );
      expect(output).toMatchSnapshot();
    });
  });

  describe("brand-schema.ts", () => {
    it("should generate TypeScript declarations with brand information", () => {
      const results = extractor.extractAll(
        resolve(fixturesDir, "brand-schema.ts")
      );
      const output = generateDeclarationFile(
        results,
        mapName
      );
      expect(output).toMatchSnapshot();
    });
  });

  describe("declaration options", () => {
    it("should generate with inputOnly option", () => {
      const results = extractor.extractAll(
        resolve(fixturesDir, "transform-schema.ts")
      );
      const output = generateDeclarationFile(
        results,
        mapName,
        { inputOnly: true }
      );
      expect(output).toMatchSnapshot();
    });

    it("should generate with outputOnly option", () => {
      const results = extractor.extractAll(
        resolve(fixturesDir, "transform-schema.ts")
      );
      const output = generateDeclarationFile(
        results,
        mapName,
        { outputOnly: true }
      );
      expect(output).toMatchSnapshot();
    });

    it("should generate with unifyIfSame option", () => {
      const results = extractor.extractAll(
        resolve(fixturesDir, "basic-schema.ts")
      );
      const output = generateDeclarationFile(
        results,
        mapName,
        { unifyIfSame: true }
      );
      expect(output).toMatchSnapshot();
    });
  });
});
