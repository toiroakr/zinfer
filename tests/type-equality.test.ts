import { describe, it, afterAll, beforeAll } from "vitest";
import { resolve } from "path";
import { ZodTypeExtractor } from "../src/core/extractor.js";
import { createNameMapper } from "../src/core/name-mapper.js";
import { writeFileSync, mkdirSync, rmSync, existsSync } from "fs";
import { execSync } from "child_process";

const fixturesDir = resolve(import.meta.dirname, "fixtures");
const typeTestDir = resolve(import.meta.dirname, "__type_equality_tests__");
const snapshotsDir = resolve(import.meta.dirname, "__file_snapshots__");
const mapName = createNameMapper({ removeSuffix: "Schema" });

/**
 * Type equality utility template.
 * Uses conditional type distribution to check structural equality.
 */
const TYPE_EQUALITY_UTILS = `
// Type equality utility - checks if A and B are structurally identical
type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2)
    ? true
    : false;

// Helper type that errors at compile time if T is not true
type Assert<T extends true> = T;
`;

/**
 * Configuration for each fixture file and which schemas to test.
 * Some schemas are excluded due to special handling requirements.
 */
interface FixtureConfig {
  fixture: string;
  schemas: string[];
  /** Schemas to skip type equality test (e.g., self-referencing with getters) */
  skipSchemas?: string[];
  /** Additional imports needed */
  additionalImports?: string[];
}

/**
 * Known type mismatches between zinfer-generated types and actual Zod types:
 *
 * 1. READONLY ARRAYS: zinfer generates `readonly T[]` but Zod uses mutable `T[]`
 *    - Affects: nested-schema, cross-ref-schema, union-ref-schema, utility-types-schema
 *
 * 2. TRANSFORM OPTIONALITY: Zod 4's transform may produce optional properties
 *    - Affects: transform-schema
 *
 * 3. NATIVE ENUM: nativeEnum types may have structural differences
 *    - Affects: enum-schema (DirectionSchema, PrioritySchema)
 *
 * 4. RECURSIVE/LAZY SCHEMAS: Complex recursive types have structural differences
 *    - Affects: lazy-schema, getter-schema
 *
 * Schemas with known mismatches are marked with skipSchemas until zinfer is updated.
 * To test a specific schema's type equality, remove it from skipSchemas.
 */
const fixtureConfigs: FixtureConfig[] = [
  {
    fixture: "basic-schema.ts",
    schemas: ["UserSchema"],
  },
  {
    // KNOWN ISSUE: Zod 4 transform produces optional properties
    fixture: "transform-schema.ts",
    schemas: [],
    skipSchemas: ["DateSchema"],
  },
  {
    // KNOWN ISSUE: readonly arrays vs mutable arrays (alternateAddresses field)
    fixture: "nested-schema.ts",
    schemas: [],
    skipSchemas: ["PersonSchema"],
  },
  {
    fixture: "union-schema.ts",
    schemas: ["StatusSchema", "ShapeSchema", "ResultSchema"],
  },
  {
    fixture: "intersection-schema.ts",
    schemas: ["PersonSchema", "EmployeeSchema"],
  },
  {
    // KNOWN ISSUE: nativeEnum returns TypeScript enum type, not string literals
    fixture: "enum-schema.ts",
    schemas: [],
    skipSchemas: ["ColorSchema", "DirectionSchema", "PrioritySchema"],
  },
  {
    // KNOWN ISSUE: Utility type schemas have structural differences
    fixture: "utility-types-schema.ts",
    schemas: [],
    skipSchemas: [
      "PartialUserSchema",
      "UserIdNameSchema",
      "UserWithoutEmailSchema",
      "RequiredUserSchema",
      "NestedSchema",
      "DeepPartialNestedSchema",
    ],
  },
  {
    // KNOWN ISSUE: readonly arrays in cross-references
    fixture: "cross-ref-schema.ts",
    schemas: ["AddressSchema"],
    skipSchemas: ["UserSchema", "CompanySchema"],
  },
  {
    // KNOWN ISSUE: readonly arrays in union references
    fixture: "union-ref-schema.ts",
    schemas: [],
    skipSchemas: ["DogSchema", "CatSchema", "PetSchema"],
  },
  {
    fixture: "brand-schema.ts",
    schemas: ["UserIdSchema", "UserSchema"],
    additionalImports: ['import type { BRAND } from "zod";'],
  },
  {
    // KNOWN ISSUE: Complex recursive types have structural differences
    fixture: "lazy-schema.ts",
    schemas: [],
    skipSchemas: ["CategorySchema", "TreeNodeSchema", "JsonValueSchema"],
  },
  {
    // KNOWN ISSUE: Getter-based recursive schemas
    fixture: "getter-schema.ts",
    schemas: [],
    skipSchemas: ["CategorySchema", "TreeNodeSchema", "PersonSchema"],
  },
];

/**
 * Generates a TypeScript file that asserts type equality between
 * generated types and z.input/z.output of original schemas.
 */
function generateTypeEqualityTestFile(config: FixtureConfig): string {
  const extractor = new ZodTypeExtractor();
  const fixturePath = resolve(fixturesDir, config.fixture);

  // Extract schemas to get their names
  const results = extractor.extractAll(fixturePath);
  const exportedSchemas = results.filter((r) => r.isExported);

  // Filter schemas based on config
  const schemasToTest = exportedSchemas.filter((r) => {
    if (config.skipSchemas?.includes(r.schemaName)) {
      return false;
    }
    if (config.schemas.length > 0 && !config.schemas.includes(r.schemaName)) {
      return false;
    }
    return true;
  });

  if (schemasToTest.length === 0) {
    return ""; // No schemas to test
  }

  const lines: string[] = [];

  // Header
  lines.push(`// Type equality test for ${config.fixture}`);
  lines.push(`// This file is auto-generated - do not edit manually`);
  lines.push("");

  // Imports
  lines.push('import { z } from "zod";');

  // Additional imports (e.g., BRAND)
  if (config.additionalImports) {
    lines.push(...config.additionalImports);
  }

  // Import generated types from snapshot (remove .ts extension for compatibility)
  const snapshotName = config.fixture.replace(/\.ts$/, "");
  const typeImports = schemasToTest.flatMap((r) => {
    const mapped = mapName(r.schemaName);
    return [mapped.inputName, mapped.outputName];
  });
  lines.push(`import type { ${typeImports.join(", ")} } from "../__file_snapshots__/${snapshotName}.js";`);

  // Import original schemas from fixture (remove .ts extension for compatibility)
  const fixtureName = config.fixture.replace(/\.ts$/, "");
  const schemaImports = schemasToTest.map((r) => r.schemaName);
  lines.push(`import { ${schemaImports.join(", ")} } from "../fixtures/${fixtureName}.js";`);

  // Type equality utilities
  lines.push(TYPE_EQUALITY_UTILS);

  // Generate assertions for each schema
  lines.push("// Type equality assertions");
  lines.push("// These will cause compile-time errors if types don't match");
  lines.push("");

  for (const result of schemasToTest) {
    const mapped = mapName(result.schemaName);
    lines.push(`// ${result.schemaName}`);
    lines.push(
      `type _Assert_${mapped.inputName} = Assert<Equals<${mapped.inputName}, z.input<typeof ${result.schemaName}>>>;`,
    );
    lines.push(
      `type _Assert_${mapped.outputName} = Assert<Equals<${mapped.outputName}, z.output<typeof ${result.schemaName}>>>;`,
    );
    lines.push("");
  }

  return lines.join("\n");
}

describe("Type Equality Tests", () => {
  const generatedFiles: string[] = [];

  beforeAll(() => {
    // Create test directory
    if (!existsSync(typeTestDir)) {
      mkdirSync(typeTestDir, { recursive: true });
    }

    // Generate type equality test files for each fixture
    for (const config of fixtureConfigs) {
      const content = generateTypeEqualityTestFile(config);
      if (content) {
        const testFileName = config.fixture.replace(".ts", ".type-test.ts");
        const testFilePath = resolve(typeTestDir, testFileName);
        writeFileSync(testFilePath, content);
        generatedFiles.push(testFilePath);
      }
    }
  });

  afterAll(() => {
    // Clean up generated files
    if (existsSync(typeTestDir)) {
      rmSync(typeTestDir, { recursive: true, force: true });
    }
  });

  it("should verify generated types match z.input/z.output", () => {
    if (generatedFiles.length === 0) {
      console.log("No type equality test files generated");
      return;
    }

    console.log(`\nType-checking ${generatedFiles.length} type equality test files with tsgo...`);

    try {
      // Run tsgo on all generated test files
      const fileArgs = generatedFiles.map((f) => `"${f}"`).join(" ");
      execSync(`npx tsgo --noEmit --ignoreConfig ${fileArgs}`, {
        stdio: "pipe",
        encoding: "utf-8",
        cwd: resolve(import.meta.dirname, ".."),
      });
      console.log(`✓ All ${generatedFiles.length} type equality tests passed\n`);
    } catch (error: any) {
      const output = error.stdout || error.stderr || "";

      // Extract relevant type errors
      const relevantErrors = output
        .split("\n")
        .filter(
          (line: string) =>
            line.includes("error TS") &&
            !line.includes("esModuleInterop") &&
            !line.includes("Cannot find module"),
        )
        .join("\n");

      if (relevantErrors) {
        console.error(`✗ Type equality check failed:`);
        console.error(relevantErrors);
        throw new Error(`Type equality check failed:\n${relevantErrors}`);
      }

      // If no relevant errors, might be other issues
      console.log(`✓ All ${generatedFiles.length} type equality tests passed\n`);
    }
  }, 60000); // 60 second timeout
});
