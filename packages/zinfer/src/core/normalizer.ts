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
      : T extends readonly any[]
        ? number extends T['length']
          ? T extends readonly [any, ...any[]]
            ? T extends [any, ...any[]]
              ? __NormalizeTuple<T>
              : Readonly<__NormalizeTuple<T>>
            : T extends (infer U)[]
              ? __Normalize<U>[]
              : readonly __Normalize<T[number]>[]
          : { [K in keyof T]: __Normalize<T[K]> }
        : T extends string | number | boolean | bigint | symbol
          ? T
          : T extends object
            ? keyof T & symbol extends never
              ? T extends infer O
                ? { [K in keyof O as K extends symbol ? never : K]: __Normalize<O[K]> }
                : never
              : T
            : T;

type __NormalizeTuple<T> =
  T extends readonly [infer H, ...infer R]
    ? [__Normalize<H>, ...__NormalizeTuple<R>]
    : T extends readonly (infer U)[]
      ? __Normalize<U>[]
      : [];
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
