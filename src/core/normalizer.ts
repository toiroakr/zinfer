/**
 * Normalize type definition for expanding utility types, intersections, and conditional types.
 *
 * This type template is injected in-memory to expand complex type structures
 * into their fully evaluated form.
 *
 * Built-in types like Date, Array, Map, Set, Promise, Function, etc. are preserved without expansion.
 * Symbol-keyed properties (like Zod's [BRAND]) are filtered out from object types.
 */
export const NORMALIZE_TYPE_DEFINITION = `
type __Normalize<T> =
  T extends Date | RegExp | Error | Map<any, any> | Set<any> | WeakMap<any, any> | WeakSet<any> | Promise<any> | Function
    ? T
    : T extends (...args: infer A) => infer R
      ? (...args: __Normalize<A>) => __Normalize<R>
      : T extends readonly (infer U)[]
        ? readonly __Normalize<U>[]
        : T extends (infer U)[]
          ? __Normalize<U>[]
          : T extends string
            ? T extends object ? string : T
            : T extends number
              ? T extends object ? number : T
              : T extends boolean
                ? T extends object ? boolean : T
                : T extends bigint
                  ? T extends object ? bigint : T
                  : T extends object
                    ? T extends infer O
                      ? { [K in keyof O as K extends symbol ? never : K]: __Normalize<O[K]> }
                      : never
                    : T;
`;

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
 * Names of temporary types that are injected during extraction.
 * These should be cleaned up after extraction is complete.
 */
export const TEMP_TYPE_NAMES = ["__Normalize", "__TempInput", "__TempOutput"] as const;
