import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { resolve, basename } from "pathe";
import { z } from "zod";
import { ZodTypeExtractor, type ExtractContext } from "../src/core/extractor.js";
import { generateDeclarationFile, relativizeImportPaths } from "../src/core/type-printer.js";
import { createNameMapper } from "../src/core/name-mapper.js";
import { DescriptionExtractor } from "../src/core/description-extractor.js";
import { execFileSync } from "child_process";
import { execPath } from "process";
import { readdirSync } from "fs";

const fixturesDir = resolve(import.meta.dirname, "fixtures");
const snapshotsDir = resolve(import.meta.dirname, "__file_snapshots__");
// z.looseObject only exists on zod v4. Some fixtures/assertions are only
// meaningful (or only resolvable) under the zod version actually installed;
// this lets those tests skip themselves under the peerDependencies floor
// (zod v3) instead of failing on version-specific behavior that isn't a
// real compatibility bug.
const isZodV4 = typeof z.looseObject === "function";
// Fixtures that use zod v4-only schema builders (no v3 equivalent at any
// version) and therefore can never be imported under the peerDependencies
// floor.
const ZOD_V4_ONLY_FIXTURES = ["strict-object-schema.ts"];
// Fixtures whose explicit `z.ZodType<...>` annotations only type-check under
// zod v4's generic signature. zod v3's ZodType takes a third type parameter
// (Def, constrained to extend ZodTypeDef) that v4 dropped, so the same
// annotation that's valid on v4 is a real TS error on v3 - this doesn't
// affect zinfer's own extraction (these fixtures' extraction tests pass
// under both versions), only the project-wide tsgo sanity check below.
const ZOD_V3_EXPLICIT_ANNOTATION_TYPE_ERRORS = [
  "degenerate-explicit-type/aliased-export-explicit-type-schema.ts",
  "degenerate-explicit-type/class-explicit-type-schema.ts",
  "degenerate-explicit-type/default-export-explicit-type-schema.ts",
  "degenerate-explicit-type/interface-explicit-type-schema.ts",
  "degenerate-explicit-type/nonexported-explicit-type-schema.ts",
  "mixed-union-reference-common.ts",
  "mixed-union-reference-schema.ts",
  "inline-external-types/chain/schema.ts",
  "inline-external-types/cycle/schema.ts",
  "inline-external-types/nonexported-cycle/schema.ts",
  "inline-external-types/qualified/direct-schema.ts",
  "inline-external-types/qualified/schema.ts",
];
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
  options: { requiresZodV4?: boolean; context?: ExtractContext; snapshotName?: string } = {},
) {
  const test = options.requiresZodV4 ? it.skipIf(!isZodV4) : it;
  const snapshotName = options.snapshotName ?? schemaName;
  describe(`${schemaName}.ts`, () => {
    test(description, async () => {
      const results = extractor.extractAll(
        resolve(fixturesDir, `${schemaName}.ts`),
        options.context,
      );
      const snapshotPath = resolve(snapshotsDir, `${snapshotName}.ts`);
      // Matches the real CLI pipeline (cli-runner.ts), which always runs
      // generated content through relativizeImportPaths before writing it -
      // without this, an inline `import("...")` type (e.g. for the
      // degenerate-explicit-type fixtures) would bake this machine's
      // absolute path into the committed snapshot.
      const output = relativizeImportPaths(generateDeclarationFile(results, mapName), snapshotPath);
      await expect(output).toMatchFileSnapshot(`__file_snapshots__/${snapshotName}.ts`);
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
  "lazy-schema.test.ts":
    "Same JsonValueSchema divergence as described-ref-schema.test.ts: z.input<> is unknown, zinfer's input type is the full recursive union.",
  "recursive-record-schema.test.ts":
    "An annotated recursive getter leaves z.input at `unknown` per Zod 4's ZodType<Output, Input = unknown>, so the input comparison can never hold; zinfer rebuilds the input shape from the getter's AST. Only the input assertions diverge - the output types do match z.output.",
  "enum-schema.test.ts":
    "z.enum() infers the enum's own type; zinfer deliberately expands enum members to their literal values.",
  "intersection-schema.test.ts":
    "z.intersection() infers `A & B`; zinfer flattens it into a single object literal, which is not nominally equal to the intersection.",
  "mixed-union-reference-schema.test.ts":
    "A non-exported recursive union member (InternalNode) is inlined by zinfer rather than kept as a named type, which is not nominally equal to the original union member.",
};

// Divergences that only reproduce under zod v4. Merged into
// KNOWN_TYPE_DIFFERENCES below only when running under v4.
const ZOD_V4_ONLY_TYPE_DIFFERENCES: Record<string, string> = {
  "described-ref-schema.test.ts":
    "JsonValueSchema is annotated z.ZodType<JsonValue>, leaving Input unset (defaults to unknown) per Zod 4's ZodType<Output, Input = unknown>; zinfer generates (and references) the full recursive union instead. zod v3's ZodType defaults Input to Output, so there is nothing to diverge from there.",
};

// Additional divergences that only reproduce under the zod v3 peerDependencies
// floor - zod v3's getter-based recursion infers differently than v4's (see
// lazy-schema.ts above), which changes what these generated companion tests
// expect. Merged into KNOWN_TYPE_DIFFERENCES below only when running under v3.
const ZOD_V3_ONLY_TYPE_DIFFERENCES: Record<string, string> = {
  "alias-getter-schema.test.ts":
    "Getter-based recursion infers differently under zod v3 than v4; see lazy-schema.ts.",
  "getter-schema.test.ts":
    "Getter-based recursion infers differently under zod v3 than v4; see lazy-schema.ts.",
  "recursive-reference-schema.test.ts":
    "Getter-based recursion infers differently under zod v3 than v4; see lazy-schema.ts.",
  "duplicate-field-name-schema.test.ts":
    "zod v3 prints a z.any() key as optional, so the committed types - generated under v4, where the key is required - do not match z.input/z.output there.",
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
  // self-referential getter), or - when running under the zod v3
  // peerDependencies floor - errors from fixtures that intentionally use
  // zod v4-only builders (no v3 equivalent at any version). Anything else
  // is a real regression.
  const fixtureErrors = errorLines.filter((line: string) => /[\\/]fixtures[\\/]/.test(line));
  const unexpectedFixtureErrors = fixtureErrors.filter((line: string) => {
    if (line.includes("TS7022") || line.includes("TS7023")) return false;
    if (
      !isZodV4 &&
      [...ZOD_V4_ONLY_FIXTURES, ...ZOD_V3_EXPLICIT_ANNOTATION_TYPE_ERRORS].some((f) =>
        line.includes(f),
      )
    )
      return false;
    return true;
  });
  if (unexpectedFixtureErrors.length > 0) {
    const expected = isZodV4
      ? "TS7022/TS7023 on unannotated recursive getters"
      : `TS7022/TS7023 on unannotated recursive getters, or errors from ${[...ZOD_V4_ONLY_FIXTURES, ...ZOD_V3_EXPLICIT_ANNOTATION_TYPE_ERRORS].join(", ")} (zod v3 peerDependencies floor)`;
    throw new Error(
      `Unexpected type error(s) in tests/fixtures (expected only ${expected}):\n${unexpectedFixtureErrors.join("\n")}`,
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
  const knownNames = new Set(
    Object.keys({
      ...KNOWN_TYPE_DIFFERENCES,
      ...(isZodV4 ? ZOD_V4_ONLY_TYPE_DIFFERENCES : ZOD_V3_ONLY_TYPE_DIFFERENCES),
    }),
  );

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
    // zod v3's z.lazy() infers a different (optional) type for the
    // self-referencing field than v4's, independent of anything zinfer does.
    { requiresZodV4: true },
  );
  createSchemaTest(
    extractor,
    "getter-schema",
    "should generate TypeScript declarations with getter-based recursive schemas",
    { requiresZodV4: true },
  );
  createSchemaTest(
    extractor,
    "recursive-record-schema",
    "should generate TypeScript declarations with annotated recursive getters",
    // zod v3 infers a getter-based recursion differently; see lazy-schema.ts.
    { requiresZodV4: true },
  );
  createSchemaTest(
    extractor,
    "duplicate-field-name-schema",
    "should generate TypeScript declarations when a nested field shares the reference field's name",
    // zod v3 prints a `z.any()` key as optional and orders the keys
    // differently, which changes the snapshot without changing what it guards.
    { requiresZodV4: true },
  );
  createSchemaTest(
    extractor,
    "recursive-reference-schema",
    "should name a recursive schema at every reference, even where TypeScript printed a placeholder",
    // zod v3 infers a getter-based recursion differently; see lazy-schema.ts.
    { requiresZodV4: true },
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
    // z.looseObject() only exists on zod v4; there is no v3 equivalent at any version.
    { requiresZodV4: true },
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
    // Uses z.lazy() for its recursive JsonValue schema; same v3/v4
    // inference difference as lazy-schema.ts.
    { requiresZodV4: true },
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

    it("should qualify a default-exported local class via its `.default` member, not its local name", () => {
      const results = extractor.extractAll(
        resolve(fixturesDir, "degenerate-explicit-type/default-export-explicit-type-schema.ts"),
      );
      const result = results.find((r) => r.schemaName === "QuxSchema");

      const expected = /^import\(".*default-export-explicit-type-schema"\)\.default$/;
      expect(result?.input).toMatch(expected);
      expect(result?.output).toMatch(expected);
    });

    it("should qualify a renamed-export local class via its external export name, not its local name", () => {
      const results = extractor.extractAll(
        resolve(fixturesDir, "degenerate-explicit-type/aliased-export-explicit-type-schema.ts"),
      );
      const result = results.find((r) => r.schemaName === "QuuxSchema");

      const expected = /^import\(".*aliased-export-explicit-type-schema"\)\.RenamedClass$/;
      expect(result?.input).toMatch(expected);
      expect(result?.output).toMatch(expected);
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
  createSchemaTest(
    extractor,
    "degenerate-explicit-type/default-export-explicit-type-schema",
    "should generate a type-checkable inline import for an explicit annotation naming a default-exported local class",
  );
  createSchemaTest(
    extractor,
    "degenerate-explicit-type/aliased-export-explicit-type-schema",
    "should generate a type-checkable inline import for an explicit annotation naming a renamed-export local class",
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
    // Getter-based recursion infers differently under zod v3; see lazy-schema.ts above.
    it.skipIf(!isZodV4)(
      "should resolve a getter-based self-reference on a schema exported through an alias",
      () => {
        const results = extractor.extractAll(resolve(fixturesDir, "alias-getter-schema.ts"));
        const aliased = results.find((r) => r.schemaName === "AliasedCategorySchema");

        expect(aliased?.output).toContain("subcategories: AliasedCategorySchemaOutput[]");
        expect(aliased?.output).not.toContain("any");
      },
    );
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
    // Getter-based recursion infers differently under zod v3; see lazy-schema.ts above.
    it.skipIf(!isZodV4)(
      "should not stack-overflow on a self-recursive schema and must not blank out other schemas' descriptions (#340)",
      async () => {
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
      },
    );
  });

  describe("recursive-record-schema.ts", () => {
    /**
     * Runs the fixture through the same steps the CLI does for
     * `--with-descriptions`.
     */
    async function generateWithDescriptions(): Promise<string> {
      const filePath = resolve(fixturesDir, "recursive-record-schema.ts");
      const results = extractor.extractAll(filePath);
      const descriptionExtractor = new DescriptionExtractor();

      const descriptions = await descriptionExtractor.extractDescriptions(
        filePath,
        results.map((r) => r.schemaName),
      );

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

      return generateDeclarationFile(resultsWithDescriptions, mapName);
    }

    // Getter-based recursion infers differently under zod v3; see lazy-schema.ts above.
    it.skipIf(!isZodV4)(
      "should emit the self-reference straight away instead of one inlined copy first",
      async () => {
        const output = await generateWithDescriptions();

        // Required key: `children: Record<string, Self>`.
        expect(output).toContain(
          [
            "export type RecursiveRecordInput = {",
            "  /** The node name */",
            "  name: string;",
            "  children: {",
            "    [x: string]: RecursiveRecordInput;",
            "  };",
            "};",
          ].join("\n"),
        );

        // Optional key: `children?: Record<string, Self>`, both when the getter
        // is annotated and when its shape is reconstructed from the AST.
        for (const typeName of ["OptionalRecursiveRecordInput", "InferredOptionalRecordInput"]) {
          expect(output).toMatch(
            new RegExp(
              `export type ${typeName} = \\{\\n  /\\*\\* The \\w+ node name \\*/\\n  name: string;\\n  children\\?: \\{\\n    \\[x: string\\]: ${typeName};\\n  \\}( \\| undefined)?;\\n\\};`,
            ),
          );
        }

        // Array-shaped recursion stays a plain self-referencing array.
        expect(output).toContain("children: RecursiveArrayInput[];");

        // No level of any of them is an expanded copy of the schema, and no
        // placeholder survives in either direction.
        expect(output).not.toMatch(/children\??: \{\n\s+\[x: string\]: \{/);
        expect(output).not.toContain("any");
        expect(output).not.toContain("unknown");
      },
    );

    it.skipIf(!isZodV4)("should keep .describe() on every inlined level", async () => {
      const output = await generateWithDescriptions();

      // A description on a field behind an index signature is written at the
      // path of the field holding the record, so the index signature must not
      // count as a path segment of its own.
      expect(output).toContain(
        [
          "export type LeafRecordInput = {",
          "  leaves: {",
          "    [x: string]: {",
          "      /** The leaf label */",
          "      label: string;",
          "    };",
          "  };",
          "};",
        ].join("\n"),
      );

      // Every recursive schema keeps its description in both directions.
      expect(output.match(/\/\*\* The node name \*\//g)).toHaveLength(2);
      expect(output.match(/\/\*\* The optional node name \*\//g)).toHaveLength(2);
      expect(output.match(/\/\*\* The inferred node name \*\//g)).toHaveLength(2);
      expect(output.match(/\/\*\* The array node name \*\//g)).toHaveLength(2);
      expect(output.match(/\/\*\* The leaf label \*\//g)).toHaveLength(2);
    });

    it.skipIf(!isZodV4)(
      "should merge the two directions of a recursive schema with mergeSame",
      () => {
        const results = extractor.extractAll(resolve(fixturesDir, "recursive-record-schema.ts"));
        const output = generateDeclarationFile(results, mapName, { mergeSame: true });

        expect(output).toContain("export type RecursiveRecordInput = RecursiveRecord;");
        expect(output).toContain("export type RecursiveRecordOutput = RecursiveRecord;");
        expect(output).toContain("[x: string]: RecursiveRecord;");
      },
    );
  });

  describe("recursive-reference-schema.ts", () => {
    // Getter-based recursion infers differently under zod v3; see lazy-schema.ts above.
    it.skipIf(!isZodV4)(
      "should name the recursive schema at a reference TypeScript printed as a bare any",
      () => {
        const results = extractor.extractAll(resolve(fixturesDir, "recursive-reference-schema.ts"));
        const holder = results.find((r) => r.schemaName === "RefHolderSchema");

        // `z.array()` of a schema TypeScript gave up on prints as `any[]`, with
        // no shape to recognise - the field is still known to hold the schema.
        expect(holder?.input).toContain("list: RefNodeSchemaInput[]");
        expect(holder?.output).toContain("list: RefNodeSchemaOutput[]");
        // The shapes it does print must keep naming the schema too.
        expect(holder?.input).toContain("one: RefNodeSchemaInput");
        expect(holder?.input).toContain("map: { [x: string]: RefNodeSchemaInput; }");
        expect(holder?.input).toContain("optional?: RefNodeSchemaInput");
        expect(holder?.input).not.toContain("any");
        expect(holder?.output).not.toContain("any");
      },
    );
  });

  describe("cross-file-recursive", () => {
    // Getter-based recursion infers differently under zod v3; see lazy-schema.ts above.
    it.skipIf(!isZodV4)(
      "should fall back to an index signature, never a bare any, without an importable declaration",
      () => {
        const results = extractor.extractAll(
          resolve(fixturesDir, "cross-file-recursive/tree-schema.ts"),
        );
        const tree = results.find((r) => r.schemaName === "CrossFileTreeSchema");

        // Nothing declares the imported schema's types here, so it stays inlined
        // - but its recursion point keeps the index signature, without which
        // property access would go unchecked.
        expect(tree?.importedFrom).toBeUndefined();
        expect(tree?.input).toContain("children: { [x: string]: any; }");
        expect(tree?.input).not.toMatch(/children: (any|unknown)[;,]/);
      },
    );

    it.skipIf(!isZodV4)(
      "should reference the imported recursive schema by name when its file is generated too",
      () => {
        const nodeFile = resolve(fixturesDir, "cross-file-recursive/node-schema.ts");
        const results = extractor.extractAll(
          resolve(fixturesDir, "cross-file-recursive/tree-schema.ts"),
          { importableFiles: new Set([nodeFile]) },
        );

        const tree = results.find((r) => r.schemaName === "CrossFileTreeSchema");
        expect(tree?.input).toBe(
          "{ root: CrossFileNodeSchemaInput; index: { [x: string]: CrossFileNodeSchemaInput; }; }",
        );

        const node = results.find((r) => r.schemaName === "CrossFileNodeSchema");
        expect(node?.importedFrom).toBe(nodeFile);
        expect(node?.isExported).toBe(false);
      },
    );

    it.skipIf(!isZodV4)(
      "should reference a recursive schema imported under a different name by its declaring file's own export name",
      () => {
        const nodeFile = resolve(fixturesDir, "cross-file-recursive/node-schema.ts");
        const results = extractor.extractAll(
          resolve(fixturesDir, "cross-file-recursive/aliased-tree-schema.ts"),
          { importableFiles: new Set([nodeFile]) },
        );

        // The local alias has no generated type of its own to point at, but
        // the declaring file's own export (CrossFileNodeSchema) does - so the
        // import is just as importable as the non-aliased case.
        const renamed = results.find((r) => r.schemaName === "CrossFileNodeSchema");
        expect(renamed?.importedFrom).toBe(nodeFile);
        expect(renamed?.isExported).toBe(false);

        const tree = results.find((r) => r.schemaName === "AliasedTreeSchema");
        expect(tree?.input).toBe(
          "{ root: CrossFileNodeSchemaInput; list: CrossFileNodeSchemaInput[]; index: { [x: string]: CrossFileNodeSchemaInput; }; }",
        );
        expect(tree?.input).not.toContain("RenamedNodeSchemaInput");
        expect(tree?.input).not.toContain("any");
      },
    );

    it.skipIf(!isZodV4)(
      "should keep an inlined union intact when the referencing field is an array",
      () => {
        const results = extractor.extractAll(
          resolve(fixturesDir, "cross-file-recursive/union-tree-schema.ts"),
        );
        const tree = results.find((r) => r.schemaName === "UnionTreeSchema");

        // The imported schema prints as a union. Wrapped in an array without
        // parentheses, `A | B` followed by `[]` would read as `A | B[]`.
        expect(tree?.input).toMatch(/list: \(string \| \{.*\}\)\[\]/);
      },
    );

    it.skipIf(!isZodV4)(
      "should import the referenced types from the file that declares them",
      () => {
        const nodeFile = resolve(fixturesDir, "cross-file-recursive/node-schema.ts");
        const results = extractor.extractAll(
          resolve(fixturesDir, "cross-file-recursive/tree-schema.ts"),
          { importableFiles: new Set([nodeFile]) },
        );

        const output = generateDeclarationFile(results, mapName, {
          importSources: new Map([["CrossFileNodeSchema", "./node-schema.generated"]]),
        });

        expect(output).toContain(
          'import type { CrossFileNodeInput, CrossFileNodeOutput } from "./node-schema.generated";',
        );
        expect(output).toContain("root: CrossFileNodeInput;");
        expect(output).toContain("[x: string]: CrossFileNodeOutput;");
        // The imported schema is declared by the other file, not re-declared here.
        expect(output).not.toContain("export type CrossFileNodeInput = {");
      },
    );
  });

  describe("nested-import-path fixtures", () => {
    it("should rebase an already-relative import(...) reference against the output file, not the source file, when the output directory differs from the source directory", () => {
      const results = extractor.extractAll(
        resolve(fixturesDir, "nested-import-path/deep/nested/schema.ts"),
      );
      const raw = generateDeclarationFile(results, mapName);

      // Simulates outDir/outPattern remapping: the source lives two
      // directories deeper (deep/nested/) than the output (out/), so a path
      // that is merely left untouched from the printer's source-relative
      // "./common" would be wrong once rebased against this output location.
      const outputPath = resolve(fixturesDir, "nested-import-path/out/schema.generated.ts");
      const output = relativizeImportPaths(raw, outputPath);

      expect(output).toContain('import("../deep/nested/common")');
      expect(output).not.toContain('import("./common")');
    });
  });

  createSchemaTest(
    extractor,
    "nested-import-path/deep/nested/schema",
    "should generate a type-checkable declaration when the referenced type lives in a sibling file two directories deep",
  );

  describe("inline-external-types fixtures", () => {
    it("should leave an import(...) reference untouched by default, and inline the referenced type's own literal union when the flag is set", () => {
      const filePath = resolve(fixturesDir, "nested-import-path/deep/nested/schema.ts");

      const withoutFlag = extractor.extractAll(filePath);
      const field = withoutFlag.find((r) => r.schemaName === "FieldSchema");
      expect(field?.input).toContain('import("');

      const withFlag = extractor.extractAll(filePath, { inlineExternalTypes: true });
      const inlinedField = withFlag.find((r) => r.schemaName === "FieldSchema");
      expect(inlinedField?.input).not.toContain("import(");
      for (const literal of ['"uuid"', '"string"', '"number"', '"boolean"']) {
        expect(inlinedField?.input).toContain(literal);
      }
    });

    it("should recursively inline a type reached through a chain of three separate files", () => {
      const results = extractor.extractAll(
        resolve(fixturesDir, "inline-external-types/chain/schema.ts"),
        {
          inlineExternalTypes: true,
        },
      );
      const chain = results.find((r) => r.schemaName === "ChainSchema");

      // Level2 (reached from Level1) and Level3/Formatter (reached from
      // Level2's own import, invisible from schema.ts) are all expanded -
      // not just the outermost level TypeScript's own printer already
      // expands for free.
      expect(chain?.input).not.toContain("import(");
      expect(chain?.input).toContain("name: string");
      for (const literal of ['"x"', '"y"', '"z"']) {
        expect(chain?.input).toContain(literal);
      }

      // Formatter is a union with a function type member - TypeScript
      // prints the function type already parenthesized, so the "| null"
      // that follows only reads as top-level if the scan correctly skips
      // the arrow's `=>` (which has no matching `<` to close) rather than
      // letting it desync the bracket depth. A desync would silently drop
      // the wrapping parens instead of failing to compile, so this checks
      // the exact string rather than relying on tsgo to catch it.
      expect(chain?.input).toContain("format: (((value: string) => string) | null)");
    });

    it("should stop at a cross-file cycle between plain types and leave a resolvable import(...) reference there, never a dangling bare identifier", () => {
      const results = extractor.extractAll(
        resolve(fixturesDir, "inline-external-types/cycle/schema.ts"),
        {
          inlineExternalTypes: true,
        },
      );
      const cycle = results.find((r) => r.schemaName === "CycleSchema");

      // NodeA and NodeB refer to each other through their own imports, so
      // expanding one hits the other's bare "NodeA"/"NodeB" identifier -
      // valid only inside node-a.ts/node-b.ts's own scope. The cycle must
      // resolve to an absolute import(...), never survive as that bare name.
      expect(cycle?.input).not.toMatch(/[^."]\bNodeA\b/);
      expect(cycle?.input).not.toMatch(/[^."]\bNodeB\b/);
      expect(cycle?.input).toMatch(/import\(".*node-b"\)\.NodeB/);
    });

    it("should never expand a qualified name (an enum member) or a generic instantiation - only reference them", () => {
      // Holder is imported directly, so Kind/Box (invisible here) print as
      // import("kind").Kind.A / import("kind").Box<string> in the raw text
      // resolveType() reads at the top level.
      const direct = extractor.extractAll(
        resolve(fixturesDir, "inline-external-types/qualified/direct-schema.ts"),
        { inlineExternalTypes: true },
      );
      const directHolder = direct.find((r) => r.schemaName === "DirectQualifiedSchema");
      expect(directHolder?.input).toMatch(/import\(".*kind"\)\.Kind\.A/);
      expect(directHolder?.input).toMatch(/import\(".*kind"\)\.Box<string>/);

      // Holder isn't visible from schema.ts (only Wrapper is), so reaching
      // it recurses into holder.ts's own declaration - where Kind and Box
      // *are* visible, printing as the bare "Kind.A"/"Box<string>" that
      // promoteBareTypeReferences has to turn into the same valid form.
      const viaWrapper = extractor.extractAll(
        resolve(fixturesDir, "inline-external-types/qualified/schema.ts"),
        { inlineExternalTypes: true },
      );
      const wrapped = viaWrapper.find((r) => r.schemaName === "QualifiedSchema");
      expect(wrapped?.input).toMatch(/import\(".*kind"\)\.Kind\.A/);
      expect(wrapped?.input).toMatch(/import\(".*kind"\)\.Box<string>/);
      // Holder itself has no such ambiguity, so it's still expanded, not referenced.
      expect(wrapped?.input).not.toMatch(/import\(".*holder"\)/);
    });

    it("should document the known limitation: a cycle through a non-exported same-file type has no fallback and is left as a bare identifier", () => {
      const results = extractor.extractAll(
        resolve(fixturesDir, "inline-external-types/nonexported-cycle/schema.ts"),
        { inlineExternalTypes: true },
      );
      const result = results.find((r) => r.schemaName === "NonExportedCycleSchema");

      // Middle (exported, reached through outer.ts) is expanded; Hidden -
      // declared but not exported from middle.ts, and self-referential -
      // has no importable name to fall back to on the cycle, so it's left
      // as the bare "Hidden" instead. Not asserting this is correct output
      // (it isn't, on its own) - just the accepted, documented limitation.
      expect(result?.input).toBe("{ middle: { hidden: { self?: Hidden; }; }; }");
    });
  });

  createSchemaTest(extractor, "inline-external-types/chain/schema");
  createSchemaTest(extractor, "inline-external-types/cycle/schema");
  createSchemaTest(extractor, "inline-external-types/qualified/direct-schema");
  createSchemaTest(extractor, "inline-external-types/qualified/schema");

  // The tests above assert on individual substrings of the raw extracted
  // type; none of them get run through tsgo. These mirror createSchemaTest
  // but with the flag on, so the afterAll sweep below actually type-checks
  // the novel output shapes this feature produces - parenthesized unions,
  // the cycle fallback, and multi-file expansion - the same way every other
  // fixture's declaration file is verified to compile.
  createSchemaTest(
    extractor,
    "inline-external-types/chain/schema",
    "should generate TypeScript declarations",
    {
      context: { inlineExternalTypes: true },
      snapshotName: "inline-external-types/chain/schema-inlined",
    },
  );
  createSchemaTest(
    extractor,
    "inline-external-types/cycle/schema",
    "should generate TypeScript declarations",
    {
      context: { inlineExternalTypes: true },
      snapshotName: "inline-external-types/cycle/schema-inlined",
    },
  );
  createSchemaTest(
    extractor,
    "inline-external-types/qualified/schema",
    "should generate TypeScript declarations",
    {
      context: { inlineExternalTypes: true },
      snapshotName: "inline-external-types/qualified/schema-inlined",
    },
  );

  describe("same-file-nongenerated-recursive-schema.ts", () => {
    // Getter-based recursion infers differently under zod v3; see lazy-schema.ts above.
    it.skipIf(!isZodV4)(
      "should reference the recursive schema by name through a same-file non-generated intermediate",
      () => {
        const results = extractor.extractAll(
          resolve(fixturesDir, "same-file-nongenerated-recursive-schema.ts"),
        );
        const tree = results.find((r) => r.schemaName === "SameFileTreeSchema");

        // Direct reference already worked before this fix; the point of this
        // fixture is that the reference reached through the non-exported
        // intermediate (SameFileGroupSchema) resolves identically - no
        // import needed, since both generated types live in this same file.
        expect(tree?.input).toBe(
          "{ direct: SameFileNodeSchemaInput; viaGroup: { members: SameFileNodeSchemaInput[]; }; }",
        );
        expect(tree?.output).toBe(
          "{ direct: SameFileNodeSchemaOutput; viaGroup: { members: SameFileNodeSchemaOutput[]; }; }",
        );
        expect(tree?.input).not.toContain("any");
        expect(tree?.output).not.toContain("any");

        const group = results.find((r) => r.schemaName === "SameFileGroupSchema");
        expect(group?.isExported).toBe(false);
        expect(group?.input).toBe("{ members: SameFileNodeSchemaInput[]; }");
        expect(group?.output).toBe("{ members: SameFileNodeSchemaOutput[]; }");
      },
    );

    it.skipIf(!isZodV4)(
      "should print the generated type name, not re-declare it, in the declaration file",
      () => {
        const results = extractor.extractAll(
          resolve(fixturesDir, "same-file-nongenerated-recursive-schema.ts"),
        );
        const output = generateDeclarationFile(results, mapName);

        expect(output).toContain("viaGroup: {\n    members: SameFileNodeInput[];\n  };");
        expect(output).toContain("viaGroup: {\n    members: SameFileNodeOutput[];\n  };");
        expect(output).not.toContain("export type SameFileGroup");
        expect(output).not.toContain("any");
      },
    );
  });

  describe("duplicate-field-name-schema.ts", () => {
    // zod v3 prints these keys differently; see the snapshot test above.
    it.skipIf(!isZodV4)(
      "should rewrite the referencing field, not an unrelated nested field of the same name",
      () => {
        const results = extractor.extractAll(
          resolve(fixturesDir, "duplicate-field-name-schema.ts"),
        );
        const duplicate = results.find((r) => r.schemaName === "DuplicateFieldNameSchema");

        // `child.value` is a plain z.any() that happens to share the reference
        // field's name and to print as the placeholder a given-up-on schema does.
        expect(duplicate?.input).toBe("{ child: { value: any; }; value: ValueSchemaInput; }");
        expect(duplicate?.output).toBe("{ child: { value: any; }; value: ValueSchemaOutput; }");
      },
    );
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
    // Guards against the class of bug in #340: recursion tests
    // (lazy-schema.ts, getter-schema.ts) and description tests
    // (described-schema.ts, etc.) previously never ran through the same
    // extractor, so a schema that was both self-recursive AND described
    // slipped through CI untested. Running DescriptionExtractor over every
    // fixture - regardless of whether it has any .describe() calls - would
    // have caught the stack overflow immediately, since it happens even
    // without a single description present.
    //
    // One `it` per fixture (rather than one `it` looping over all of them)
    // so each test's runtime stays well within testTimeout - the combined
    // sweep's total AST-parse-plus-dynamic-import time crept up on the 30s
    // testTimeout configured in vitest.config.ts and made it flaky on CI.
    const fixtureFiles = readdirSync(fixturesDir)
      .filter((f) => f.endsWith(".ts"))
      // Skip fixtures that only import under zod v4 when running under the
      // zod v3 peerDependencies floor - an import failure there isn't the
      // regression this sweep guards against.
      .filter((f) => isZodV4 || !ZOD_V4_ONLY_FIXTURES.includes(f));
    const descriptionExtractor = new DescriptionExtractor();

    it.each(fixtureFiles)(
      "should extract descriptions from %s without warning (#340)",
      async (file) => {
        const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

        // Assert before mockRestore(): restoring a spy also clears its
        // recorded calls, which would make a post-restore assertion pass
        // unconditionally regardless of what actually happened above.
        try {
          const filePath = resolve(fixturesDir, file);
          const schemaNames = extractor.extractAll(filePath).map((r) => r.schemaName);
          await descriptionExtractor.extractDescriptions(filePath, schemaNames);
          expect(warnSpy).not.toHaveBeenCalled();
        } finally {
          warnSpy.mockRestore();
        }
      },
    );
  });
});
