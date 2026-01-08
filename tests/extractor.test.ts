import { describe, it, expect, afterAll } from "vitest";
import { resolve } from "path";
import { ZodTypeExtractor } from "../src/core/extractor.js";
import { generateDeclarationFile } from "../src/core/type-printer.js";
import { createNameMapper } from "../src/core/name-mapper.js";
import { execSync } from "child_process";
import { readdirSync } from "fs";

const fixturesDir = resolve(import.meta.dirname, "fixtures");
const snapshotsDir = resolve(import.meta.dirname, "__file_snapshots__");
const mapName = createNameMapper({ removeSuffix: "Schema" });

// After all tests, run tsc on all generated snapshots
afterAll(() => {
  try {
    const snapshotFiles = readdirSync(snapshotsDir)
      .filter((f) => f.endsWith(".ts"))
      .map((f) => resolve(snapshotsDir, f));

    if (snapshotFiles.length === 0) {
      console.log("No snapshot files found to type-check");
      return;
    }

    console.log(`\nType-checking ${snapshotFiles.length} snapshot files...`);

    for (const file of snapshotFiles) {
      try {
        execSync(`npx tsc --noEmit "${file}"`, {
          stdio: "pipe",
          encoding: "utf-8",
        });
        console.log(`✓ ${file.split("/").pop()}`);
      } catch (error: any) {
        // Filter out zod locale errors
        // tsc outputs errors to stdout, not stderr
        const output = error.stdout || error.stderr || "";
        const relevantErrors = output
          .split("\n")
          .filter(
            (line: string) =>
              line.includes("error TS") &&
              !line.includes("esModuleInterop") &&
              !line.includes("locales"),
          )
          .join("\n");

        if (relevantErrors) {
          console.error(`✗ ${file.split("/").pop()}`);
          console.error(relevantErrors);
          throw new Error(`Type check failed for ${file}`);
        }
      }
    }

    console.log(`\n✓ All ${snapshotFiles.length} snapshot files passed type-check\n`);
  } catch (error: any) {
    if (error.code === "ENOENT") {
      console.log("Snapshots directory not found, skipping type-check");
    } else {
      throw error;
    }
  }
}, 60000); // 60 second timeout for type checking all snapshot files

describe("ZodTypeExtractor - Generated TypeScript Declarations", () => {
  const extractor = new ZodTypeExtractor();

  describe("basic-schema.ts", () => {
    it("should generate TypeScript declarations", async () => {
      const results = extractor.extractAll(resolve(fixturesDir, "basic-schema.ts"));
      const output = generateDeclarationFile(results, mapName);
      await expect(output).toMatchFileSnapshot("__file_snapshots__/basic-schema.ts");
    });
  });

  describe("transform-schema.ts", () => {
    it("should generate TypeScript declarations with transforms", async () => {
      const results = extractor.extractAll(resolve(fixturesDir, "transform-schema.ts"));
      const output = generateDeclarationFile(results, mapName);
      await expect(output).toMatchFileSnapshot("__file_snapshots__/transform-schema.ts");
    });
  });

  describe("nested-schema.ts", () => {
    it("should generate TypeScript declarations with nested objects", async () => {
      const results = extractor.extractAll(resolve(fixturesDir, "nested-schema.ts"));
      const output = generateDeclarationFile(results, mapName);
      await expect(output).toMatchFileSnapshot("__file_snapshots__/nested-schema.ts");
    });
  });

  describe("union-schema.ts", () => {
    it("should generate TypeScript declarations with unions", async () => {
      const results = extractor.extractAll(resolve(fixturesDir, "union-schema.ts"));
      const output = generateDeclarationFile(results, mapName);
      await expect(output).toMatchFileSnapshot("__file_snapshots__/union-schema.ts");
    });
  });

  describe("intersection-schema.ts", () => {
    it("should generate TypeScript declarations with intersections", async () => {
      const results = extractor.extractAll(resolve(fixturesDir, "intersection-schema.ts"));
      const output = generateDeclarationFile(results, mapName);
      await expect(output).toMatchFileSnapshot("__file_snapshots__/intersection-schema.ts");
    });
  });

  describe("enum-schema.ts", () => {
    it("should generate TypeScript declarations with enums", async () => {
      const results = extractor.extractAll(resolve(fixturesDir, "enum-schema.ts"));
      const output = generateDeclarationFile(results, mapName);
      await expect(output).toMatchFileSnapshot("__file_snapshots__/enum-schema.ts");
    });
  });

  describe("utility-types-schema.ts", () => {
    it("should generate TypeScript declarations with utility types", async () => {
      const results = extractor.extractAll(resolve(fixturesDir, "utility-types-schema.ts"));
      const output = generateDeclarationFile(results, mapName);
      await expect(output).toMatchFileSnapshot("__file_snapshots__/utility-types-schema.ts");
    });
  });

  describe("multi-schema.ts", () => {
    it("should generate TypeScript declarations for multiple schemas", async () => {
      const results = extractor.extractAll(resolve(fixturesDir, "multi-schema.ts"));
      const output = generateDeclarationFile(results, mapName);
      await expect(output).toMatchFileSnapshot("__file_snapshots__/multi-schema.ts");
    });
  });

  describe("lazy-schema.ts", () => {
    it("should generate TypeScript declarations with circular references", async () => {
      const results = extractor.extractAll(resolve(fixturesDir, "lazy-schema.ts"));
      const output = generateDeclarationFile(results, mapName);
      await expect(output).toMatchFileSnapshot("__file_snapshots__/lazy-schema.ts");
    });
  });

  describe("getter-schema.ts", () => {
    it("should generate TypeScript declarations with getter-based recursive schemas", async () => {
      const results = extractor.extractAll(resolve(fixturesDir, "getter-schema.ts"));
      const output = generateDeclarationFile(results, mapName);
      await expect(output).toMatchFileSnapshot("__file_snapshots__/getter-schema.ts");
    });
  });

  describe("cross-ref-schema.ts", () => {
    it("should generate TypeScript declarations with cross-references", async () => {
      const results = extractor.extractAll(resolve(fixturesDir, "cross-ref-schema.ts"));
      const output = generateDeclarationFile(results, mapName);
      await expect(output).toMatchFileSnapshot("__file_snapshots__/cross-ref-schema.ts");
    });
  });

  describe("mixed-export-schema.ts", () => {
    it("should generate TypeScript declarations respecting export status", async () => {
      const results = extractor.extractAll(resolve(fixturesDir, "mixed-export-schema.ts"));
      const output = generateDeclarationFile(results, mapName);
      await expect(output).toMatchFileSnapshot("__file_snapshots__/mixed-export-schema.ts");
    });
  });

  describe("union-ref-schema.ts", () => {
    it("should generate TypeScript declarations with union references", async () => {
      const results = extractor.extractAll(resolve(fixturesDir, "union-ref-schema.ts"));
      const output = generateDeclarationFile(results, mapName);
      await expect(output).toMatchFileSnapshot("__file_snapshots__/union-ref-schema.ts");
    });
  });

  describe("brand-schema.ts", () => {
    it("should generate TypeScript declarations with brand information", async () => {
      const results = extractor.extractAll(resolve(fixturesDir, "brand-schema.ts"));
      const output = generateDeclarationFile(results, mapName);
      await expect(output).toMatchFileSnapshot("__file_snapshots__/brand-schema.ts");
    });
  });

  describe("declaration options", () => {
    it("should generate with inputOnly option", async () => {
      const results = extractor.extractAll(resolve(fixturesDir, "transform-schema.ts"));
      const output = generateDeclarationFile(results, mapName, { inputOnly: true });
      await expect(output).toMatchFileSnapshot("__file_snapshots__/options-inputOnly.ts");
    });

    it("should generate with outputOnly option", async () => {
      const results = extractor.extractAll(resolve(fixturesDir, "transform-schema.ts"));
      const output = generateDeclarationFile(results, mapName, { outputOnly: true });
      await expect(output).toMatchFileSnapshot("__file_snapshots__/options-outputOnly.ts");
    });

    it("should generate with unifyIfSame option", async () => {
      const results = extractor.extractAll(resolve(fixturesDir, "basic-schema.ts"));
      const output = generateDeclarationFile(results, mapName, { unifyIfSame: true });
      await expect(output).toMatchFileSnapshot("__file_snapshots__/options-unifyIfSame.ts");
    });
  });
});
