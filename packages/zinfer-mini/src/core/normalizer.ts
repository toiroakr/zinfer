export { NORMALIZE_TYPE_DEFINITION, NORMALIZE_TYPE_NAMES } from "@zinfer-monorepo/core";

/**
 * Local aliases the injected `input`/`output` type-utility import binds its
 * names to - distinctive enough that they never collide with anything in an
 * analyzed file.
 */
export const TYPE_UTILITY_INPUT_ALIAS = "__ZinferMiniInput";
export const TYPE_UTILITY_OUTPUT_ALIAS = "__ZinferMiniOutput";

/**
 * Builds the import statement that makes zod/mini's `input`/`output` type
 * utilities available under private aliases, regardless of how (or whether)
 * the analyzed file itself imports zod/mini.
 *
 * zinfer (classic zod) reuses whatever `z` identifier the analyzed file
 * already has in scope for its own `z.input<>`/`z.output<>` temp alias - which
 * only works because zinfer requires that convention. zod/mini has no such
 * convention to lean on: a file may use a namespace import under any alias, or
 * (commonly, since tree-shaking a bundle down is the whole point of zod/mini)
 * only named imports with no namespace binding at all. Injecting a private,
 * self-contained import sidesteps the question entirely.
 */
export function createTypeUtilityImportStatement(moduleSpecifier: string): string {
  return `import type { input as ${TYPE_UTILITY_INPUT_ALIAS}, output as ${TYPE_UTILITY_OUTPUT_ALIAS} } from "${moduleSpecifier}";`;
}

/**
 * Creates a temporary type alias for extracting input or output type from a
 * zod/mini schema.
 *
 * @param schemaName - The name of the exported zod/mini schema (e.g., "UserSchema")
 * @param typeKind - Either 'input' or 'output' to specify which type to extract
 * @returns A TypeScript type alias string to be injected in-memory
 */
export function createTempTypeAlias(schemaName: string, typeKind: "input" | "output"): string {
  const typeName = typeKind === "input" ? "__TempInput" : "__TempOutput";
  const utilityAlias = typeKind === "input" ? TYPE_UTILITY_INPUT_ALIAS : TYPE_UTILITY_OUTPUT_ALIAS;
  return `type ${typeName} = __Normalize<${utilityAlias}<typeof ${schemaName}>>;`;
}

/**
 * Canonicalizes a printed brand qualifier to the bare `BRAND<...>` form.
 *
 * TypeScript prints zod/mini's internal brand marker qualified by however the
 * analyzed file imported zod/mini - e.g. `z.core.$brand<"Tag">`,
 * `import("zod/mini").core.$brand<"Tag">` - rather than the bare
 * `BRAND<"Tag">` that matches the `import type { BRAND } from "zod"` this
 * tool emits (classic zod's compat re-export - the same stable name zinfer
 * uses, since zod/mini itself exports no `BRAND` type of its own).
 */
export function normalizeBrandQualifiers(typeStr: string): string {
  return typeStr.replace(
    /(?:[\w$]+(?:\.[\w$]+)*\.|import\([^)]*\)\.)?(?:\$brand|BRAND)</g,
    "BRAND<",
  );
}
