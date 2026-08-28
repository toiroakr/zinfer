/**
 * Normalize type definition for expanding utility types, intersections, and conditional types.
 *
 * This type template is injected in-memory to expand complex type structures
 * into their fully evaluated form.
 *
 * Built-in types like Date, Array, Map, Set, Promise, Function, etc. are preserved without expansion.
 * Symbol-keyed properties (like a schema library's internal brand marker) are filtered out from object types.
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
 * Names of the type aliases `NORMALIZE_TYPE_DEFINITION` declares, for callers
 * that need to remove them from a source file again (e.g. after printing a
 * schema's type).
 */
export const NORMALIZE_TYPE_NAMES = ["__Normalize", "__NormalizeTuple"] as const;
