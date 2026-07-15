import { describe, it, expect, beforeEach } from "vitest";
import { resolve } from "path";
import { TsgoHost } from "../src/core/tsgo-host.js";
import { ImportResolver } from "../src/core/import-resolver.js";

const fixturesDir = resolve(import.meta.dirname, "fixtures");

describe("ImportResolver", () => {
  let resolver: ImportResolver;
  let host: TsgoHost;

  beforeEach(() => {
    resolver = new ImportResolver();
    host = new TsgoHost();
  });

  describe("findImportedSchemas", () => {
    it("should find imported schemas from local files", () => {
      const consumerPath = resolve(fixturesDir, "import-test/consumer.ts");
      const sourceFile = host.getSourceFile(consumerPath);

      const importedSchemas = resolver.findImportedSchemas(sourceFile, host.project);

      expect(importedSchemas.size).toBe(2);
      expect(importedSchemas.has("SharedSchema")).toBe(true);
      expect(importedSchemas.has("AnotherSharedSchema")).toBe(true);

      const sharedInfo = importedSchemas.get("SharedSchema")!;
      expect(sharedInfo.localName).toBe("SharedSchema");
      expect(sharedInfo.originalName).toBe("SharedSchema");
      expect(sharedInfo.resolved).toBe(true);
      expect(sharedInfo.sourceFilePath).toContain("shared.ts");
    });

    it("should resolve re-exports through an index file", () => {
      const reExportConsumerPath = resolve(fixturesDir, "import-test/re-export-consumer.ts");
      const sourceFile = host.getSourceFile(reExportConsumerPath);

      const importedSchemas = resolver.findImportedSchemas(sourceFile, host.project);

      // Unlike ts-morph's getModuleSpecifierSourceFile (which has a known
      // limitation resolving named imports through an intermediate
      // re-export index file), this resolves correctly because
      // Checker.getSymbolAtLocation performs real module resolution.
      expect(importedSchemas.has("SharedSchema")).toBe(true);
      const sharedInfo = importedSchemas.get("SharedSchema")!;
      expect(sharedInfo.resolved).toBe(true);
      expect(sharedInfo.sourceFilePath).toContain("shared.ts");
    });

    it("should ignore node_modules imports", () => {
      const consumerPath = resolve(fixturesDir, "import-test/consumer.ts");
      const sourceFile = host.getSourceFile(consumerPath);

      const importedSchemas = resolver.findImportedSchemas(sourceFile, host.project);

      // Should not include 'z' from zod
      expect(importedSchemas.has("z")).toBe(false);
    });

    it("should return empty map for files with no local imports", () => {
      const sharedPath = resolve(fixturesDir, "import-test/shared.ts");
      const sourceFile = host.getSourceFile(sharedPath);

      const importedSchemas = resolver.findImportedSchemas(sourceFile, host.project);

      expect(importedSchemas.size).toBe(0);
    });

    it("should resolve subpath imports with a wildcard pattern (#/*)", () => {
      const consumerPath = resolve(fixturesDir, "subpath-import/consumer.ts");
      const sourceFile = host.getSourceFile(consumerPath);

      const importedSchemas = resolver.findImportedSchemas(sourceFile, host.project);

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
      const sourceFile = host.getSourceFile(consumerPath);

      const importedSchemas = resolver.findImportedSchemas(sourceFile, host.project);

      expect(importedSchemas.has("SharedSchema")).toBe(true);
      const sharedInfo = importedSchemas.get("SharedSchema")!;
      expect(sharedInfo.resolved).toBe(true);
      expect(sharedInfo.sourceFilePath).toContain("subpath-import/schemas/shared.ts");
    });
  });
});
