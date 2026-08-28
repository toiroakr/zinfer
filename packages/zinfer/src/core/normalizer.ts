export { NORMALIZE_TYPE_DEFINITION, NORMALIZE_TYPE_NAMES } from "@zinfer-monorepo/core";

/**
 * Creates a temporary type alias for extracting input or output type from a Zod schema.
 *
 * @param schemaName - The name of the exported Zod schema (e.g., "UserSchema")
 * @param typeKind - Either 'input' or 'output' to specify which type to extract
 * @returns A TypeScript type alias string to be injected in-memory
 */
export function createTempTypeAlias(schemaName: string, typeKind: "input" | "output"): string {
  const typeName = typeKind === "input" ? "__TempInput" : "__TempOutput";
  return `type ${typeName} = __Normalize<z.${typeKind}<typeof ${schemaName}>>;`;
}

/**
 * Canonicalizes a printed brand qualifier to the bare `BRAND<...>` form.
 *
 * Once branded primitives are no longer stripped by `__Normalize`, TypeScript
 * prints Zod's internal brand marker qualified by however the analyzed file
 * imported Zod - e.g. `z.core.$brand<"Tag">`, `z.BRAND<"Tag">`, or
 * `import("zod").BRAND<"Tag">` - rather than the bare `BRAND<"Tag">` that
 * matches the `import type { BRAND } from "zod"` this tool emits.
 */
export function normalizeBrandQualifiers(typeStr: string): string {
  return typeStr.replace(
    /(?:[\w$]+(?:\.[\w$]+)*\.|import\([^)]*\)\.)?(?:\$brand|BRAND)</g,
    "BRAND<",
  );
}
