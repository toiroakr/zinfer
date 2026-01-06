import { describe, it, expect } from "vitest";
import { resolve } from "path";
import { ZodTypeExtractor } from "../src/core/extractor.js";
import { formatResult } from "../src/core/type-printer.js";

const fixturesDir = resolve(import.meta.dirname, "fixtures");

describe("ZodTypeExtractor", () => {
  describe("basic schema extraction", () => {
    it("should extract input type from basic schema", () => {
      const extractor = new ZodTypeExtractor();
      const result = extractor.extract({
        filePath: resolve(fixturesDir, "basic-schema.ts"),
        schemaName: "UserSchema",
      });

      expect(result.input).toContain("id:");
      expect(result.input).toContain("string");
      expect(result.input).toContain("name:");
      expect(result.input).toContain("age");
    });

    it("should have identical input and output for basic schema without transforms", () => {
      const extractor = new ZodTypeExtractor();
      const result = extractor.extract({
        filePath: resolve(fixturesDir, "basic-schema.ts"),
        schemaName: "UserSchema",
      });

      expect(result.input).toBe(result.output);
    });
  });

  describe("transform schema extraction", () => {
    it("should show different input/output types when transforms are used", () => {
      const extractor = new ZodTypeExtractor();
      const result = extractor.extract({
        filePath: resolve(fixturesDir, "transform-schema.ts"),
        schemaName: "DateSchema",
      });

      // Input should have string types
      expect(result.input).toContain("createdAt:");
      expect(result.input).toContain("count:");

      // Output should have transformed types (Date and number)
      expect(result.output).toContain("Date");
      expect(result.output).toContain("number");
    });
  });

  describe("nested schema extraction", () => {
    it("should expand nested object types", () => {
      const extractor = new ZodTypeExtractor();
      const result = extractor.extract({
        filePath: resolve(fixturesDir, "nested-schema.ts"),
        schemaName: "PersonSchema",
      });

      // Should contain nested address properties
      expect(result.input).toContain("street:");
      expect(result.input).toContain("city:");
      expect(result.input).toContain("zipCode:");
      expect(result.input).toContain("alternateAddresses:");
    });
  });

  describe("union schema extraction", () => {
    it("should extract literal union types", () => {
      const extractor = new ZodTypeExtractor();
      const result = extractor.extract({
        filePath: resolve(fixturesDir, "union-schema.ts"),
        schemaName: "StatusSchema",
      });

      expect(result.input).toContain("active");
      expect(result.input).toContain("inactive");
      expect(result.input).toContain("pending");
    });

    it("should extract discriminated union types", () => {
      const extractor = new ZodTypeExtractor();
      const result = extractor.extract({
        filePath: resolve(fixturesDir, "union-schema.ts"),
        schemaName: "ResultSchema",
      });

      expect(result.input).toContain("type:");
      expect(result.input).toContain("success");
      expect(result.input).toContain("error");
    });
  });

  describe("intersection schema extraction", () => {
    it("should extract intersection types", () => {
      const extractor = new ZodTypeExtractor();
      const result = extractor.extract({
        filePath: resolve(fixturesDir, "intersection-schema.ts"),
        schemaName: "EntitySchema",
      });

      // Should contain properties from both schemas
      expect(result.input).toContain("id:");
      expect(result.input).toContain("createdAt:");
      expect(result.input).toContain("updatedAt:");
    });

    it("should extract merged schemas", () => {
      const extractor = new ZodTypeExtractor();
      const result = extractor.extract({
        filePath: resolve(fixturesDir, "intersection-schema.ts"),
        schemaName: "MergedSchema",
      });

      expect(result.input).toContain("id:");
      expect(result.input).toContain("createdAt:");
    });
  });

  describe("enum schema extraction", () => {
    it("should extract zod enum types", () => {
      const extractor = new ZodTypeExtractor();
      const result = extractor.extract({
        filePath: resolve(fixturesDir, "enum-schema.ts"),
        schemaName: "DirectionSchema",
      });

      expect(result.input).toContain("north");
      expect(result.input).toContain("south");
      expect(result.input).toContain("east");
      expect(result.input).toContain("west");
    });

    it("should extract native enum types", () => {
      const extractor = new ZodTypeExtractor();
      const result = extractor.extract({
        filePath: resolve(fixturesDir, "enum-schema.ts"),
        schemaName: "ColorSchema",
      });

      // Native enum is preserved as the enum type name
      expect(result.input).toBe("Color");
    });
  });

  describe("utility types schema extraction", () => {
    it("should extract partial types with optional properties", () => {
      const extractor = new ZodTypeExtractor();
      const result = extractor.extract({
        filePath: resolve(fixturesDir, "utility-types-schema.ts"),
        schemaName: "PartialUserSchema",
      });

      // All properties should be optional
      expect(result.input).toContain("id?:");
      expect(result.input).toContain("name?:");
    });

    it("should extract picked types", () => {
      const extractor = new ZodTypeExtractor();
      const result = extractor.extract({
        filePath: resolve(fixturesDir, "utility-types-schema.ts"),
        schemaName: "UserIdNameSchema",
      });

      expect(result.input).toContain("id:");
      expect(result.input).toContain("name:");
      // Should NOT contain omitted fields
      expect(result.input).not.toContain("email:");
      expect(result.input).not.toContain("age:");
    });

    it("should extract omitted types", () => {
      const extractor = new ZodTypeExtractor();
      const result = extractor.extract({
        filePath: resolve(fixturesDir, "utility-types-schema.ts"),
        schemaName: "UserWithoutEmailSchema",
      });

      expect(result.input).toContain("id:");
      expect(result.input).toContain("name:");
      expect(result.input).toContain("age:");
      // Should NOT contain email
      expect(result.input).not.toContain("email:");
    });
  });

  describe("multi-schema file extraction", () => {
    it("should extract individual schemas from multi-schema file", () => {
      const extractor = new ZodTypeExtractor();

      const userResult = extractor.extract({
        filePath: resolve(fixturesDir, "multi-schema.ts"),
        schemaName: "UserSchema",
      });
      expect(userResult.input).toContain("id:");
      expect(userResult.input).toContain("email:");

      const postResult = extractor.extract({
        filePath: resolve(fixturesDir, "multi-schema.ts"),
        schemaName: "PostSchema",
      });
      expect(postResult.input).toContain("title:");
      expect(postResult.input).toContain("authorId:");
    });

    it("should extract all schemas using extractAll", () => {
      const extractor = new ZodTypeExtractor();
      const results = extractor.extractAll(
        resolve(fixturesDir, "multi-schema.ts")
      );

      // Should extract multiple schemas
      expect(results.length).toBeGreaterThanOrEqual(4);

      const names = results.map((r) => r.schemaName);
      expect(names).toContain("UserSchema");
      expect(names).toContain("PostSchema");
      expect(names).toContain("CommentSchema");
    });

    it("should extract specific schemas using extractMultiple", () => {
      const extractor = new ZodTypeExtractor();
      const results = extractor.extractMultiple(
        resolve(fixturesDir, "multi-schema.ts"),
        ["UserSchema", "PostSchema"]
      );

      expect(results).toHaveLength(2);
      expect(results[0].schemaName).toBe("UserSchema");
      expect(results[1].schemaName).toBe("PostSchema");
    });

    it("should get schema names from file", () => {
      const extractor = new ZodTypeExtractor();
      const names = extractor.getSchemaNames(
        resolve(fixturesDir, "multi-schema.ts")
      );

      expect(names).toContain("UserSchema");
      expect(names).toContain("PostSchema");
    });
  });

  describe("circular reference (z.lazy) extraction", () => {
    it("should extract schemas with explicit type annotations (getter pattern)", () => {
      const extractor = new ZodTypeExtractor();
      const result = extractor.extract({
        filePath: resolve(fixturesDir, "lazy-schema.ts"),
        schemaName: "CategorySchema",
      });

      // Should return the explicit type name
      expect(result.input).toBe("CategoryInterface");
      expect(result.input).not.toContain("any");
    });

    it("should extract self-referencing tree schema (getter pattern)", () => {
      const extractor = new ZodTypeExtractor();
      const result = extractor.extract({
        filePath: resolve(fixturesDir, "lazy-schema.ts"),
        schemaName: "TreeNodeSchema",
      });

      // Should return the explicit type name
      expect(result.input).toBe("TreeNodeInterface");
      expect(result.input).not.toContain("any");
    });

    it("should extract recursive union schema with z.lazy (legacy pattern)", () => {
      const extractor = new ZodTypeExtractor();
      const result = extractor.extract({
        filePath: resolve(fixturesDir, "lazy-schema.ts"),
        schemaName: "JsonValueSchema",
      });

      // Should contain the recursive type reference
      expect(result.input).toContain("JsonValue");
      expect(result.input).not.toContain("any");
    });

    it("should have identical input and output for explicit type schemas", () => {
      const extractor = new ZodTypeExtractor();
      const result = extractor.extract({
        filePath: resolve(fixturesDir, "lazy-schema.ts"),
        schemaName: "CategorySchema",
      });

      expect(result.input).toBe(result.output);
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

    expect(formatted).toContain("// input");
    expect(formatted).toContain("// output");
  });
});
