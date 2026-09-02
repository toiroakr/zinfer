import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resolve, basename } from "pathe";
import { ZodMiniTypeExtractor } from "../src/core/extractor.js";
import { generateDeclarationFile, relativizeImportPaths } from "../src/core/type-printer.js";
import { createNameMapper } from "../src/core/name-mapper.js";
import { DescriptionExtractor } from "../src/core/description-extractor.js";
import { execFileSync } from "child_process";
import { execPath } from "process";

const fixturesDir = resolve(import.meta.dirname, "fixtures");
const snapshotsDir = resolve(import.meta.dirname, "__file_snapshots__");
const tsgoPath = resolve(
  import.meta.dirname,
  "../node_modules/@typescript/native-preview/bin/tsgo",
);
const mapName = createNameMapper({ removeSuffix: "Schema" });

/**
 * Creates a standard schema test case, matching classic zinfer's own
 * `createSchemaTest` pattern in `tests/extractor.test.ts`.
 */
function createSchemaTest(extractor: ZodMiniTypeExtractor, schemaName: string, description = "") {
  describe(`${schemaName}.ts`, () => {
    it(description || "should generate TypeScript declarations", async () => {
      const results = extractor.extractAll(resolve(fixturesDir, `${schemaName}.ts`));
      const snapshotPath = resolve(snapshotsDir, `${schemaName}.ts`);
      const output = relativizeImportPaths(generateDeclarationFile(results, mapName), snapshotPath);
      await expect(output).toMatchFileSnapshot(`__file_snapshots__/${schemaName}.ts`);
    });
  });
}

/**
 * Divergences between zinfer-mini's generated types and `z.input`/`z.output`
 * that are intentional, not bugs - mirrors classic zinfer's
 * `KNOWN_TYPE_DIFFERENCES` allowlist so any *new* divergence fails the build
 * instead of silently passing.
 */
const KNOWN_TYPE_DIFFERENCES: Record<string, string> = {
  "cross-ref-schema.test.ts":
    "TreeSchema is an annotated recursive getter; zod/mini's object() is a plain generic function (not zod-classic's method-chain ZodObject), so the annotation leaves z.input at unknown - zinfer-mini rebuilds the input shape from the getter's AST instead. See README's Known limitations.",
  "getter-schema.test.ts":
    "Same annotated-recursive-getter divergence as cross-ref-schema.test.ts.",
  "lazy-schema.test.ts": "Same annotated-recursive-getter divergence as cross-ref-schema.test.ts.",
  "builders-schema.test.ts":
    "z.intersection() infers `A & B`; zinfer-mini flattens it into a single object literal, which is not nominally equal to the intersection (same documented divergence as classic zinfer's intersection-schema.test.ts).",
  "explicit-function-type-schema.test.ts":
    "CallbackSchema is built from a bare z.custom(fn) with no type argument of its own; z.output<> picks up the explicit z.ZodMiniType<T, I> annotation via contextual typing, but z.input<> resolves to unknown instead - zinfer-mini extracts the annotation's declared input type directly rather than what z.input<> alone would infer. Only the input assertion diverges; output matches.",
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

  if (execError && errorLines.length === 0) {
    throw execError;
  }

  // Fixture files themselves must never have a type error - every builder
  // pattern in tests/fixtures is meant to be valid, real-world zod/mini code.
  const fixtureErrors = errorLines.filter((line: string) => /[\\/]fixtures[\\/]/.test(line));
  if (fixtureErrors.length > 0) {
    throw new Error(`Unexpected type error(s) in tests/fixtures:\n${fixtureErrors.join("\n")}`);
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
}, 30000);

describe("ZodMiniTypeExtractor - Generated TypeScript Declarations", () => {
  const extractor = new ZodMiniTypeExtractor();

  beforeAll(() => {
    extractor.extractAll(resolve(fixturesDir, "basic-schema.ts"));
  });

  createSchemaTest(extractor, "basic-schema");
  createSchemaTest(
    extractor,
    "named-import-schema",
    "should work with named (non-namespace) imports",
  );
  createSchemaTest(
    extractor,
    "cross-ref-schema",
    "should resolve cross-schema references, unions, and brand",
  );
  createSchemaTest(extractor, "described-schema");
  createSchemaTest(
    extractor,
    "getter-schema",
    "should resolve an annotated getter-based recursive schema",
  );
  createSchemaTest(
    extractor,
    "lazy-schema",
    "should resolve an annotated z.lazy() recursive schema",
  );
  createSchemaTest(extractor, "builders-schema", "should cover the full v1 builder surface");
  createSchemaTest(
    extractor,
    "explicit-function-type-schema",
    "should extract a full function type from a z.ZodMiniType<T, I> annotation without truncating at the arrow",
  );
});

describe("described-schema.ts - descriptions", () => {
  it("reads a description set via z.describe()/.check() and via .register(globalRegistry)", async () => {
    const filePath = resolve(fixturesDir, "described-schema.ts");
    const descriptionExtractor = new DescriptionExtractor();
    const descriptions = await descriptionExtractor.extractDescriptions(filePath, ["UserSchema"]);

    const userDescriptions = descriptions.get("UserSchema");
    expect(userDescriptions?.fields.find((f) => f.path === "id")?.description).toBe(
      "The user's unique identifier",
    );
    expect(userDescriptions?.fields.find((f) => f.path === "name")?.description).toBe(
      "The user's display name",
    );
  });
});
