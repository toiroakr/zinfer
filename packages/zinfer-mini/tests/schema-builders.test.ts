import { describe, it, expect } from "vitest";
import { Project, Type } from "ts-morph";
import { resolve } from "pathe";
import * as z from "zod/mini";
import { ZOD_MINI_SCHEMA_BUILDERS } from "../src/core/zod-mini-bindings.js";

const tsConfigFilePath = resolve(import.meta.dirname, "../tsconfig.json");

/**
 * Classifies zod/mini's exports by asking the type checker which of them
 * return a schema, so this test tracks whatever zod is installed instead of
 * restating a list zinfer-mini already hardcodes (which would only ever
 * agree with itself).
 *
 * The classification is purely type-level - it never *calls* anything. Some
 * of zod's exports mutate global state (`z.config`, `z.setGlobalMessage`),
 * so probing them by invocation would corrupt the rest of the run.
 */
function schemaProducingExports(names: string[]): Set<string> {
  const project = new Project({ tsConfigFilePath });
  const sourceFile = project.createSourceFile(
    "zinfer-mini-schema-builder-probe.ts",
    [
      `import * as z from "zod/mini";`,
      // $ZodType is the base every zod schema extends. Checks (z.refine,
      // z.minLength, z.property, ...) deliberately do not - they are meant
      // to be handed to a schema's .check(), not used as a schema.
      // `0 extends 1 & T` is the standard IsAny probe. An export whose
      // return type cannot be resolved at its constraint comes back as
      // `any`, and `any` satisfies *every* extends check - without this
      // guard it would be misreported as a schema builder.
      `type IsSchema<T> = 0 extends 1 & T`,
      `  ? false`,
      `  : [T] extends [never]`,
      `    ? false`,
      `    : [T] extends [z.core.$ZodType]`,
      `      ? true`,
      `      : false;`,
      ...names.flatMap((name, index) => [
        `type Fn${index} = typeof z.${name};`,
        `type Is${index} = IsSchema<ReturnType<typeof z.${name}>>;`,
      ]),
    ].join("\n"),
    { overwrite: true },
  );

  const found = new Set<string>();
  names.forEach((name, index) => {
    // Classes (ZodMiniString, ...) are construct-only. `ReturnType` of one
    // is an error type that spuriously satisfies the conditional, so gate
    // on there being a real call signature first.
    const fnType: Type = sourceFile.getTypeAliasOrThrow(`Fn${index}`).getType();
    if (fnType.getCallSignatures().length === 0) return;
    if (sourceFile.getTypeAliasOrThrow(`Is${index}`).getType().getText() === "true") {
      found.add(name);
    }
  });
  return found;
}

describe("ZOD_MINI_SCHEMA_BUILDERS", () => {
  // Guards the *fast path*, not correctness: a builder missing here still
  // resolves through the type-based fallback in SchemaDetector, just more
  // slowly. Keeping it complete is what stops every `z.email()` in a
  // codebase from paying for a type resolution.
  it("covers every schema-producing zod/mini export", () => {
    const names = Object.keys(z)
      .filter((key) => typeof (z as unknown as Record<string, unknown>)[key] === "function")
      .filter((key) => !/^[A-Z]/.test(key))
      .sort();

    const missing = [...schemaProducingExports(names)]
      .filter((name) => !ZOD_MINI_SCHEMA_BUILDERS.has(name))
      .sort();

    expect(
      missing,
      `zod/mini exports ${missing.length} schema builder(s) that ZOD_MINI_SCHEMA_BUILDERS ` +
        `does not list. Add them to src/core/zod-mini-bindings.ts (and cover the user-facing ` +
        `ones in tests/fixtures/builders-schema.ts):\n  ${missing.join(" ")}`,
    ).toEqual([]);
  });
});
