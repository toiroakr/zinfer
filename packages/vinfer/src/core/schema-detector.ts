import { SourceFile, VariableDeclaration } from "ts-morph";
import { ValibotBindings, VALIBOT_SCHEMA_PRODUCERS } from "./valibot-bindings.js";
import { unwrapExpression } from "./schema-expression.js";
import { isEscaped } from "./string-scan.js";
import type { DetectedSchema } from "./types.js";

/**
 * Type annotations that mark a variable as a Valibot schema, and whose first
 * type argument is the schema's declared type (used for recursive schemas).
 */
const SCHEMA_TYPE_ANNOTATIONS = [
  "GenericSchema",
  "GenericSchemaAsync",
  "BaseSchema",
  "BaseSchemaAsync",
];

/**
 * Matches a Valibot schema type annotation, optionally namespace-qualified
 * (`v.GenericSchema<Category>`), up to and including the opening "<".
 */
const SCHEMA_TYPE_ANNOTATION_PATTERN = new RegExp(
  `(?:^|\\.)(?:${SCHEMA_TYPE_ANNOTATIONS.join("|")})\\s*<`,
);

/**
 * Decides whether a declaration holds a Valibot schema by its resolved type
 * rather than by the name it was built with.
 *
 * This is the backstop behind {@link VALIBOT_SCHEMA_PRODUCERS}. A name list
 * can only describe the valibot that vinfer was released against, and a
 * builder it has never heard of would otherwise be dropped *silently* - no
 * type generated, no warning, the schema simply absent from the output.
 * Consulting the type instead means a newer valibot's builders keep working
 * on an older vinfer.
 *
 * Valibot tags its own values, so the check is exact rather than heuristic:
 * schemas are `kind: "schema"`, while the actions meant to be passed into
 * `v.pipe()` are `"validation"`, `"transformation"` or `"metadata"`.
 *
 * Only ever reached for a call that already resolves to a valibot export,
 * so an unrelated package's similarly tagged value is never pulled in.
 */
function isValibotSchemaType(declaration: VariableDeclaration): boolean {
  const type = declaration.getType();
  // An unresolvable declaration (valibot not installed, a recursive getter
  // TS gives up on) widens to any/unknown, where every property lookup
  // would succeed and make this answer meaningless.
  if (type.isAny() || type.isUnknown()) return false;
  const kind = type.getProperty("kind")?.getTypeAtLocation(declaration);
  return kind?.getText() === '"schema"';
}

/**
 * Detects Valibot schemas in TypeScript source files.
 */
export class SchemaDetector {
  private cache = new Map<string, DetectedSchema[]>();

  /**
   * Detects all Valibot schemas in a source file.
   *
   * @param sourceFile - The ts-morph SourceFile to analyze
   * @returns Array of detected schema information (including non-exported schemas)
   */
  detectExportedSchemas(sourceFile: SourceFile): DetectedSchema[] {
    const filePath = sourceFile.getFilePath();
    const cached = this.cache.get(filePath);
    if (cached) return cached;

    const schemas: DetectedSchema[] = [];
    const bindings = ValibotBindings.from(sourceFile);

    // Find all variable declarations
    const variableStatements = sourceFile.getVariableStatements();

    for (const statement of variableStatements) {
      const isExported = statement.isExported();

      for (const declaration of statement.getDeclarations()) {
        if (this.isValibotSchema(declaration, bindings)) {
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

        // Check if the original variable is a Valibot schema
        const originalName = namedExport.getName();
        const originalDecl = sourceFile.getVariableDeclaration(originalName);

        if (originalDecl && this.isValibotSchema(originalDecl, bindings)) {
          // If the exported name is different from original (alias), add new entry
          if (exportedName !== originalName) {
            if (!schemas.some((s) => s.name === exportedName)) {
              schemas.push({
                name: exportedName,
                localName: originalName,
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
    this.cache.set(filePath, schemas);
    return schemas;
  }

  /**
   * Checks if a variable declaration is a Valibot schema.
   *
   * @param declaration - The variable declaration to check
   * @param bindings - How the analyzed file refers to Valibot's exports
   * @returns true if the declaration is a Valibot schema
   */
  private isValibotSchema(declaration: VariableDeclaration, bindings: ValibotBindings): boolean {
    // Explicit Valibot schema annotation (v.GenericSchema<T>, BaseSchema<...>, ...)
    const typeNode = declaration.getTypeNode();
    if (typeNode && SCHEMA_TYPE_ANNOTATION_PATTERN.test(typeNode.getText())) {
      return true;
    }

    const initializer = declaration.getInitializer();
    if (!initializer) {
      return false;
    }

    // Valibot builds every schema through a function call, so one call-name
    // lookup covers both the `v.object({...})` and `object({...})` styles -
    // no source-text matching needed.
    const callName = bindings.getCallName(unwrapExpression(initializer));
    if (callName === undefined) return false;
    // A call that resolves to a valibot export, so this declaration is
    // answerable on its own: a known builder name settles it without
    // touching the type checker, and an unknown one falls through to the
    // declaration's actual type rather than being dropped.
    return VALIBOT_SCHEMA_PRODUCERS.has(callName) || isValibotSchemaType(declaration);
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
   * Extracts the explicit type annotation from `v.GenericSchema<T>` and friends.
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
    const match = SCHEMA_TYPE_ANNOTATION_PATTERN.exec(typeText);
    if (!match) {
      return undefined;
    }

    // Extract the first type parameter using bracket counting
    const startIdx = match.index + match[0].length;
    return this.extractFirstTypeParameter(typeText, startIdx);
  }

  /**
   * Extracts the first type parameter from a generic type string.
   * Handles nested brackets properly.
   *
   * @param typeText - The full type text (e.g., "GenericSchema<{ a: string }, unknown>")
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
