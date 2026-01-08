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

    // Check if it starts with z. (common Zod pattern)
    if (initText.startsWith("z.")) {
      return true;
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

    // Match patterns like z.ZodType<T>, z.ZodSchema<T>, ZodType<T>, ZodSchema<T>
    const zodTypePattern = /^(?:z\.)?(?:ZodType|ZodSchema|ZodEffects)<\s*(.+?)(?:\s*,\s*.+)?\s*>$/;
    const match = typeText.match(zodTypePattern);

    if (match) {
      return match[1].trim();
    }

    return undefined;
  }
}
