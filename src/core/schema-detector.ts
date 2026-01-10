import { SourceFile, VariableDeclaration } from "ts-morph";
import type { DetectedSchema } from "./types.js";

/**
 * Detects Zod schemas in TypeScript source files.
 */
export class SchemaDetector {
  /**
   * Detects all Zod schemas in a source file.
   *
   * @param sourceFile - The ts-morph SourceFile to analyze
   * @returns Array of detected schema information (including non-exported schemas)
   */
  detectExportedSchemas(sourceFile: SourceFile): DetectedSchema[] {
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

    const initText = initializer.getText();

    // Check if it starts with z. followed by a known Zod schema builder
    if (initText.startsWith("z.")) {
      // Extract the method name after "z."
      const afterZ = initText.substring(2);
      // Find where the method name ends (at '(' or '.')
      const endIdx = Math.min(
        afterZ.indexOf("(") !== -1 ? afterZ.indexOf("(") : afterZ.length,
        afterZ.indexOf(".") !== -1 ? afterZ.indexOf(".") : afterZ.length,
      );
      const methodName = afterZ.substring(0, endIdx);

      if (SchemaDetector.ZOD_SCHEMA_BUILDERS.has(methodName)) {
        return true;
      }
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
    ];

    for (const method of zodMethods) {
      if (initText.includes(method)) {
        return true;
      }
    }

    // Check for z.lazy() pattern (recursive schemas)
    if (initText.includes("z.lazy(")) {
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
      const prevChar = typeText[endIdx - 1];

      // Track string literals
      if ((char === '"' || char === "'" || char === "`") && prevChar !== "\\") {
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
