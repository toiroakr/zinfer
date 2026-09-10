import { Node, SourceFile, VariableDeclaration } from "ts-morph";
import { isEscaped } from "./string-scan.js";
import type { DetectedSchema } from "./types.js";

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
    "properties",
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

    if (Node.isCallExpression(initializer)) {
      const callee = initializer.getExpression();
      // toZod<T>() is a factory; only its second call returns a schema.
      if (
        Node.isCallExpression(callee) &&
        /^z\s*\.\s*toZod$/.test(callee.getExpression().getText())
      ) {
        return true;
      }
      if (Node.isPropertyAccessExpression(callee) || Node.isElementAccessExpression(callee)) {
        const member = Node.isPropertyAccessExpression(callee)
          ? callee.getNameNode()
          : callee.getArgumentExpression();
        const method = Node.isStringLiteral(member) ? member.getLiteralValue() : member?.getText();
        // Parsed data can itself have every field of a schema, so check the operation first.
        if (
          method &&
          SchemaDetector.ZOD_VALUE_METHODS.has(method) &&
          this.hasSchemaType(callee.getExpression())
        ) {
          return false;
        }
        // A builder prefix does not imply that the final method returns a schema.
        if (Node.isCallExpression(callee.getExpression())) {
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

    // Detect method chains by their result type, including Zod 3 schemas.
    // Unrelated APIs with the same method names must not become schemas.
    return this.hasSchemaType(initializer);
  }

  private hasSchemaType(expression: Node): boolean {
    const type = expression.getType();
    return (
      type.getProperty("_input") !== undefined &&
      (type.getProperty("_zod") !== undefined || type.getProperty("_def") !== undefined)
    );
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
