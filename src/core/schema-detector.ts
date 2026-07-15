import { ModifierFlags, SyntaxKind } from "@typescript/native-preview/unstable/ast";
import type {
  ExportDeclaration,
  SourceFile,
  VariableDeclaration,
  VariableStatement,
} from "@typescript/native-preview/unstable/ast";
import type { DetectedSchema } from "./types.js";

/**
 * SchemaDetector, implemented against the tsgo/Corsa `ast` API instead of
 * ts-morph. Purely syntactic (never touches the checker), so it operates
 * directly on a Corsa `SourceFile` node tree. See issue #200.
 */
export class SchemaDetector {
  /**
   * Detects all Zod schemas in a source file.
   *
   * @param sourceFile - The tsgo SourceFile to analyze
   * @returns Array of detected schema information (including non-exported schemas)
   */
  detectExportedSchemas(sourceFile: SourceFile): DetectedSchema[] {
    const schemas: DetectedSchema[] = [];

    for (const statement of sourceFile.statements) {
      if (statement.kind !== SyntaxKind.VariableStatement) continue;
      const variableStatement = statement as VariableStatement;
      const isExported = (variableStatement.modifierFlags & ModifierFlags.Export) !== 0;

      for (const declaration of variableStatement.declarationList.declarations) {
        if (this.isZodSchema(declaration, sourceFile)) {
          schemas.push({
            name: declaration.name.getText(sourceFile),
            isExported,
            line: this.getStartLine(declaration, sourceFile),
            explicitType: this.extractExplicitType(declaration, sourceFile),
          });
        }
      }
    }

    // Also check for re-exports: export { X as Y }
    for (const statement of sourceFile.statements) {
      if (statement.kind !== SyntaxKind.ExportDeclaration) continue;
      const exportDecl = statement as ExportDeclaration;
      if (!exportDecl.exportClause || exportDecl.exportClause.kind !== SyntaxKind.NamedExports)
        continue;

      for (const namedExport of exportDecl.exportClause.elements) {
        const exportedName = namedExport.name.getText(sourceFile);
        const originalName = namedExport.propertyName
          ? namedExport.propertyName.getText(sourceFile)
          : exportedName;

        const originalDecl = this.findVariableDeclaration(sourceFile, originalName);

        if (originalDecl && this.isZodSchema(originalDecl, sourceFile)) {
          if (exportedName !== originalName) {
            if (!schemas.some((s) => s.name === exportedName)) {
              schemas.push({
                name: exportedName,
                isExported: true,
                line: this.getStartLine(namedExport, sourceFile),
              });
            }
          } else {
            const existing = schemas.find((s) => s.name === originalName);
            if (existing) {
              existing.isExported = true;
            } else {
              schemas.push({
                name: exportedName,
                isExported: true,
                line: this.getStartLine(namedExport, sourceFile),
              });
            }
          }
        }
      }
    }

    return schemas;
  }

  /**
   * Gets all schema names from a source file.
   */
  getSchemaNames(sourceFile: SourceFile): string[] {
    return this.detectExportedSchemas(sourceFile).map((s) => s.name);
  }

  private getStartLine(
    node: { getStart(sourceFile?: SourceFile): number },
    sourceFile: SourceFile,
  ): number {
    return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
  }

  private findVariableDeclaration(
    sourceFile: SourceFile,
    name: string,
  ): VariableDeclaration | undefined {
    for (const statement of sourceFile.statements) {
      if (statement.kind !== SyntaxKind.VariableStatement) continue;
      for (const declaration of (statement as VariableStatement).declarationList.declarations) {
        if (
          declaration.name.kind === SyntaxKind.Identifier &&
          declaration.name.getText(sourceFile) === name
        ) {
          return declaration;
        }
      }
    }
    return undefined;
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

  private isZodSchema(declaration: VariableDeclaration, sourceFile: SourceFile): boolean {
    const typeNode = declaration.type;
    if (typeNode) {
      const typeText = typeNode.getText(sourceFile);
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

    const initText = initializer.getText(sourceFile);

    const builderMatch = initText.match(/^z\s*\.\s*([A-Za-z_$][A-Za-z0-9_$]*)/);
    if (builderMatch && SchemaDetector.ZOD_SCHEMA_BUILDERS.has(builderMatch[1])) {
      return true;
    }

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

    if (/\bz\s*\.\s*lazy\s*\(/.test(initText)) {
      return true;
    }

    return false;
  }

  private extractExplicitType(
    declaration: VariableDeclaration,
    sourceFile: SourceFile,
  ): string | undefined {
    const typeNode = declaration.type;
    if (!typeNode) {
      return undefined;
    }

    const typeText = typeNode.getText(sourceFile);

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

    const startIdx = matchedPattern.length;
    return this.extractFirstTypeParameter(typeText, startIdx);
  }

  private extractFirstTypeParameter(typeText: string, startIdx: number): string | undefined {
    let depth = 1;
    let endIdx = startIdx;
    let inString = false;
    let stringChar = "";

    while (endIdx < typeText.length && depth > 0) {
      const char = typeText[endIdx];
      const prevChar = typeText[endIdx - 1];

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
