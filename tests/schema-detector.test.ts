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
    it("should detect single exported schema", () => {
      const sourceFile = getSourceFile("basic-schema.ts");
      const schemas = detector.detectExportedSchemas(sourceFile);

      expect(schemas).toHaveLength(1);
      expect(schemas[0].name).toBe("UserSchema");
      expect(schemas[0].isExported).toBe(true);
    });

    it("should detect multiple exported schemas", () => {
      const sourceFile = getSourceFile("multi-schema.ts");
      const schemas = detector.detectExportedSchemas(sourceFile);

      const names = schemas.map((s) => s.name);

      // Should include exported schemas
      expect(names).toContain("UserSchema");
      expect(names).toContain("PostSchema");
      expect(names).toContain("CommentSchema");
      expect(names).toContain("DateStringSchema");

      // Should NOT include non-exported internal schema
      // (InternalHelperSchema is not exported directly)
      // But AliasedSchema (re-export of InternalHelperSchema) should be detected
      expect(names).toContain("AliasedSchema");
    });

    it("should detect schemas with zod method chains", () => {
      const sourceFile = getSourceFile("utility-types-schema.ts");
      const schemas = detector.detectExportedSchemas(sourceFile);

      const names = schemas.map((s) => s.name);

      expect(names).toContain("PartialUserSchema");
      expect(names).toContain("UserIdNameSchema");
      expect(names).toContain("UserWithoutEmailSchema");
    });

    it("should detect union and intersection schemas", () => {
      const sourceFile = getSourceFile("union-schema.ts");
      const schemas = detector.detectExportedSchemas(sourceFile);

      const names = schemas.map((s) => s.name);

      expect(names).toContain("StatusSchema");
      expect(names).toContain("ResultSchema");
      expect(names).toContain("StringOrNumberSchema");
    });
  });

  describe("getSchemaNames", () => {
    it("should return schema names only", () => {
      const sourceFile = getSourceFile("basic-schema.ts");
      const names = detector.getSchemaNames(sourceFile);

      expect(names).toEqual(["UserSchema"]);
    });
  });
});
