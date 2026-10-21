import { afterEach } from "vitest";
import { describe, it, expect, beforeEach } from "vitest";
import { resolve } from "path";
import { Project } from "@zinfer-monorepo/core";
import { ImportResolver } from "../src/core/import-resolver.js";
import { SchemaDetector } from "../src/core/schema-detector.js";

const fixturesDir = resolve(import.meta.dirname, "fixtures");

describe("ImportResolver", () => {
  let resolver: ImportResolver;
  let project: Project;
  afterEach(() => project.close());

  beforeEach(() => {
    resolver = new ImportResolver(new SchemaDetector());
    project = new Project({
      tsConfigFilePath: resolve(import.meta.dirname, "..", "tsconfig.json"),
    });
  });

  describe("findImportedSchemas", () => {
    it("should find imported schemas from local files", () => {
      const consumerPath = resolve(fixturesDir, "import-test/consumer.ts");
      const sourceFile = project.addSourceFileAtPath(consumerPath);

      const importedSchemas = resolver.findImportedSchemas(sourceFile, project);

      expect(importedSchemas.size).toBe(2);
      expect(importedSchemas.has("SharedSchema")).toBe(true);
      expect(importedSchemas.has("AnotherSharedSchema")).toBe(true);

      const sharedInfo = importedSchemas.get("SharedSchema")!;
      expect(sharedInfo.localName).toBe("SharedSchema");
      expect(sharedInfo.originalName).toBe("SharedSchema");
      expect(sharedInfo.resolved).toBe(true);
      expect(sharedInfo.sourceFilePath).toContain("shared.ts");
    });

    it("should handle re-exports from index files", () => {
      const reExportConsumerPath = resolve(fixturesDir, "import-test/re-export-consumer.ts");
      const sourceFile = project.addSourceFileAtPath(reExportConsumerPath);

      const importedSchemas = resolver.findImportedSchemas(sourceFile, project);

      expect(importedSchemas.size).toBe(1);
      const sharedInfo = importedSchemas.get("SharedSchema")!;
      expect(sharedInfo.resolved).toBe(true);
      expect(sharedInfo.sourceFilePath).toContain("shared.ts");
    });

    it("should ignore node_modules imports", () => {
      const consumerPath = resolve(fixturesDir, "import-test/consumer.ts");
      const sourceFile = project.addSourceFileAtPath(consumerPath);

      const importedSchemas = resolver.findImportedSchemas(sourceFile, project);

      // Should not include 'v' from valibot
      expect(importedSchemas.has("v")).toBe(false);
    });

    it("should return empty map for files with no local imports", () => {
      const sharedPath = resolve(fixturesDir, "import-test/shared.ts");
      const sourceFile = project.addSourceFileAtPath(sharedPath);

      const importedSchemas = resolver.findImportedSchemas(sourceFile, project);

      expect(importedSchemas.size).toBe(0);
    });

    it("should resolve subpath imports with a wildcard pattern (#/*)", () => {
      const consumerPath = resolve(fixturesDir, "subpath-import/consumer.ts");
      const sourceFile = project.addSourceFileAtPath(consumerPath);

      const importedSchemas = resolver.findImportedSchemas(sourceFile, project);

      expect(importedSchemas.size).toBe(2);
      expect(importedSchemas.has("SharedSchema")).toBe(true);
      expect(importedSchemas.has("AnotherSharedSchema")).toBe(true);

      const sharedInfo = importedSchemas.get("SharedSchema")!;
      expect(sharedInfo.localName).toBe("SharedSchema");
      expect(sharedInfo.originalName).toBe("SharedSchema");
      expect(sharedInfo.resolved).toBe(true);
      expect(sharedInfo.sourceFilePath).toContain("subpath-import/schemas/shared.ts");
    });

    it("should resolve exact (non-wildcard) subpath imports", () => {
      const consumerPath = resolve(fixturesDir, "subpath-import/exact-consumer.ts");
      const sourceFile = project.addSourceFileAtPath(consumerPath);

      const importedSchemas = resolver.findImportedSchemas(sourceFile, project);

      expect(importedSchemas.has("SharedSchema")).toBe(true);
      const sharedInfo = importedSchemas.get("SharedSchema")!;
      expect(sharedInfo.resolved).toBe(true);
      expect(sharedInfo.sourceFilePath).toContain("subpath-import/schemas/shared.ts");
    });
  });
});
