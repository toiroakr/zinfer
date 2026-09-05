import { describe, it, expect } from "vitest";
import { Project, Type } from "ts-morph";
import { resolve } from "pathe";
import { z } from "zod";
import { ZOD_SCHEMA_BUILDERS } from "../src/core/schema-detector.js";

// z.core (and with it $ZodType, the marker every v4 schema shares) only
// exists on zod v4. Under the v3 peerDependencies floor there is nothing to
// classify against, and the installed export surface is a different library
// generation than the one this set is kept complete for.
const isZodV4 = typeof z.looseObject === "function";

const tsConfigFilePath = resolve(import.meta.dirname, "../tsconfig.json");

/**
 * Classifies zod's own exports by asking the type checker which of them
 * return a schema, so this test tracks whatever zod is installed instead of
 * restating a list zinfer already hardcodes (which would only ever agree
 * with itself).
 *
 * The classification is purely type-level - it never *calls* anything. Some
 * of zod's exports mutate global state (`z.config`, `z.setErrorMap`,
 * `z.setGlobalMessage`), so probing them by invocation would corrupt the
 * rest of the run.
 */
function schemaProducingExports(namespacePath: string, names: string[]): Set<string> {
  const project = new Project({ tsConfigFilePath });
  const sourceFile = project.createSourceFile(
    "zinfer-schema-builder-probe.ts",
    [
      `import { z } from "zod";`,
      // $ZodType is the base every zod v4 schema extends. Checks
      // (z.refine, z.minLength, ...) deliberately do not - they are meant
      // to be handed to a schema, not used as one.
      `type IsSchema<T> = [T] extends [z.core.$ZodType] ? true : false;`,
      ...names.flatMap((name, index) => [
        `type Fn${index} = typeof ${namespacePath}.${name};`,
        `type Is${index} = IsSchema<ReturnType<typeof ${namespacePath}.${name}>>;`,
      ]),
    ].join("\n"),
    { overwrite: true },
  );

  const found = new Set<string>();
  names.forEach((name, index) => {
    // Classes (ZodString, ZodError, ...) are construct-only. `ReturnType`
    // of one is an error type that spuriously satisfies the conditional,
    // so gate on there being a real call signature first.
    const fnType: Type = sourceFile.getTypeAliasOrThrow(`Fn${index}`).getType();
    if (fnType.getCallSignatures().length === 0) return;
    if (sourceFile.getTypeAliasOrThrow(`Is${index}`).getType().getText() === "true") {
      found.add(name);
    }
  });
  return found;
}

const functionExportNames = () =>
  Object.keys(z)
    .filter((key) => typeof (z as unknown as Record<string, unknown>)[key] === "function")
    .sort();

/**
 * zod's internal namespaces. They do expose schema classes, but nobody
 * writes `z.core.$ZodString` or `z.util.*` as a schema declaration, so
 * spending a fast-path entry on them isn't worth it - the type-based
 * fallback still resolves one if it ever shows up, so leaving them off
 * costs a type resolution, not a dropped schema.
 */
const INTERNAL_NAMESPACES = new Set(["core", "util"]);

/** Object-valued exports that group further builders (`z.iso`, `z.coerce`). */
const namespaceExportNames = () =>
  Object.keys(z)
    .filter((key) => {
      const value = (z as unknown as Record<string, unknown>)[key];
      return typeof value === "object" && value !== null && !/^[A-Z_]/.test(key);
    })
    .filter((key) => !INTERNAL_NAMESPACES.has(key))
    .sort();

describe("ZOD_SCHEMA_BUILDERS", () => {
  // Guards the *fast path*, not correctness: a builder missing here still
  // resolves through the type-based fallback in SchemaDetector, just more
  // slowly. Keeping it complete is what stops every `z.email()` in a
  // codebase from paying for a type resolution.
  it.skipIf(!isZodV4)("covers every schema-producing zod export", () => {
    const names = functionExportNames();
    const missing = [...schemaProducingExports("z", names)]
      .filter((name) => !ZOD_SCHEMA_BUILDERS.has(name))
      .sort();

    expect(
      missing,
      `zod exports ${missing.length} schema builder(s) that ZOD_SCHEMA_BUILDERS does not list. ` +
        `Add them to src/core/schema-detector.ts (and cover the user-facing ones in ` +
        `tests/fixtures/v4-builders-schema.ts):\n  ${missing.join(" ")}`,
    ).toEqual([]);
  });

  // `z.iso.date()` and `z.coerce.string()` reach the detector as the
  // *namespace* name, since that is what follows the `z.` prefix.
  it.skipIf(!isZodV4)("covers namespaces that group further builders", () => {
    const missing = namespaceExportNames()
      .filter((namespace) => {
        const members = Object.keys(
          (z as unknown as Record<string, Record<string, unknown>>)[namespace],
        ).filter((key) => typeof (z as any)[namespace][key] === "function");
        if (members.length === 0) return false;
        return schemaProducingExports(`z.${namespace}`, members).size > 0;
      })
      .filter((namespace) => !ZOD_SCHEMA_BUILDERS.has(namespace))
      .sort();

    expect(
      missing,
      `zod groups schema builders under namespace(s) that ZOD_SCHEMA_BUILDERS does not list: ` +
        `${missing.join(" ")}`,
    ).toEqual([]);
  });

  // The reverse direction is deliberately *not* asserted: the set keeps zod
  // v3 names (pipeline, effect, transformer) that v4 dropped, because
  // zinfer still supports v3 through its peerDependencies floor.
  it("keeps the zod v3 builder names the peerDependencies floor still needs", () => {
    for (const name of ["pipeline", "effect", "transformer", "coerce", "brand"]) {
      expect(ZOD_SCHEMA_BUILDERS.has(name), `${name} must stay listed for zod v3`).toBe(true);
    }
  });
});
