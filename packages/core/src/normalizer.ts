/**
 * Normalize type definition for expanding utility types, intersections, and conditional types.
 *
 * This type template is injected in-memory to expand complex type structures
 * into their fully evaluated form.
 *
 * Built-in types like Date, Array, Map, Set, Promise, Function, etc. are preserved without expansion.
 *
 * An object that carries a symbol-keyed property (a schema library's internal
 * brand marker, typically) is returned untouched rather than mapped, so that
 * property survives - a homomorphic mapped type over its other keys would
 * otherwise drop it, silently stripping the brand. An object with no
 * symbol-keyed properties is mapped as normal, which incidentally excludes
 * symbol keys from the result, but there are none to begin with.
 *
 * An array or tuple gets the same treatment, against `keyof any[] & symbol`
 * rather than `never` - an array type always carries the well-known symbols
 * `Array` itself declares (`Symbol.iterator`, `Symbol.unscopables`), so
 * anything beyond those is a marker someone intersected in. Without this,
 * a brand applied directly to a tuple or array was mangled: a fixed-length
 * tuple went through the mapped-type branch, which over an intersection is
 * no longer homomorphic and expands every `Array.prototype` member into an
 * object literal, and an array lost its brand to the `(infer U)[]` branch.
 */
export const NORMALIZE_TYPE_DEFINITION = `
type __Normalize<T> =
  T extends Date | RegExp | Error | Map<any, any> | Set<any> | WeakMap<any, any> | WeakSet<any> | Promise<any> | Function
    ? T
    : T extends (...args: infer A) => infer R
      ? (...args: __Normalize<A>) => __Normalize<R>
      : T extends readonly any[]
        ? keyof T & symbol extends keyof any[] & symbol
          ? number extends T['length']
            ? T extends readonly [any, ...any[]]
              ? T extends [any, ...any[]]
                ? __NormalizeTuple<T>
                : Readonly<__NormalizeTuple<T>>
              : T extends (infer U)[]
                ? __Normalize<U>[]
                : readonly __Normalize<T[number]>[]
            : { [K in keyof T]: __Normalize<T[K]> }
          : T
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
