import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { resolve, basename } from "pathe";
import { ZodTypeExtractor } from "../src/core/extractor.js";
import { generateDeclarationFile, relativizeImportPaths } from "../src/core/type-printer.js";
import { createNameMapper } from "../src/core/name-mapper.js";
import { DescriptionExtractor } from "../src/core/description-extractor.js";
import { execFileSync } from "child_process";
import { execPath } from "process";
import { readdirSync } from "fs";

const fixturesDir = resolve(import.meta.dirname, "fixtures");
const snapshotsDir = resolve(import.meta.dirname, "__file_snapshots__");
// tsgo's node_modules/.bin entry is a POSIX shell script (a .cmd shim on
// Windows) that execFileSync cannot run directly without a shell; run its
// real JS entry point through the Node executable instead, matching how
// tests/cli.test.ts invokes jiti.
const tsgoPath = resolve(
  import.meta.dirname,
  "../node_modules/@typescript/native-preview/bin/tsgo",
);
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
      const snapshotPath = resolve(snapshotsDir, `${schemaName}.ts`);
      // Matches the real CLI pipeline (cli-runner.ts), which always runs
      // generated content through relativizeImportPaths before writing it -
      // without this, an inline `import("...")` type (e.g. for the
      // degenerate-explicit-type fixtures) would bake this machine's
      // absolute path into the committed snapshot.
      const output = relativizeImportPaths(generateDeclarationFile(results, mapName), snapshotPath);
      await expect(output).toMatchFileSnapshot(`__file_snapshots__/${schemaName}.ts`);
    });
  });
}

/**
 * Divergences between zinfer's generated types and `z.input`/`z.output` that
 * are intentional, not bugs. Each key is the basename of a generated
 * `*.test.ts` file (from `--generate-tests`) that fails project-wide
 * type-checking; the value documents why. Keeping this list exhaustive
 * (checked below) means any *new* divergence fails the build instead of
 * silently passing.
 */
const KNOWN_TYPE_DIFFERENCES: Record<string, string> = {
  "described-ref-schema.test.ts":
    "JsonValueSchema is annotated z.ZodType<JsonValue>, leaving Input unset (defaults to unknown) per Zod 4's ZodType<Output, Input = unknown>; zinfer generates the full recursive union instead.",
  "lazy-schema.test.ts":
    "Same JsonValueSchema divergence as described-ref-schema.test.ts: z.input<> is unknown, zinfer's input type is the full recursive union.",
  "enum-schema.test.ts":
    "z.enum() infers the enum's own type; zinfer deliberately expands enum members to their literal values.",
  "intersection-schema.test.ts":
    "z.intersection() infers `A & B`; zinfer flattens it into a single object literal, which is not nominally equal to the intersection.",
  "mixed-union-reference-schema.test.ts":
    "A non-exported recursive union member (InternalNode) is inlined by zinfer rather than kept as a named type, which is not nominally equal to the original union member.",
};

// After all tests, type-check every generated snapshot and companion
// *.test.ts file (from --generate-tests) as one project, so a mismatch that
// only surfaces as a type error (expectTypeOf().toEqualTypeOf() is a runtime
// no-op) fails the build instead of passing silently.
afterAll(() => {
  const tsconfigPath = resolve(snapshotsDir, "tsconfig.json");

  let output = "";
  let execError: unknown;
  try {
    execFileSync(execPath, [tsgoPath, "--noEmit", "-p", tsconfigPath], {
      stdio: "pipe",
      encoding: "utf-8",
    });
  } catch (error: any) {
    execError = error;
    output = error.stdout || error.stderr || "";
  }

  const errorLines = output
    .split("\n")
    .filter((line: string) => /error TS\d+/.test(line) && !line.includes("locales"));

  // tsgo exited non-zero but produced no `error TSxxxx` lines - it failed to
  // run at all (bad path, missing tsconfig, etc.) rather than reporting type
  // errors. Surface the real failure instead of letting the checks below
  // report a misleading "KNOWN_TYPE_DIFFERENCES entries no longer reproduce".
  if (execError && errorLines.length === 0) {
    throw execError;
  }

  // Fixture errors must only be the intentionally-unannotated recursive
  // getter fixtures' TS7022/TS7023 ("implicitly has type any" on a
  // self-referential getter) - anything else is a real regression.
  const fixtureErrors = errorLines.filter((line: string) => /[\\/]fixtures[\\/]/.test(line));
  const unexpectedFixtureErrors = fixtureErrors.filter(
    (line: string) => !line.includes("TS7022") && !line.includes("TS7023"),
  );
  if (unexpectedFixtureErrors.length > 0) {
    throw new Error(
      `Unexpected type error(s) in tests/fixtures (expected only TS7022/TS7023 on unannotated recursive getters):\n${unexpectedFixtureErrors.join("\n")}`,
    );
  }

  // Generated *.test.ts files must fail exactly the set documented in
  // KNOWN_TYPE_DIFFERENCES - no more (undocumented divergence), no less
  // (documented divergence that no longer reproduces, so the allowlist is stale).
  const failingTestFiles = new Set(
    errorLines
      .filter((line: string) => /\.test\.ts\(/.test(line))
      .map((line: string) => basename(line.split("(")[0])),
  );
  const knownNames = new Set(Object.keys(KNOWN_TYPE_DIFFERENCES));

  const undocumented = [...failingTestFiles].filter((name) => !knownNames.has(name));
  if (undocumented.length > 0) {
    throw new Error(
      `New type divergence found in generated tests, not documented in KNOWN_TYPE_DIFFERENCES: ${undocumented.join(", ")}\n\n${errorLines.join("\n")}`,
    );
  }

  const stale = [...knownNames].filter((name) => !failingTestFiles.has(name));
  if (stale.length > 0) {
    throw new Error(
      `KNOWN_TYPE_DIFFERENCES entries no longer reproduce a type error - remove from the allowlist or investigate: ${stale.join(", ")}`,
    );
  }

  // Generated *type* files (.ts, not .test.ts) must never have type errors -
  // that's the actual output this tool promises to compile.
  const typeFileErrors = errorLines.filter(
    (line: string) => !/[\\/]fixtures[\\/]/.test(line) && !/\.test\.ts\(/.test(line),
  );
  if (typeFileErrors.length > 0) {
    throw new Error(`Type error(s) in generated type files:\n${typeFileErrors.join("\n")}`);
  }
}, 30000); // 30 second timeout (tsgo is much faster)

describe("ZodTypeExtractor - Generated TypeScript Declarations", () => {
  const extractor = new ZodTypeExtractor();

  // Warm up ts-morph project by triggering Zod module resolution
  // The first type resolution is slow (~5s in CI) as it processes Zod's entire type system
  beforeAll(() => {
    extractor.extractAll(resolve(fixturesDir, "basic-schema.ts"));
  });

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
    "strict-object-schema",
    "should generate TypeScript declarations with strictObject cross-references",
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

  describe("array-brand-schema.ts", () => {
    it("should brand the array element instead of the whole array", () => {
      const results = extractor.extractAll(resolve(fixturesDir, "array-brand-schema.ts"));
      const result = results.find((r) => r.schemaName === "TagsSchema");

      expect(result?.output).toContain('tags: (string & BRAND<"Tag">)[]');
      expect(result?.input).toBe("{ tags: string[]; lookup: { [x: string]: string; }; }");
    });

    it("should brand the record value instead of the whole record", () => {
      const results = extractor.extractAll(resolve(fixturesDir, "array-brand-schema.ts"));
      const result = results.find((r) => r.schemaName === "TagsSchema");

      expect(result?.output).toContain('[x: string]: string & BRAND<"Tag">');
    });

    it("should not add an unused BRAND import when generating input-only declarations without a branded input", () => {
      const results = extractor.extractAll(resolve(fixturesDir, "array-brand-schema.ts"));
      const output = generateDeclarationFile(results, mapName, { inputOnly: true });

      expect(output).not.toContain('import type { BRAND } from "zod"');
    });
  });

  describe("object-brand-schema.ts", () => {
    it("should keep a whole-object brand while still branding a nested array element", () => {
      const results = extractor.extractAll(resolve(fixturesDir, "object-brand-schema.ts"));
      const result = results.find((r) => r.schemaName === "WrapperSchema");

      expect(result?.output).toBe('{ tags: (string & BRAND<"Tag">)[]; } & BRAND<"Wrapper">');
      expect(result?.input).toBe("{ tags: string[]; }");
    });
  });

  describe("nonexported-brand-schema.ts", () => {
    it("should not add an unused BRAND import when the only branded schema is not exported", () => {
      const results = extractor.extractAll(resolve(fixturesDir, "nonexported-brand-schema.ts"));
      const output = generateDeclarationFile(results, mapName);

      expect(output).not.toContain('import type { BRAND } from "zod"');
    });
  });

  createSchemaTest(
    extractor,
    "described-ref-schema",
    "should keep named schema references when .describe() wraps them",
  );
  createSchemaTest(
    extractor,
    "mixed-union-reference-schema",
    "should preserve named references through mixed and non-exported union members",
  );

  describe("mixed-union-reference-common.ts", () => {
    it("should not rewrite an explicit annotation naming a global type into a self-reference", () => {
      const results = extractor.extractAll(resolve(fixturesDir, "mixed-union-reference-common.ts"));
      const functionResult = results.find((r) => r.schemaName === "functionSchema");

      expect(functionResult?.input).toBe("Function");
      expect(functionResult?.output).toBe("Function");
    });
  });

  describe("degenerate-explicit-type fixtures", () => {
    it("should qualify an explicit annotation naming a locally declared class through an inline import instead of a bare identifier", () => {
      const results = extractor.extractAll(
        resolve(fixturesDir, "degenerate-explicit-type/class-explicit-type-schema.ts"),
      );
      const result = results.find((r) => r.schemaName === "FooSchema");

      const expected = /^import\(".*class-explicit-type-schema"\)\.LocalClass$/;
      expect(result?.input).toMatch(expected);
      expect(result?.output).toMatch(expected);

      const output = generateDeclarationFile(results, mapName);
      expect(output).not.toMatch(/FooInput\s*=\s*FooInput/);
      expect(output).not.toMatch(/FooOutput\s*=\s*FooOutput/);
      expect(output).not.toMatch(/=\s*LocalClass;/);
    });

    it("should qualify an explicit annotation naming a locally declared interface through an inline import instead of a bare identifier", () => {
      const results = extractor.extractAll(
        resolve(fixturesDir, "degenerate-explicit-type/interface-explicit-type-schema.ts"),
      );
      const result = results.find((r) => r.schemaName === "BarSchema");

      const expected = /^import\(".*interface-explicit-type-schema"\)\.LocalInterface$/;
      expect(result?.input).toMatch(expected);
      expect(result?.output).toMatch(expected);

      const output = generateDeclarationFile(results, mapName);
      expect(output).not.toMatch(/BarInput\s*=\s*BarInput/);
      expect(output).not.toMatch(/BarOutput\s*=\s*BarOutput/);
      expect(output).not.toMatch(/=\s*LocalInterface;/);
    });

    it("should fall back to the bare identifier when the locally declared type isn't exported (no module specifier can reach it)", () => {
      const results = extractor.extractAll(
        resolve(fixturesDir, "degenerate-explicit-type/nonexported-explicit-type-schema.ts"),
      );
      const result = results.find((r) => r.schemaName === "BazSchema");

      expect(result?.input).toBe("LocalNonExportedClass");
      expect(result?.output).toBe("LocalNonExportedClass");
    });
  });

  createSchemaTest(
    extractor,
    "degenerate-explicit-type/class-explicit-type-schema",
    "should generate a type-checkable inline import for an explicit annotation naming a local class",
  );
  createSchemaTest(
    extractor,
    "degenerate-explicit-type/interface-explicit-type-schema",
    "should generate a type-checkable inline import for an explicit annotation naming a local interface",
  );

  describe("rest-tuple-schema.ts", () => {
    it("should preserve the fixed leading elements of a variadic tuple instead of widening to an array", () => {
      const results = extractor.extractAll(resolve(fixturesDir, "rest-tuple-schema.ts"));
      const result = results.find((r) => r.schemaName === "RestTupleSchema");

      expect(result?.input).toContain("[string, ...number[]]");
    });
  });

  describe("multi-schema.ts", () => {
    it("should resolve types through an aliased re-export instead of falling back to any", () => {
      const results = extractor.extractAll(resolve(fixturesDir, "multi-schema.ts"));
      const aliased = results.find((r) => r.schemaName === "AliasedSchema");

      expect(aliased?.input).not.toBe("any");
      expect(aliased?.input).toContain("internal: boolean");
    });
  });

  describe("alias-getter-schema.ts", () => {
    it("should resolve a getter-based self-reference on a schema exported through an alias", () => {
      const results = extractor.extractAll(resolve(fixturesDir, "alias-getter-schema.ts"));
      const aliased = results.find((r) => r.schemaName === "AliasedCategorySchema");

      expect(aliased?.output).toContain("subcategories: AliasedCategorySchemaOutput[]");
      expect(aliased?.output).not.toContain("any");
    });
  });

  describe("alias-cross-reference-schema.ts", () => {
    it("should reference a schema exported through an alias by its exported name instead of inlining it", () => {
      const results = extractor.extractAll(resolve(fixturesDir, "alias-cross-reference-schema.ts"));
      const container = results.find((r) => r.schemaName === "ContainerSchema");

      expect(container?.output).toContain("AliasedNodeOutput");
      expect(container?.output).not.toContain("id: string");
    });
  });

  describe("alias-union-member-schema.ts", () => {
    it("should compose a union from an aliased member's exported name instead of inlining it", () => {
      const results = extractor.extractAll(resolve(fixturesDir, "alias-union-member-schema.ts"));
      const union = results.find((r) => r.schemaName === "UnionSchema");

      expect(union?.output).toBe("AliasedAOutput | BSchemaOutput");
    });
  });

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

  describe("describe-order-schema.ts", () => {
    it("should keep the description when .describe() is called before .optional()", async () => {
      const filePath = resolve(fixturesDir, "describe-order-schema.ts");
      const descriptionExtractor = new DescriptionExtractor();
      const descriptions = await descriptionExtractor.extractDescriptions(filePath, [
        "OrderSchema",
      ]);

      const fields = descriptions.get("OrderSchema")?.fields ?? [];
      const fieldA = fields.find((f) => f.path === "a");

      expect(fieldA?.description).toBe("described then optional");
    });
  });

  describe("multiline-description-schema.ts", () => {
    it("should generate TSDoc comments with multiline descriptions", async () => {
      const filePath = resolve(fixturesDir, "with-descriptions/multiline-description-schema.ts");
      const results = extractor.extractAll(filePath);
      const descriptionExtractor = new DescriptionExtractor();

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
        "__file_snapshots__/multiline-description-schema.ts",
      );
    });
  });

  describe("nested-inline-description-schema.ts", () => {
    it("should not leak an unrelated same-named field's description into an inlined nested schema (#340)", async () => {
      const filePath = resolve(
        fixturesDir,
        "with-descriptions/nested-inline-description-schema.ts",
      );
      const results = extractor.extractAll(filePath);
      const descriptionExtractor = new DescriptionExtractor();

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
      expect(output).toContain("/** Item description, distinct from container description */");
      expect(output).not.toMatch(/flag: boolean;\s*\/\*\* Container-level description \*\//);
      // Sibling union members must each keep their own field description,
      // not inherit the other member's last-parsed field name.
      expect(output).toContain("/** A description */");
      expect(output).toContain("/** B description */");
      await expect(output).toMatchFileSnapshot(
        "__file_snapshots__/nested-inline-description-schema.ts",
      );
    });
  });

  describe("recursive-inline-description-schema.ts", () => {
    it("should not stack-overflow on a self-recursive schema and must not blank out other schemas' descriptions (#340)", async () => {
      const filePath = resolve(
        fixturesDir,
        "with-descriptions/recursive-inline-description-schema.ts",
      );
      const results = extractor.extractAll(filePath);
      const descriptionExtractor = new DescriptionExtractor();

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
      // The self-recursive schema's own fields must be described...
      expect(output).toContain("/** Category name */");
      expect(output).toContain("/** Nested subcategories */");
      // ...and extracting it must not blow the stack and wipe out
      // descriptions for the unrelated schema that wraps it several
      // object layers deep.
      expect(output).toContain("/** Catalog title */");
      await expect(output).toMatchFileSnapshot(
        "__file_snapshots__/recursive-inline-description-schema.ts",
      );
    });
  });

  describe("array-readonly-schema.ts", () => {
    it("should not add readonly modifier to regular arrays", async () => {
      const results = extractor.extractAll(resolve(fixturesDir, "array-readonly-schema.ts"));
      const output = generateDeclarationFile(results, mapName);
      await expect(output).toMatchFileSnapshot("__file_snapshots__/array-readonly-schema.ts");
    });
  });

  describe("tuple-schema.ts", () => {
    it("should preserve tuple types instead of expanding to arrays", async () => {
      const results = extractor.extractAll(resolve(fixturesDir, "tuple-schema.ts"));
      const output = generateDeclarationFile(results, mapName);
      await expect(output).toMatchFileSnapshot("__file_snapshots__/tuple-schema.ts");
    });
  });

  describe("union-nonexport-member-schema.ts", () => {
    it("should inline non-exported union members instead of using named references", async () => {
      const results = extractor.extractAll(
        resolve(fixturesDir, "union-nonexport-member-schema.ts"),
      );
      const output = generateDeclarationFile(results, mapName);
      await expect(output).toMatchFileSnapshot(
        "__file_snapshots__/union-nonexport-member-schema.ts",
      );
    });
  });

  describe("mixed-union-reference-schema.ts", () => {
    it("preserves named references through mixed and non-exported union members", () => {
      const results = extractor.extractAll(resolve(fixturesDir, "mixed-union-reference-schema.ts"));
      const mixedValue = results.find((result) => result.schemaName === "MixedValueSchema");
      const referencedValue = results.find(
        (result) => result.schemaName === "ReferencedValueSchema",
      );
      const spreadOverride = results.find((result) => result.schemaName === "SpreadOverrideSchema");
      const satisfiedSpreadOverride = results.find(
        (result) => result.schemaName === "SatisfiedSpreadOverrideSchema",
      );
      const recursiveUnion = results.find((result) => result.schemaName === "RecursiveUnionSchema");
      const mixedPlainUnion = results.find(
        (result) => result.schemaName === "MixedPlainUnionSchema",
      );
      const inlineImportedUnion = results.find(
        (result) => result.schemaName === "InlineImportedUnionSchema",
      );

      expect(mixedValue?.input).toBe("JsonValueSchemaInput | Function");
      expect(mixedValue?.output).toBe("JsonValueSchemaOutput | Function");
      expect(referencedValue?.input).not.toContain("any");
      expect(referencedValue?.output).not.toContain("any");
      expect(referencedValue?.input.match(/value\?: MixedValueSchemaInput/g)).toHaveLength(2);
      expect(referencedValue?.output.match(/value\?: MixedValueSchemaOutput/g)).toHaveLength(2);
      expect(spreadOverride?.input).toBe("{ value?: { [x: string]: unknown; } | undefined; }");
      expect(spreadOverride?.output).toBe("{ value?: { [x: string]: unknown; } | undefined; }");
      expect(satisfiedSpreadOverride?.input).toBe(
        "{ value?: { [x: string]: unknown; } | undefined; }",
      );
      expect(satisfiedSpreadOverride?.output).toBe(
        "{ value?: { [x: string]: unknown; } | undefined; }",
      );
      expect(recursiveUnion?.input).not.toContain("InternalNodeSchemaInput");
      expect(recursiveUnion?.output).not.toContain("InternalNodeSchemaOutput");
      expect(mixedPlainUnion?.input).not.toContain("PublicPlainSchemaInput");
      expect(mixedPlainUnion?.output).not.toContain("PublicPlainSchemaOutput");
      expect(inlineImportedUnion?.input).toContain("string");
      expect(inlineImportedUnion?.output).toContain("string");
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

    it("should merge transitively and emit aliases for multi-schema with mergeSame", async () => {
      const results = extractor.extractAll(resolve(fixturesDir, "mergeSame-multi-schema.ts"));
      const output = generateDeclarationFile(results, mapName, { mergeSame: true });
      await expect(output).toMatchFileSnapshot("__file_snapshots__/options-mergeSame-multi.ts");
    });
  });

  describe('subpath imports (package.json "imports" field)', () => {
    it("should resolve schemas imported via the #/* wildcard pattern", () => {
      const results = extractor.extractAll(resolve(fixturesDir, "subpath-import/consumer.ts"));
      const consumer = results.find((r) => r.schemaName === "ConsumerSchema");

      expect(consumer).toBeDefined();
      // The imported SharedSchema / AnotherSharedSchema must be fully resolved
      // (not collapsed to `any`) for the object shape to be inferred correctly.
      expect(consumer!.input).toContain("shared: {");
      expect(consumer!.input).toContain("id: string");
      expect(consumer!.input).toContain("another: {");
      expect(consumer!.input).toContain("value: number");
      expect(consumer!.input).not.toContain("any");
    });

    it("should resolve schemas imported via an exact subpath key", () => {
      const results = extractor.extractAll(
        resolve(fixturesDir, "subpath-import/exact-consumer.ts"),
      );
      const consumer = results.find((r) => r.schemaName === "ExactConsumerSchema");

      expect(consumer).toBeDefined();
      expect(consumer!.input).toContain("shared: {");
      expect(consumer!.input).toContain("id: string");
      expect(consumer!.input).not.toContain("any");
    });

    it("should preserve field descriptions when a schema imports via the #/* wildcard pattern", async () => {
      const filePath = resolve(fixturesDir, "subpath-import/described-consumer.ts");
      const descriptionExtractor = new DescriptionExtractor();

      const descriptions = await descriptionExtractor.extractDescriptions(filePath, [
        "DescribedConsumerSchema",
      ]);

      const desc = descriptions.get("DescribedConsumerSchema");
      const nameField = desc?.fields.find((f) => f.path === "name");
      expect(nameField?.description).toBe("The user's name");
    });

    it("should preserve field descriptions when a schema imports via a named subpath prefix (#src/*)", async () => {
      const filePath = resolve(fixturesDir, "subpath-import/described-named-consumer.ts");
      const descriptionExtractor = new DescriptionExtractor();

      const descriptions = await descriptionExtractor.extractDescriptions(filePath, [
        "DescribedNamedConsumerSchema",
      ]);

      const desc = descriptions.get("DescribedNamedConsumerSchema");
      const nameField = desc?.fields.find((f) => f.path === "name");
      expect(nameField?.description).toBe("The user's name");
    });

    it("should preserve field descriptions when the #/* target has a suffix after the wildcard (#/* -> ./src/*.ts)", async () => {
      const filePath = resolve(fixturesDir, "subpath-import-suffix/consumer.ts");
      const descriptionExtractor = new DescriptionExtractor();

      const descriptions = await descriptionExtractor.extractDescriptions(filePath, [
        "SuffixConsumerSchema",
      ]);

      const desc = descriptions.get("SuffixConsumerSchema");
      const nameField = desc?.fields.find((f) => f.path === "name");
      expect(nameField?.description).toBe("The user's name");
    });
  });

  describe("description extraction sweep", () => {
    it("should extract descriptions from every top-level fixture without warning (#340)", async () => {
      // Guards against the class of bug in #340: recursion tests
      // (lazy-schema.ts, getter-schema.ts) and description tests
      // (described-schema.ts, etc.) previously never ran through the same
      // extractor, so a schema that was both self-recursive AND described
      // slipped through CI untested. Running DescriptionExtractor over every
      // fixture - regardless of whether it has any .describe() calls - would
      // have caught the stack overflow immediately, since it happens even
      // without a single description present.
      const fixtureFiles = readdirSync(fixturesDir).filter((f) => f.endsWith(".ts"));
      const descriptionExtractor = new DescriptionExtractor();
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

      // Assert before mockRestore(): restoring a spy also clears its
      // recorded calls, which would make a post-restore assertion pass
      // unconditionally regardless of what actually happened in the loop.
      try {
        for (const file of fixtureFiles) {
          const filePath = resolve(fixturesDir, file);
          const schemaNames = extractor.extractAll(filePath).map((r) => r.schemaName);
          await descriptionExtractor.extractDescriptions(filePath, schemaNames);
        }
        expect(warnSpy).not.toHaveBeenCalled();
      } finally {
        warnSpy.mockRestore();
      }
    });
  });
});
