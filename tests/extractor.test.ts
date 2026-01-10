import { describe, it, expect, afterAll } from "vitest";
import { resolve } from "pathe";
import { ZodTypeExtractor } from "../src/core/extractor.js";
import { generateDeclarationFile } from "../src/core/type-printer.js";
import { createNameMapper } from "../src/core/name-mapper.js";
import { DescriptionExtractor } from "../src/core/description-extractor.js";
import type { ExtractResult } from "../src/core/types.js";
import { execSync } from "child_process";
import { readdirSync } from "fs";

const fixturesDir = resolve(import.meta.dirname, "fixtures");
const snapshotsDir = resolve(import.meta.dirname, "__file_snapshots__");
const mapName = createNameMapper({ removeSuffix: "Schema" });

/**
 * Creates a standard schema test case.
 */
function createSchemaTest(
  extractor: ZodTypeExtractor,
  schemaName: string,
  description: string = "should generate TypeScript declarations",
) {
  describe(`${schemaName}.ts`, () => {
    it(description, async () => {
      const results = extractor.extractAll(resolve(fixturesDir, `${schemaName}.ts`));
      const output = generateDeclarationFile(results, mapName);
      await expect(output).toMatchFileSnapshot(`__file_snapshots__/${schemaName}.ts`);
    });
  });
}

// After all tests, run tsgo on all generated snapshots (single invocation)
afterAll(() => {
  try {
    const snapshotFiles = readdirSync(snapshotsDir)
      .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
      .map((f) => resolve(snapshotsDir, f));

    if (snapshotFiles.length === 0) {
      console.log("No snapshot files found to type-check");
      return;
    }

    console.log(`\nType-checking ${snapshotFiles.length} snapshot files with tsgo...`);

    try {
      // Run tsgo once with all files (--ignoreConfig to skip tsconfig.json when files are specified)
      execSync(`npx tsgo --noEmit --ignoreConfig ${snapshotFiles.map((f) => `"${f}"`).join(" ")}`, {
        stdio: "pipe",
        encoding: "utf-8",
      });
      console.log(`✓ All ${snapshotFiles.length} snapshot files passed type-check\n`);
    } catch (error: any) {
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
        console.error(`✗ Type check failed:`);
        console.error(relevantErrors);
        throw new Error(`Type check failed for snapshot files`);
      }
      // If no relevant errors, consider it passed
      console.log(`✓ All ${snapshotFiles.length} snapshot files passed type-check\n`);
    }
  } catch (error: any) {
    if (error.code === "ENOENT") {
      console.log("Snapshots directory not found, skipping type-check");
    } else {
      throw error;
    }
  }
}, 30000); // 30 second timeout (tsgo is much faster)

describe("ZodTypeExtractor - Generated TypeScript Declarations", () => {
  const extractor = new ZodTypeExtractor();

  // Standard schema tests
  createSchemaTest(extractor, "basic-schema");
  createSchemaTest(
    extractor,
    "transform-schema",
    "should generate TypeScript declarations with transforms",
  );
  createSchemaTest(
    extractor,
    "nested-schema",
    "should generate TypeScript declarations with nested objects",
  );
  createSchemaTest(
    extractor,
    "union-schema",
    "should generate TypeScript declarations with unions",
  );
  createSchemaTest(
    extractor,
    "intersection-schema",
    "should generate TypeScript declarations with intersections",
  );
  createSchemaTest(extractor, "enum-schema", "should generate TypeScript declarations with enums");
  createSchemaTest(
    extractor,
    "utility-types-schema",
    "should generate TypeScript declarations with utility types",
  );
  createSchemaTest(
    extractor,
    "multi-schema",
    "should generate TypeScript declarations for multiple schemas",
  );
  createSchemaTest(
    extractor,
    "lazy-schema",
    "should generate TypeScript declarations with circular references",
  );
  createSchemaTest(
    extractor,
    "getter-schema",
    "should generate TypeScript declarations with getter-based recursive schemas",
  );
  createSchemaTest(
    extractor,
    "cross-ref-schema",
    "should generate TypeScript declarations with cross-references",
  );
  createSchemaTest(
    extractor,
    "mixed-export-schema",
    "should generate TypeScript declarations respecting export status",
  );
  createSchemaTest(
    extractor,
    "union-ref-schema",
    "should generate TypeScript declarations with union references",
  );
  createSchemaTest(
    extractor,
    "brand-schema",
    "should generate TypeScript declarations with brand information",
  );

  describe("described-schema.ts", () => {
    it("should generate TypeScript declarations without TSDoc comments by default", async () => {
      const results = extractor.extractAll(resolve(fixturesDir, "described-schema.ts"));
      const output = generateDeclarationFile(results, mapName);
      await expect(output).toMatchFileSnapshot("__file_snapshots__/described-schema.ts");
    });

    it("should generate TypeScript declarations with TSDoc comments when withDescriptions is enabled", async () => {
      const filePath = resolve(fixturesDir, "described-schema.ts");
      const results = extractor.extractAll(filePath);
      const descriptionExtractor = new DescriptionExtractor();

      // Add descriptions to results (same as CLI does with withDescriptions option)
      const schemaNames = results.map((r) => r.schemaName);
      const descriptions = await descriptionExtractor.extractDescriptions(filePath, schemaNames);

      const resultsWithDescriptions = results.map((result) => {
        const desc = descriptions.get(result.schemaName);
        if (!desc) {
          return result;
        }
        return {
          ...result,
          description: desc.description,
          fieldDescriptions: desc.fields,
        };
      });

      const output = generateDeclarationFile(resultsWithDescriptions, mapName);
      await expect(output).toMatchFileSnapshot(
        "__file_snapshots__/described-schema-with-descriptions.ts",
      );
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

    it("should generate with mergeSame option", async () => {
      const results = extractor.extractAll(resolve(fixturesDir, "basic-schema.ts"));
      const output = generateDeclarationFile(results, mapName, { mergeSame: true });
      await expect(output).toMatchFileSnapshot("__file_snapshots__/options-mergeSame.ts");
    });
  });
});
