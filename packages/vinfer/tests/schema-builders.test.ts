import { describe, it, expect } from "vitest";
import { Project, Type } from "ts-morph";
import { resolve } from "pathe";
import * as v from "valibot";
import { VALIBOT_SCHEMA_PRODUCERS } from "../src/core/valibot-bindings.js";

const tsConfigFilePath = resolve(import.meta.dirname, "../tsconfig.json");

/**
 * Classifies valibot's exports by asking the type checker which of them
 * return a schema, so this test tracks whatever valibot is installed
 * instead of restating a list vinfer already hardcodes (which would only
 * ever agree with itself).
 *
 * The classification is purely type-level - it never *calls* anything. Some
 * of valibot's exports mutate global state (`v.setGlobalConfig`,
 * `v.setGlobalMessage`, `v.deleteGlobalConfig`), so probing them by
 * invocation would corrupt the rest of the run.
 */
function schemaProducingExports(names: string[]): Set<string> {
  const project = new Project({ tsConfigFilePath });
  const sourceFile = project.createSourceFile(
    "vinfer-schema-builder-probe.ts",
    [
      `import * as v from "valibot";`,
      // Valibot tags every value it produces, so this is exact rather than
      // structural: schemas are kind "schema", while the actions meant for
      // v.pipe() are "validation" / "transformation" / "metadata".
      // `0 extends 1 & T` is the standard IsAny probe. It matters here:
      // several valibot utilities (v.getFallback, v.getDotPath, ...) have
      // return types that cannot be resolved at their constraint and come
      // back as `any`, and `any` satisfies *every* extends check - without
      // this guard they would all be misreported as schema builders.
      `type IsSchema<T> = 0 extends 1 & T`,
      `  ? false`,
      `  : [T] extends [never]`,
      `    ? false`,
      `    : [T] extends [{ readonly kind: "schema" }]`,
      `      ? true`,
      `      : false;`,
      ...names.flatMap((name, index) => [
        `type Fn${index} = typeof v.${name};`,
        `type Is${index} = IsSchema<ReturnType<typeof v.${name}>>;`,
      ]),
    ].join("\n"),
    { overwrite: true },
  );

  const found = new Set<string>();
  names.forEach((name, index) => {
    // Classes and construct-only exports have no call signature;
    // `ReturnType` of one is an error type that spuriously satisfies the
    // conditional, so gate on there being a real call signature first.
    const fnType: Type = sourceFile.getTypeAliasOrThrow(`Fn${index}`).getType();
    if (fnType.getCallSignatures().length === 0) return;
    if (sourceFile.getTypeAliasOrThrow(`Is${index}`).getType().getText() === "true") {
      found.add(name);
    }
  });
  return found;
}

describe("VALIBOT_SCHEMA_PRODUCERS", () => {
  // Guards the *fast path*, not correctness: a builder missing here still
  // resolves through the type-based fallback in SchemaDetector, just more
  // slowly. Keeping it complete is what stops every `v.string()` in a
  // codebase from paying for a type resolution.
  it("covers every schema-producing valibot export", () => {
    const names = Object.keys(v)
      .filter((key) => typeof (v as unknown as Record<string, unknown>)[key] === "function")
      // Internal helpers valibot exports but does not document.
      .filter((key) => !key.startsWith("_"))
      .filter((key) => !/^[A-Z]/.test(key))
      .sort();

    const missing = [...schemaProducingExports(names)]
      .filter((name) => !VALIBOT_SCHEMA_PRODUCERS.has(name))
      .sort();

    expect(
      missing,
      `valibot exports ${missing.length} schema builder(s) that VALIBOT_SCHEMA_PRODUCERS ` +
        `does not list. Add them to src/core/valibot-bindings.ts (and cover the user-facing ` +
        `ones in tests/fixtures/):\n  ${missing.join(" ")}`,
    ).toEqual([]);
  });
});
