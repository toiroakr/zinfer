import { Node, type SourceFile } from "ts-morph";
import { escapeRegExp } from "./regexp.js";

/**
 * Module specifiers that are treated as zod/mini. zod ships the mini API as a
 * subpath of the single `zod` npm package (not a separate package), reachable
 * under three equivalent specifiers.
 */
const ZOD_MINI_MODULES = new Set(["zod/mini", "zod/v4/mini", "zod/v4-mini"]);

/**
 * Namespace aliases assumed when a file has no visible zod/mini import.
 *
 * Some call sites hand us a source file whose import list is unavailable
 * (synthetic files, partial snippets). Assuming the conventional
 * `import * as z from "zod/mini"` alias keeps detection working there without
 * loosening it for files that do declare their imports.
 */
const DEFAULT_NAMESPACE_ALIASES = ["z"];

/**
 * Resolves how a source file refers to zod/mini's exports.
 *
 * zod/mini is used either through a namespace import (`import * as z from
 * "zod/mini"` - the style its docs recommend) or through named imports
 * (`import { object, string } from "zod/mini"` - common since tree-shaking a
 * bundle down is the entire point of zod/mini). Every AST analyzer needs to
 * recognize both, so the binding resolution lives here.
 */
export class ZodMiniBindings {
  private static cache = new WeakMap<SourceFile, ZodMiniBindings>();

  private constructor(
    /** Identifiers bound to the zod/mini namespace (e.g. `z`). */
    private readonly namespaceAliases: Set<string>,
    /** Local identifier -> zod/mini export name for named imports. */
    private readonly namedImports: Map<string, string>,
    /**
     * The zod/mini module specifier(s) this file actually imports from, in
     * import-declaration order. Empty when nothing was found (falls back to
     * "zod/mini" for injected code).
     */
    private readonly moduleSpecifiers: string[],
  ) {}

  /**
   * Resolves (and caches) the zod/mini bindings of a source file.
   */
  static from(sourceFile: SourceFile): ZodMiniBindings {
    const cached = ZodMiniBindings.cache.get(sourceFile);
    if (cached) return cached;

    const namespaceAliases = new Set<string>();
    const namedImports = new Map<string, string>();
    const moduleSpecifiers: string[] = [];

    for (const importDecl of sourceFile.getImportDeclarations()) {
      const moduleSpecifier = importDecl.getModuleSpecifierValue();
      if (!ZOD_MINI_MODULES.has(moduleSpecifier)) continue;
      moduleSpecifiers.push(moduleSpecifier);

      const namespaceImport = importDecl.getNamespaceImport();
      if (namespaceImport) {
        namespaceAliases.add(namespaceImport.getText());
      }

      // `import z from "zod/mini"` also exposes the whole namespace under esModuleInterop.
      const defaultImport = importDecl.getDefaultImport();
      if (defaultImport) {
        namespaceAliases.add(defaultImport.getText());
      }

      for (const namedImport of importDecl.getNamedImports()) {
        const exportName = namedImport.getName();
        const localName = namedImport.getAliasNode()?.getText() ?? exportName;
        namedImports.set(localName, exportName);
      }
    }

    if (namespaceAliases.size === 0 && namedImports.size === 0) {
      for (const alias of DEFAULT_NAMESPACE_ALIASES) {
        namespaceAliases.add(alias);
      }
    }

    const bindings = new ZodMiniBindings(namespaceAliases, namedImports, moduleSpecifiers);
    ZodMiniBindings.cache.set(sourceFile, bindings);
    return bindings;
  }

  /**
   * Checks whether an identifier refers to the zod/mini namespace.
   */
  isNamespace(identifier: string): boolean {
    return this.namespaceAliases.has(identifier);
  }

  /**
   * The module specifier this file imports zod/mini from (e.g. `"zod/mini"`),
   * defaulting to `"zod/mini"` when the file has no visible import of its own.
   */
  moduleSpecifier(): string {
    return this.moduleSpecifiers[0] ?? "zod/mini";
  }

  /**
   * A namespace alias already in scope in this file (e.g. `z` from
   * `import * as z from "zod/mini"`), if any. Undefined when the file only
   * uses named imports - callers needing `input`/`output` type utilities must
   * inject their own import in that case instead of assuming an identifier.
   */
  existingNamespaceAlias(): string | undefined {
    return [...this.namespaceAliases][0];
  }

  /**
   * Returns the zod/mini export name a call expression invokes.
   *
   * Handles both `z.object(...)` (namespace) and `object(...)` (named import).
   * Returns undefined when the callee is not a zod/mini export.
   */
  getCallName(node: Node): string | undefined {
    if (!Node.isCallExpression(node)) return undefined;

    const callee = node.getExpression();

    if (Node.isPropertyAccessExpression(callee)) {
      const target = callee.getExpression();
      if (Node.isIdentifier(target) && this.isNamespace(target.getText())) {
        return callee.getName();
      }
      return undefined;
    }

    if (Node.isIdentifier(callee)) {
      return this.namedImports.get(callee.getText());
    }

    return undefined;
  }

  /**
   * Checks whether a node is a call to one of the given zod/mini exports.
   */
  isCallTo(node: Node, names: ReadonlySet<string> | string): boolean {
    const callName = this.getCallName(node);
    if (!callName) return false;
    return typeof names === "string" ? callName === names : names.has(callName);
  }

  /**
   * Rewrites zod/mini type references in a printed type to their bare names.
   *
   * TypeScript qualifies them by however the analyzed file reaches zod/mini -
   * `z.core.$brand<"UserId">` with a namespace import, `import("zod/mini").../
   * $brand<"UserId">` without one. `normalizeBrandQualifiers` (shared with
   * zinfer) already reduces both `$brand<...>` and `BRAND<...>` down to the
   * bare `BRAND<...>` form the generated file's own `import type { BRAND }
   * from "zod"` matches, so this only needs to handle the qualifier prefix.
   */
  canonicalizeTypeNames(typeText: string): string {
    if (!typeText.includes(".")) return typeText;

    this.canonicalizePattern ??= this.buildCanonicalizePattern();
    return typeText.replace(this.canonicalizePattern, "$1");
  }

  private canonicalizePattern: RegExp | undefined;

  private buildCanonicalizePattern(): RegExp {
    const qualifiers = [
      String.raw`import\("[^"]*zod[^"]*"\)(?:\.core)?`,
      ...[...this.namespaceAliases].map((alias) => `${escapeRegExp(alias)}(?:\\.core)?`),
    ];
    return new RegExp(`(?:${qualifiers.join("|")})\\.(\\$brand|BRAND)\\b`, "g");
  }
}

/**
 * zod/mini exports that produce a schema, keyed by the name visible on the
 * public `z` namespace (i.e. after the classic-name aliasing zod/mini applies
 * to reserved words: `_undefined` -> `undefined`, `_lazy` -> `lazy`, etc.).
 * `_default` is the one export zod/mini leaves un-aliased (`default` can't be
 * used as an identifier there), so it stays `z._default(...)`.
 */
export const ZOD_MINI_SCHEMA_BUILDERS: ReadonlySet<string> = new Set([
  // Primitives and string formats
  "string",
  "email",
  "guid",
  "uuid",
  "uuidv4",
  "uuidv6",
  "uuidv7",
  "url",
  "httpUrl",
  "emoji",
  "nanoid",
  "cuid",
  "cuid2",
  "ulid",
  "xid",
  "ksuid",
  "ipv4",
  "ipv6",
  "cidrv4",
  "cidrv6",
  "mac",
  "base64",
  "base64url",
  "e164",
  "jwt",
  "stringFormat",
  "hostname",
  "hex",
  "hash",
  "number",
  "int",
  "float32",
  "float64",
  "int32",
  "uint32",
  "boolean",
  "bigint",
  "int64",
  "uint64",
  "symbol",
  "undefined",
  "null",
  "any",
  "unknown",
  "never",
  "void",
  "date",
  "nan",
  "literal",
  "enum",
  "nativeEnum",
  "file",
  "templateLiteral",
  // Complex
  "array",
  "object",
  "strictObject",
  "looseObject",
  "tuple",
  "record",
  "partialRecord",
  "looseRecord",
  "map",
  "set",
  "union",
  "xor",
  "discriminatedUnion",
  "intersection",
  // Object operations (schema is the first argument, not a method receiver)
  "extend",
  "safeExtend",
  "merge",
  "pick",
  "omit",
  "partial",
  "required",
  "catchall",
  "keyof",
  // Wrappers
  "optional",
  "exactOptional",
  "nullable",
  "nullish",
  "nonoptional",
  "success",
  "readonly",
  "promise",
  // Value-attaching
  "_default",
  "prefault",
  "catch",
  // Recursive
  "lazy",
  // Custom (schema-producing; `check`/`refine`/`superRefine` are excluded on
  // purpose - they return a `$ZodCheck`, meant to be passed into a schema's
  // `.check(...)` method, not a schema themselves)
  "custom",
  // Composition
  "pipe",
  "codec",
  "invertCodec",
  "stringbool",
]);

/**
 * Wrapper schemas that keep the wrapped schema's shape, only widening it with
 * `undefined` / `null` (or marking it readonly). A reference wrapped in one of
 * these still points at the same named schema.
 */
export const ZOD_MINI_OPTIONAL_WRAPPERS: ReadonlySet<string> = new Set([
  "optional",
  "exactOptional",
  "nullable",
  "nullish",
  "readonly",
]);

/**
 * Wrapper schemas that mark the wrapped key optional on an object (the key
 * may be omitted entirely), as opposed to merely widening the value's type.
 */
export const ZOD_MINI_OPTIONAL_KEY_WRAPPERS: ReadonlySet<string> = new Set([
  "optional",
  "exactOptional",
  "nullish",
]);

/**
 * Wrapper schemas that add `null` to the wrapped value's type.
 */
export const ZOD_MINI_NULLABLE_WRAPPERS: ReadonlySet<string> = new Set(["nullable", "nullish"]);

/**
 * `z.object(...)` family builders whose first argument is the shape object
 * literal.
 */
export const ZOD_MINI_OBJECT_BUILDERS: ReadonlySet<string> = new Set([
  "object",
  "strictObject",
  "looseObject",
]);

/**
 * `z.array(...)` builders (element schema is the first/only argument).
 */
export const ZOD_MINI_ARRAY_BUILDERS: ReadonlySet<string> = new Set(["array"]);

/**
 * `z.record(key, value)` builders (value schema is the second argument).
 */
export const ZOD_MINI_RECORD_BUILDERS: ReadonlySet<string> = new Set([
  "record",
  "partialRecord",
  "looseRecord",
]);

/**
 * `z.union([...])` builders.
 */
export const ZOD_MINI_UNION_BUILDERS: ReadonlySet<string> = new Set(["union", "xor"]);

/**
 * `z.discriminatedUnion(key, [...])` builders.
 */
export const ZOD_MINI_DISCRIMINATED_UNION_BUILDERS: ReadonlySet<string> = new Set([
  "discriminatedUnion",
]);
