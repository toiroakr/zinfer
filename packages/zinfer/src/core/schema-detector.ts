import { SourceFile, VariableDeclaration } from "ts-morph";
import { isEscaped } from "./string-scan.js";
import type { DetectedSchema } from "./types.js";

/**
 * Zod exports that produce a schema, as written after the `z.` prefix.
 *
 * This is only a *fast path*: hitting a name here settles the question
 * without asking the type checker anything. A `z.<name>(...)` call that
 * misses this set is not rejected - {@link isZodSchemaType} re-checks it
 * against the declaration's actual type, so a builder zinfer has never
 * heard of (a newer zod than the one it was written against) still
 * resolves rather than silently disappearing from the output.
 *
 * `tests/schema-builders.test.ts` fails when zod gains a schema builder
 * that is missing here, so the fast path stays complete as zod moves.
 * Names zod no longer exports (v3's `pipeline`/`effect`/`transformer`) are
 * kept on purpose: zinfer supports zod v3 through its peerDependencies
 * floor, and the test only asserts this set is a *superset* of the
 * installed zod's builders.
 */
export const ZOD_SCHEMA_BUILDERS: ReadonlySet<string> = new Set([
  // Primitives and basics
  "any",
  "bigint",
  "boolean",
  "date",
  "file",
  "literal",
  "nan",
  "never",
  "null",
  "number",
  "string",
  "symbol",
  "undefined",
  "unknown",
  "void",
  // String formats (each returns a string schema of its own)
  "base64",
  "base64url",
  "cidrv4",
  "cidrv6",
  "cuid",
  "cuid2",
  "e164",
  "email",
  "emoji",
  "guid",
  "hash",
  "hex",
  "hostname",
  "httpUrl",
  "ipv4",
  "ipv6",
  "jwt",
  "ksuid",
  "mac",
  "nanoid",
  "stringFormat",
  "ulid",
  "url",
  "uuid",
  "uuidv4",
  "uuidv6",
  "uuidv7",
  "xid",
  // Number formats
  "float32",
  "float64",
  "int",
  "int32",
  "int64",
  "uint32",
  "uint64",
  // Enums and template literals
  "enum",
  "nativeEnum",
  "templateLiteral",
  // Complex
  "array",
  "discriminatedUnion",
  "intersection",
  "json",
  "looseObject",
  "looseRecord",
  "map",
  "object",
  "partialRecord",
  "record",
  "set",
  "strictObject",
  "tuple",
  "union",
  "xor",
  // Object operations (the schema is an argument, not a method receiver)
  "keyof",
  // Wrappers
  "exactOptional",
  "nonoptional",
  "nullable",
  "nullish",
  "optional",
  "promise",
  "readonly",
  "success",
  // Value-attaching
  "_default",
  "catch",
  "prefault",
  // Recursive
  "lazy",
  // Custom
  "custom",
  "instanceof",
  // Composition and conversion
  "_function",
  "clone",
  "codec",
  "fromJSONSchema",
  "function",
  "invertCodec",
  "pipe",
  "preprocess",
  "stringbool",
  "transform",
  // Namespaces grouping further builders (z.iso.date(), z.coerce.string())
  "coerce",
  "iso",
  // zod v3 names with no v4 counterpart, kept for the peerDependencies floor
  "brand",
  "effect",
  "pipeline",
  "transformer",
]);

/**
 * Decides whether a declaration holds a zod schema by its resolved type
 * rather than by the name it was built with.
 *
 * This is the backstop behind {@link ZOD_SCHEMA_BUILDERS}. A name list can
 * only describe the zod that zinfer was released against, and a builder it
 * has never heard of used to be dropped *silently* - no type generated, no
 * warning, the schema simply absent from the output. Consulting the type
 * instead means a newer zod's builders keep working on an older zinfer.
 *
 * `_def` is what separates a schema from a check: every zod schema carries
 * one (v3 and v4 alike), while v4's standalone checks (`z.refine(...)`,
 * `z.minLength(...)`) carry only the `_zod` marker and are meant to be
 * handed *to* a schema rather than used as one.
 *
 * Only ever reached for a `z.<name>(...)` initializer, so an unrelated
 * package's value that happens to expose a `_def` is never pulled in.
 */
function isZodSchemaType(declaration: VariableDeclaration): boolean {
  const type = declaration.getType();
  // An unresolvable declaration (zod not installed, a recursive getter TS
  // gives up on) widens to any/unknown, where every property lookup would
  // succeed and make this answer meaningless.
  if (type.isAny() || type.isUnknown()) return false;
  return type.getProperty("_def") !== undefined;
}

/**
 * Detects Zod schemas in TypeScript source files.
 */
export class SchemaDetector {
  private cache = new Map<string, DetectedSchema[]>();

  /**
   * Detects all Zod schemas in a source file.
   *
   * @param sourceFile - The ts-morph SourceFile to analyze
   * @returns Array of detected schema information (including non-exported schemas)
   */
  detectExportedSchemas(sourceFile: SourceFile): DetectedSchema[] {
    const filePath = sourceFile.getFilePath();
    const cached = this.cache.get(filePath);
    if (cached) return cached;

    const schemas: DetectedSchema[] = [];

    // Find all variable declarations
    const variableStatements = sourceFile.getVariableStatements();

    for (const statement of variableStatements) {
      const isExported = statement.isExported();

      for (const declaration of statement.getDeclarations()) {
        if (this.isZodSchema(declaration)) {
          schemas.push({
            name: declaration.getName(),
            isExported,
            line: declaration.getStartLineNumber(),
            explicitType: this.extractExplicitType(declaration),
          });
        }
      }
    }

    // Also check for re-exports: export { X as Y }
    const exportDeclarations = sourceFile.getExportDeclarations();
    for (const exportDecl of exportDeclarations) {
      const namedExports = exportDecl.getNamedExports();
      for (const namedExport of namedExports) {
        const aliasNode = namedExport.getAliasNode();
        const exportedName = aliasNode ? aliasNode.getText() : namedExport.getName();

        // Check if the original variable is a Zod schema
        const originalName = namedExport.getName();
        const originalDecl = sourceFile.getVariableDeclaration(originalName);

        if (originalDecl && this.isZodSchema(originalDecl)) {
          // If the exported name is different from original (alias), add new entry
          if (exportedName !== originalName) {
            if (!schemas.some((s) => s.name === exportedName)) {
              schemas.push({
                name: exportedName,
                isExported: true,
                line: namedExport.getStartLineNumber(),
                localName: originalName,
              });
            }
          } else {
            // Same name re-export: update existing schema to mark as exported
            const existing = schemas.find((s) => s.name === originalName);
            if (existing) {
              existing.isExported = true;
            } else {
              schemas.push({
                name: exportedName,
                isExported: true,
                line: namedExport.getStartLineNumber(),
              });
            }
          }
        }
      }
    }

    // Return all schemas (both exported and non-exported)
    // The isExported flag is used by the type printer to control export keyword
    this.cache.set(filePath, schemas);
    return schemas;
  }

  /**
   * Checks if a variable declaration is a Zod schema.
   *
   * @param declaration - The variable declaration to check
   * @returns true if the declaration is a Zod schema
   */
  private isZodSchema(declaration: VariableDeclaration): boolean {
    // Check for explicit Zod type annotation (z.ZodType<T>, z.ZodSchema<T>, etc.)
    const typeNode = declaration.getTypeNode();
    if (typeNode) {
      const typeText = typeNode.getText();
      if (
        typeText.includes("ZodType") ||
        typeText.includes("ZodSchema") ||
        typeText.includes("ZodEffects")
      ) {
        return true;
      }
    }

    const initializer = declaration.getInitializer();
    if (!initializer) {
      return false;
    }

    const initText = initializer.getText();

    // Check if it starts with z. followed by a known Zod schema builder.
    // Whitespace is allowed around the dot: formatters break long chains
    // into multiple lines (e.g. `z\n  .union([...])\n  .describe(...)`).
    const builderMatch = initText.match(/^z\s*\.\s*([A-Za-z_$][A-Za-z0-9_$]*)/);
    if (builderMatch) {
      // Rooted at the zod namespace, so this declaration is answerable on
      // its own: a known builder name settles it without touching the type
      // checker, and an unknown one falls through to the declaration's
      // actual type. Either way the method-name scan below - which exists
      // for chains on *other* schema variables - must not see it, or a
      // top-level `z.refine(...)` (a check, not a schema) would be counted
      // as a schema just for containing ".refine(".
      return ZOD_SCHEMA_BUILDERS.has(builderMatch[1]) || isZodSchemaType(declaration);
    }

    // Check if it's a method chain on another schema variable
    // e.g., SomeSchema.pick({...}), SomeSchema.merge(...)
    const zodMethods = [
      ".pick(",
      ".omit(",
      ".partial(",
      ".required(",
      ".extend(",
      ".merge(",
      ".and(",
      ".or(",
      ".transform(",
      ".refine(",
      ".superRefine(",
      ".default(",
      ".optional(",
      ".nullable(",
      ".array(",
      ".brand(",
      ".deepPartial(",
      ".describe(",
      ".meta(",
    ];

    for (const method of zodMethods) {
      if (initText.includes(method)) {
        return true;
      }
    }

    // Check for z.lazy() pattern (recursive schemas), tolerating
    // formatter-inserted whitespace around the dot
    if (/\bz\s*\.\s*lazy\s*\(/.test(initText)) {
      return true;
    }

    return false;
  }

  /**
   * Gets all schema names from a source file.
   *
   * @param sourceFile - The ts-morph SourceFile to analyze
   * @returns Array of schema names
   */
  getSchemaNames(sourceFile: SourceFile): string[] {
    return this.detectExportedSchemas(sourceFile).map((s) => s.name);
  }

  /**
   * Extracts explicit type annotation from z.ZodType<T> or z.ZodSchema<T>.
   *
   * @param declaration - The variable declaration to check
   * @returns The explicit type string if found, undefined otherwise
   */
  private extractExplicitType(declaration: VariableDeclaration): string | undefined {
    const typeNode = declaration.getTypeNode();
    if (!typeNode) {
      return undefined;
    }

    const typeText = typeNode.getText();

    // Check if it matches Zod type patterns
    const zodTypePatterns = [
      "z.ZodType<",
      "z.ZodSchema<",
      "z.ZodEffects<",
      "ZodType<",
      "ZodSchema<",
      "ZodEffects<",
    ];

    let matchedPattern: string | undefined;
    for (const pattern of zodTypePatterns) {
      if (typeText.startsWith(pattern)) {
        matchedPattern = pattern;
        break;
      }
    }

    if (!matchedPattern) {
      return undefined;
    }

    // Extract the first type parameter using bracket counting
    const startIdx = matchedPattern.length;
    return this.extractFirstTypeParameter(typeText, startIdx);
  }

  /**
   * Extracts the first type parameter from a generic type string.
   * Handles nested brackets properly.
   *
   * @param typeText - The full type text (e.g., "ZodType<{ a: string }, ZodTypeDef>")
   * @param startIdx - The index after the opening "<"
   * @returns The first type parameter, or undefined if parsing fails
   */
  private extractFirstTypeParameter(typeText: string, startIdx: number): string | undefined {
    let depth = 1;
    let endIdx = startIdx;
    let inString = false;
    let stringChar = "";

    while (endIdx < typeText.length && depth > 0) {
      const char = typeText[endIdx];

      // Track string literals
      if ((char === '"' || char === "'" || char === "`") && !isEscaped(typeText, endIdx)) {
        if (!inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar) {
          inString = false;
          stringChar = "";
        }
      }

      if (!inString) {
        if (char === "<" || char === "{" || char === "[" || char === "(") {
          depth++;
        } else if (char === ">" || char === "}" || char === "]" || char === ")") {
          depth--;
          if (depth === 0) break;
        } else if (char === "," && depth === 1) {
          // Found the comma separating type parameters at depth 1
          break;
        }
      }
      endIdx++;
    }

    if (endIdx > startIdx) {
      return typeText.substring(startIdx, endIdx).trim();
    }

    return undefined;
  }
}
