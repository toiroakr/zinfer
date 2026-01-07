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
