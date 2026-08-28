export { NORMALIZE_TYPE_DEFINITION, NORMALIZE_TYPE_NAMES } from "@zinfer-monorepo/core";

/**
 * Creates a temporary type alias for extracting input or output type from a Valibot schema.
 *
 * The schema's input/output types are read straight off its internal `~types`
 * property - exactly how `v.InferInput` / `v.InferOutput` are defined. Going
 * through `~types` instead of those helpers means no `valibot` import has to be
 * injected into the analyzed file, so extraction works no matter how (or
 * whether) the file imports Valibot.
 *
 * @param schemaName - The name of the exported Valibot schema (e.g., "UserSchema")
 * @param typeKind - Either 'input' or 'output' to specify which type to extract
 * @returns A TypeScript type alias string to be injected in-memory
 */
export function createTempTypeAlias(schemaName: string, typeKind: "input" | "output"): string {
  const typeName = typeKind === "input" ? "__TempInput" : "__TempOutput";
  return `type ${typeName} = __Normalize<NonNullable<(typeof ${schemaName})["~types"]>["${typeKind}"]>;`;
}
