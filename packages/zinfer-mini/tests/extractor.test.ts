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
    "standalone-mini-package-schema",
    "should work with the standalone @zod/mini package, not just zod's zod/mini subpath",
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

  describe("lazy-cross-file-explicit-type/schema.ts", () => {
    // #455: a z.lazy() recursive schema whose explicit z.ZodMiniType<T>
    // annotation reaches a type declared in another file. At the recursion
    // point TypeScript's printer can't expand NodeOutput's structure again,
    // so it falls back to the bare identifier "NodeOutput" - visible only
    // via this file's own `import type`. Left as-is, the generated
    // declaration references a name it never imports and doesn't type-check
    // standalone; it should be rewritten to the schema's own self-reference.
    it("should rewrite a cross-file recursion point to the schema's own generated type name instead of a bare unimported identifier", () => {
      const results = extractor.extractAll(
        resolve(fixturesDir, "lazy-cross-file-explicit-type/schema.ts"),
      );
      const result = results.find((r) => r.schemaName === "NodeSchema");

      expect(result?.input).not.toContain("NodeOutput");
      expect(result?.output).not.toContain("NodeOutput");
      expect(result?.input).toBe("{ value: string; children?: Record<string, NodeSchemaInput>; }");
      expect(result?.output).toBe(
        "{ value: string; children?: Record<string, NodeSchemaOutput>; }",
      );
    });
  });

  createSchemaTest(
    extractor,
    "lazy-cross-file-explicit-type/schema",
    "should generate a type-checkable recursive declaration when the explicit annotation reaches another file",
  );

  describe("lazy-cross-file-explicit-type-non-exported/schema.ts", () => {
    // #518: a z.lazy() recursive schema with an explicit z.ZodMiniType<T>
    // annotation reaching a type declared in another file, where the schema
    // itself is never exported and reached only inline through
    // ContainerSchema. At the recursion point TypeScript's printer falls
    // back to the bare "NodeOutput" identifier; rewriting that to
    // "NodeSchemaInput"/"NodeSchemaOutput" would just trade one undeclared
    // identifier for another, since a non-exported schema gets no
    // declaration of its own. It should widen to `any` instead.
    it("should widen a non-exported schema's cross-file recursion point to any instead of an undeclared schema name", () => {
      const results = extractor.extractAll(
        resolve(fixturesDir, "lazy-cross-file-explicit-type-non-exported/schema.ts"),
      );
      const result = results.find((r) => r.schemaName === "NodeSchema");

      expect(result?.input).not.toContain("NodeOutput");
      expect(result?.output).not.toContain("NodeOutput");
      expect(result?.input).not.toContain("NodeSchemaInput");
      expect(result?.output).not.toContain("NodeSchemaOutput");
      expect(result?.input).toBe("{ value: string; children?: Record<string, any>; }");
      expect(result?.output).toBe("{ value: string; children?: Record<string, any>; }");
    });
  });

  createSchemaTest(
    extractor,
    "lazy-cross-file-explicit-type-non-exported/schema",
    "should generate a type-checkable declaration when a non-exported recursive schema's explicit annotation reaches another file",
  );

  describe("nonexported-recursive-getter-schema.ts", () => {
    // A getter-based self-reference that is itself not exported and reached
    // only inline through another schema. #527: rather than widening the
    // reference (and LocalRecursiveSchema's own recursion point) to `any`,
    // LocalRecursiveSchema is promoted to its own non-exported declaration
    // (declaredLocally) - the same treatment an exported schema gets, minus
    // the `export` keyword - so both stay fully typed.
    it("should reference a non-exported recursive schema's own generated type name, not widen it to any, when it is inlined elsewhere", () => {
      const results = extractor.extractAll(
        resolve(fixturesDir, "nonexported-recursive-getter-schema.ts"),
      );
      const container = results.find((r) => r.schemaName === "NonexportedRecursiveContainerSchema");
      const localRecursive = results.find((r) => r.schemaName === "LocalRecursiveSchema");

      expect(container?.input).not.toContain("any");
      expect(container?.output).not.toContain("any");
      expect(container?.input).toBe("{ localRecursive: LocalRecursiveSchemaInput; }");
      expect(container?.output).toBe("{ localRecursive: LocalRecursiveSchemaOutput; }");

      expect(localRecursive?.isExported).toBe(false);
      expect(localRecursive?.declaredLocally).toBe(true);
      expect(localRecursive?.input).toBe(
        "{ label: string; kids: { [x: string]: LocalRecursiveSchemaInput; }; }",
      );
      expect(localRecursive?.output).toBe(
        "{ label: string; kids: { [x: string]: LocalRecursiveSchemaOutput; }; }",
      );
    });

    it("should declare the promoted local without exporting it, in the generated declaration file", () => {
      const results = extractor.extractAll(
        resolve(fixturesDir, "nonexported-recursive-getter-schema.ts"),
      );
      const output = generateDeclarationFile(results, mapName);

      expect(output).toContain("type LocalRecursiveInput = {");
      expect(output).toContain("type LocalRecursiveOutput = {");
      expect(output).not.toContain("export type LocalRecursive");
      expect(output).toContain("localRecursive: LocalRecursiveInput;");
      expect(output).toContain("localRecursive: LocalRecursiveOutput;");
      expect(output).not.toContain("any");
    });
  });

  createSchemaTest(
    extractor,
    "nonexported-recursive-getter-schema",
    "should generate a type-checkable declaration for a non-exported, self-referencing recursive schema",
  );

  describe("nonexported-recursive-explicit-type-schema.ts", () => {
    // #527's own repro: a same-file explicit z.ZodMiniType<T> self-recursive
    // schema (NodeSchema) that is itself not exported and reached only
    // inline through ContainerSchema. Both NodeSchema's own recursion point
    // and ContainerSchema's reference to it should point at NodeSchema's own
    // promoted local declaration, not widen to `any`.
    it("should reference a non-exported, same-file explicit-annotation self-recursive schema's own generated type name instead of widening to any", () => {
      const results = extractor.extractAll(
        resolve(fixturesDir, "nonexported-recursive-explicit-type-schema.ts"),
      );
      const container = results.find((r) => r.schemaName === "ContainerSchema");
      const node = results.find((r) => r.schemaName === "NodeSchema");

      expect(container?.input).not.toContain("any");
      expect(container?.output).not.toContain("any");
      expect(container?.input).toBe("{ name: string; root: NodeSchemaInput; }");
      expect(container?.output).toBe("{ name: string; root: NodeSchemaOutput; }");

      expect(node?.isExported).toBe(false);
      expect(node?.declaredLocally).toBe(true);
      expect(node?.input).toBe("{ value: string; children?: Record<string, NodeSchemaInput>; }");
      expect(node?.output).toBe("{ value: string; children?: Record<string, NodeSchemaOutput>; }");
    });

    it("should declare the promoted local without exporting it, in the generated declaration file", () => {
      const results = extractor.extractAll(
        resolve(fixturesDir, "nonexported-recursive-explicit-type-schema.ts"),
      );
      const output = generateDeclarationFile(results, mapName);

      expect(output).toContain("type NodeInput = {");
      expect(output).toContain("type NodeOutput = {");
      expect(output).not.toContain("export type Node ");
      expect(output).toContain("root: NodeInput;");
      expect(output).toContain("root: NodeOutput;");
      expect(output).not.toContain("any");
    });
  });

  createSchemaTest(
    extractor,
    "nonexported-recursive-explicit-type-schema",
    "should generate a type-checkable declaration for a non-exported, same-file explicit-annotation self-recursive schema",
  );

  describe("nonexported-recursive-name-collision-schema.ts", () => {
    // #527: NodeSchema and Node are two different, unrelated self-recursive
    // schemas that both map to the base name "Node" once promoted to their
    // own local declaration. The second one to be assigned a name must be
    // disambiguated rather than silently colliding with (and being
    // overwritten by, or overwriting) the first.
    it("should disambiguate two promoted locals whose mapped names collide", () => {
      const results = extractor.extractAll(
        resolve(fixturesDir, "nonexported-recursive-name-collision-schema.ts"),
      );
      const output = generateDeclarationFile(results, mapName);

      expect(output).toContain("type NodeInput = {");
      expect(output).toContain("type NodeOutput = {");
      expect(output).toContain("type NodeInput2 = {");
      expect(output).toContain("type NodeOutput2 = {");
      expect(output).toContain("label: string;");
      expect(output).toContain("title: string;");
      expect(output).not.toContain("any");

      expect(output).toContain("a: NodeInput;");
      expect(output).toContain("b: NodeInput2;");

      const container = results.find((r) => r.schemaName === "CollisionContainerSchema");
      expect(container?.input).toBe("{ a: NodeSchemaInput; b: NodeInput; }");
    });
  });

  describe("dollar-identifier-nonexported-recursive-schema.ts", () => {
    // #529 review finding: `\b` is defined in terms of `\w` ([A-Za-z0-9_]),
    // which excludes `$` (legal at the start of a JS/TS identifier). A
    // promoted local's own marker text needs the same `$`-aware rewrite the
    // same-file self-reference rewrite already gets - otherwise
    // "$NodeSchemaInput"/"$NodeSchemaOutput" leaks through unresolved
    // instead of being rewritten to the promoted local's generated name.
    it("should rewrite a promoted local's own marker even when its schema name starts with $", () => {
      const results = extractor.extractAll(
        resolve(fixturesDir, "dollar-identifier-nonexported-recursive-schema.ts"),
      );
      const output = generateDeclarationFile(results, mapName);

      expect(output).not.toContain("$NodeSchemaInput");
      expect(output).not.toContain("$NodeSchemaOutput");
      // mapName only strips the "Schema" suffix, so the promoted local's
      // generated name keeps the schema's own leading $.
      expect(output).toContain("type $NodeInput = {");
      expect(output).toContain("type $NodeOutput = {");
      expect(output).toContain("root: $NodeInput;");
      expect(output).toContain("root: $NodeOutput;");
    });
  });

  createSchemaTest(extractor, "builders-schema", "should cover the full v1 builder surface");
  createSchemaTest(
    extractor,
    "explicit-function-type-schema",
    "should extract a full function type from a z.ZodMiniType<T, I> annotation without truncating at the arrow",
  );
  createSchemaTest(
    extractor,
    "unrelated-zod-mini-type-schema",
    "should not mistake a same-named, unrelated ZodMiniType annotation for zod/mini's own type",
  );
  createSchemaTest(
    extractor,
    "nested-object-reference-schema",
    "should not conflate a reference nested inside another object()'s field with an unrelated same-named top-level field",
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
