import * as compiler from "@zinfer-monorepo/core";
import { Node, SourceFile, VariableDeclaration } from "@zinfer-monorepo/core";
import { isEscaped } from "./string-scan.js";
import type { DetectedSchema } from "./types.js";

/**
 * Detects Zod schemas in TypeScript source files.
 */
export class SchemaDetector {
  constructor(private readonly compilerContext?: compiler.NativeProject) {}

  private cache = new Map<string, DetectedSchema[]>();

  /**
   * Detects all Zod schemas in a source file.
   *
   * @param sourceFile - The native TypeScript SourceFile to analyze
   * @returns Array of detected schema information (including non-exported schemas)
   */
  detectExportedSchemas(sourceFile: SourceFile): DetectedSchema[] {
    if (this.compilerContext) compiler.registerCompilerContext(sourceFile, this.compilerContext);
    return compiler.runInCompilerSession(sourceFile, () => this.detectSchemas(sourceFile));
  }

  private detectSchemas(sourceFile: SourceFile): DetectedSchema[] {
    const filePath = compiler.getFilePath(sourceFile);
    const cached = this.cache.get(filePath);
    if (cached) return cached;

    const schemas: DetectedSchema[] = [];

    // Find all variable declarations
    const variableStatements = compiler.getVariableStatements(sourceFile);

    for (const statement of variableStatements) {
      const isExported = compiler.isExported(statement);

      for (const declaration of compiler.getDeclarations(statement)) {
        if (this.isZodSchema(declaration)) {
          schemas.push({
            name: compiler.getName(declaration),
            isExported,
            line: compiler.getStartLineNumber(declaration),
            explicitType: this.extractExplicitType(declaration),
          });
        }
      }
    }

    // Also check for re-exports: export { X as Y }
    const exportDeclarations = compiler.getExportDeclarations(sourceFile);
    for (const exportDecl of exportDeclarations) {
      const namedExports = compiler.getNamedExports(exportDecl);
      for (const namedExport of namedExports) {
        const aliasNode = compiler.getAliasNode(namedExport);
        const exportedName = aliasNode ? aliasNode.getText() : compiler.getName(namedExport);

        // Check if the original variable is a Zod schema
        const originalName = compiler.getName(namedExport);
        const originalDecl = compiler.getVariableDeclaration(sourceFile, originalName);

        if (originalDecl && this.isZodSchema(originalDecl)) {
          // If the exported name is different from original (alias), add new entry
          if (exportedName !== originalName) {
            if (!schemas.some((s) => s.name === exportedName)) {
              schemas.push({
                name: exportedName,
                isExported: true,
                line: compiler.getStartLineNumber(namedExport),
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
                line: compiler.getStartLineNumber(namedExport),
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
   * Known Zod schema builder functions that follow the z. prefix.
   */
  private static readonly ZOD_SCHEMA_BUILDERS = new Set([
    "object",
    "string",
    "number",
    "boolean",
    "array",
    "tuple",
    "record",
    "map",
    "set",
    "union",
    "intersection",
    "literal",
    "enum",
    "nativeEnum",
    "nullable",
    "optional",
    "any",
    "unknown",
    "never",
    "void",
    "null",
    "undefined",
    "bigint",
    "date",
    "symbol",
    "function",
    "lazy",
    "promise",
    "instanceof",
    "discriminatedUnion",
    "preprocess",
    "pipeline",
    "custom",
    "coerce",
    "transformer",
    "effect",
    "brand",
    "strictObject",
    "looseObject",
    // Zod 4 schema constructors and schema-returning utilities.
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
    "creditCard",
    "iban",
    "currencyCode",
    "jwt",
    "stringFormat",
    "hostname",
    "hex",
    "hash",
    "int",
    "float32",
    "float64",
    "int32",
    "uint32",
    "int64",
    "uint64",
    "nan",
    "file",
    "templateLiteral",
    "partialRecord",
    "looseRecord",
    "xor",
    "keyof",
    "exactOptional",
    "nullish",
    "nonoptional",
    "success",
    "readonly",
    "_default",
    "prefault",
    "catch",
    "transform",
    "pipe",
    "codec",
    "invertCodec",
    "stringbool",
    "json",
    "deepPartial",
    "input",
    "output",
    "clone",
    "compile",
    "withParser",
    "getDiscriminatedOption",
    "fromJSONSchema",
  ]);

  private static readonly ZOD_VALUE_METHODS = new Set([
    "parse",
    "parseAsync",
    "safeParse",
    "safeParseAsync",
    "spa",
    "decode",
    "decodeAsync",
    "safeDecode",
    "safeDecodeAsync",
    "encode",
    "encodeAsync",
    "safeEncode",
    "safeEncodeAsync",
    "validate",
    "validateAsync",
  ]);

  /**
   * Checks if a variable declaration is a Zod schema.
   *
   * @param declaration - The variable declaration to check
   * @returns true if the declaration is a Zod schema
   */
  private isZodSchema(declaration: VariableDeclaration): boolean {
    // Check for explicit Zod type annotation (z.ZodType<T>, z.ZodSchema<T>, etc.)
    const typeNode = declaration.type;
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

    const initializer = declaration.initializer;
    if (!initializer) {
      return false;
    }

    if (Node.isCallExpression(initializer)) {
      const callee = initializer.expression;
      // toZod<T>() is a factory; only its second call returns a schema.
      if (Node.isCallExpression(callee) && /^z\s*\.\s*toZod$/.test(callee.expression.getText())) {
        return true;
      }
      if (Node.isPropertyAccessExpression(callee) || Node.isElementAccessExpression(callee)) {
        const member = Node.isPropertyAccessExpression(callee)
          ? callee.name
          : callee.argumentExpression;
        const method = Node.isStringLiteral(member)
          ? compiler.getLiteralValue(member)
          : member?.getText();
        // Parsed data can itself have every field of a schema, so check the operation first.
        if (
          method &&
          SchemaDetector.ZOD_VALUE_METHODS.has(method) &&
          this.hasSchemaType(callee.expression)
        ) {
          return false;
        }
        // A builder prefix does not imply that the final method returns a schema.
        if (Node.isCallExpression(callee.expression)) {
          return this.hasSchemaType(initializer);
        }
      }
    }

    const initText = initializer.getText();

    // Check if it starts with z. followed by a known Zod schema builder.
    // Whitespace is allowed around the dot: formatters break long chains
    // into multiple lines (e.g. `z\n  .union([...])\n  .describe(...)`).
    const builderMatch = initText.match(/^z\s*\.\s*([A-Za-z_$][A-Za-z0-9_$]*)/);
    if (builderMatch && SchemaDetector.ZOD_SCHEMA_BUILDERS.has(builderMatch[1])) {
      return true;
    }

    if (/^z\s*\.\s*iso\s*\.\s*(datetime|date|time|duration)\s*\(/.test(initText)) {
      return true;
    }

    // Check for z.lazy() pattern (recursive schemas), tolerating
    // formatter-inserted whitespace around the dot
    if (/\bz\s*\.\s*lazy\s*\(/.test(initText)) {
      return true;
    }

    // Detect method chains by their result type.
    // Unrelated APIs with the same method names must not become schemas.
    return this.hasSchemaType(initializer);
  }

  private hasSchemaType(expression: Node): boolean {
    const type = compiler.typeOf(expression);
    return (
      type.getProperty("_input") !== undefined &&
      (type.getProperty("_zod") !== undefined || type.getProperty("_def") !== undefined)
    );
  }

  /**
   * Gets all schema names from a source file.
   *
   * @param sourceFile - The native TypeScript SourceFile to analyze
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
    const typeNode = declaration.type;
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
