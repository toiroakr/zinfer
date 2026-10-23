import * as compiler from "@zinfer-monorepo/core";
import { Node, SourceFile, VariableDeclaration } from "@zinfer-monorepo/core";
import { ZodMiniBindings, ZOD_MINI_SCHEMA_BUILDERS } from "./zod-mini-bindings.js";
import { unwrapExpression } from "./schema-expression.js";
import { isEscaped } from "./string-scan.js";
import type { DetectedSchema } from "./types.js";

/**
 * Type annotations that mark a variable as a zod/mini schema, and whose first
 * type argument is the schema's declared output type (used for recursive
 * schemas, mirroring classic zinfer's `z.ZodType<T>` support).
 */
const SCHEMA_TYPE_ANNOTATIONS = ["ZodMiniType"];

/**
 * Matches a zod/mini schema type annotation, optionally namespace-qualified
 * (`z.ZodMiniType<Category>`), up to and including the opening "<".
 */
const SCHEMA_TYPE_ANNOTATION_PATTERN = new RegExp(
  `(?:^|\\.)(?:${SCHEMA_TYPE_ANNOTATIONS.join("|")})\\s*<`,
);

/**
 * Detects zod/mini schemas in TypeScript source files.
 */
export class SchemaDetector {
  constructor(private readonly compilerContext?: compiler.NativeProject) {}

  private cache = new Map<string, DetectedSchema[]>();

  /**
   * Detects all zod/mini schemas in a source file.
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
    const bindings = ZodMiniBindings.from(sourceFile);

    // Find all variable declarations
    const variableStatements = compiler.getVariableStatements(sourceFile);

    for (const statement of variableStatements) {
      const isExported = compiler.isExported(statement);

      for (const declaration of compiler.getDeclarations(statement)) {
        if (this.isZodMiniSchema(declaration, bindings)) {
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

        // Check if the original variable is a zod/mini schema
        const originalName = compiler.getName(namedExport);
        const originalDecl = compiler.getVariableDeclaration(sourceFile, originalName);

        if (originalDecl && this.isZodMiniSchema(originalDecl, bindings)) {
          // If the exported name is different from original (alias), add new entry
          if (exportedName !== originalName) {
            if (!schemas.some((s) => s.name === exportedName)) {
              schemas.push({
                name: exportedName,
                localName: originalName,
                isExported: true,
                line: compiler.getStartLineNumber(namedExport),
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
   * Checks if a variable declaration is a zod/mini schema.
   *
   * @param declaration - The variable declaration to check
   * @param bindings - How the analyzed file refers to zod/mini's exports
   * @returns true if the declaration is a zod/mini schema
   */
  private isZodMiniSchema(
    declaration: VariableDeclaration,
    bindings: ZodMiniBindings,
    visitedDeclarations?: Set<string>,
  ): boolean {
    // Explicit zod/mini schema annotation (z.ZodMiniType<T>)
    const typeNode = declaration.type;
    if (typeNode && this.isZodMiniTypeAnnotation(typeNode, bindings)) {
      return true;
    }

    const initializer = declaration.initializer;
    if (!initializer) {
      return false;
    }

    // Almost every zod/mini schema is built through a top-level call - one
    // call-name lookup covers both the `z.object({...})` and `object({...})`
    // styles, no source-text matching needed.
    const unwrapped = unwrapExpression(initializer);
    const callName = bindings.getCallName(unwrapped);
    if (callName !== undefined && ZOD_MINI_SCHEMA_BUILDERS.has(callName)) {
      if (callName === "toZod") {
        return Node.isCallExpression(unwrapped) && Node.isCallExpression(unwrapped.expression);
      }
      if (callName === "properties") {
        // Schemas expose `.parse()`; the $ZodCheckProperties check (Zod Mini
        // 4.6.3+) does not.
        return compiler.typeOf(unwrapped).getProperty("parse") !== undefined;
      }
      return true;
    }

    if (Node.isCallExpression(unwrapped)) {
      const callee = unwrapped.expression;
      if (Node.isPropertyAccessExpression(callee) && compiler.getName(callee) === "apply") {
        const type = compiler.typeOf(unwrapped);
        // Mini functions also expose _input; optional() belongs only to classic schemas.
        return type.getProperty("_zod") !== undefined && type.getProperty("optional") === undefined;
      }
    }

    // zod/mini keeps a handful of real chain methods on schema instances
    // (`.check()`, `.with()`, `.clone()`, `.register()`, `.brand()`) rather
    // than top-level functions - all of them return either `this` or a
    // schema derived from it (`.brand()`).
    return this.endsInSchemaMethodCall(unwrapped, bindings, visitedDeclarations);
  }

  /**
   * Checks whether a type annotation is zod/mini's `ZodMiniType<T>`, resolved
   * through this file's actual zod/mini bindings rather than by text alone -
   * a same-named `ZodMiniType` imported from an unrelated package (e.g.
   * `import type { ZodMiniType } from "other-package"`) must not be mistaken
   * for zod/mini's own type.
   */
  private isZodMiniTypeAnnotation(typeNode: Node, bindings: ZodMiniBindings): boolean {
    if (!Node.isTypeReference(typeNode)) return false;
    const typeName = typeNode.typeName;

    if (Node.isQualifiedName(typeName)) {
      const left = typeName.left;
      return (
        Node.isIdentifier(left) &&
        bindings.isNamespace(left.getText()) &&
        SCHEMA_TYPE_ANNOTATIONS.includes(typeName.right.getText())
      );
    }

    if (Node.isIdentifier(typeName)) {
      const exportName = bindings.namedImportExport(typeName.getText());
      return exportName !== undefined && SCHEMA_TYPE_ANNOTATIONS.includes(exportName);
    }

    return false;
  }

  /**
   * zod/mini's `ZodMiniType` methods that return a schema (`this`, or - for
   * `.brand()` - a branded variant of it), as opposed to `.parse()`/
   * `.safeParse()`/etc., which don't.
   */
  private static readonly SCHEMA_RETURNING_METHODS = new Set([
    "check",
    "with",
    "clone",
    "register",
    "brand",
    "input",
    "output",
  ]);

  /**
   * Checks whether an expression ends in a call to one of
   * `SCHEMA_RETURNING_METHODS` on a receiver that itself looks like a zod/mini
   * schema, tolerating formatter-inserted whitespace/newlines around the dot.
   *
   * The method name alone isn't enough: `check`/`with`/`clone`/`register` are
   * common enough names (e.g. `registry.clone()`) that accepting any receiver
   * would misdetect unrelated variables as schemas. The receiver is peeled
   * the same way one call at a time - through more of the same chain methods,
   * down to either a zod/mini builder call (`z.string()`) or another
   * already-declared schema variable in this file.
   */
  private endsInSchemaMethodCall(
    node: Node,
    bindings: ZodMiniBindings,
    visitedDeclarations: Set<string> = new Set(),
  ): boolean {
    if (!Node.isCallExpression(node)) return false;
    const callee = node.expression;
    if (
      !Node.isPropertyAccessExpression(callee) ||
      !SchemaDetector.SCHEMA_RETURNING_METHODS.has(compiler.getName(callee))
    ) {
      return false;
    }

    const receiver = unwrapExpression(callee.expression);

    if (Node.isCallExpression(receiver)) {
      const callName = bindings.getCallName(receiver);
      if (callName !== undefined && ZOD_MINI_SCHEMA_BUILDERS.has(callName)) return true;
      return this.endsInSchemaMethodCall(receiver, bindings, visitedDeclarations);
    }

    if (Node.isIdentifier(receiver)) {
      const receiverDecl = compiler.getVariableDeclaration(
        receiver.getSourceFile(),
        receiver.getText(),
      );
      if (!receiverDecl) return false;
      // Guards against a pathological mutual reference between two variable
      // declarations (invalid at runtime, but not something the
      // static AST walk rejects on its own) recursing forever.
      const key = `${compiler.getFilePath(receiverDecl.getSourceFile())}:${receiverDecl.getStart()}`;
      if (visitedDeclarations.has(key)) return false;
      visitedDeclarations.add(key);
      return this.isZodMiniSchema(receiverDecl, bindings, visitedDeclarations);
    }

    return false;
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
   * Extracts the explicit type annotation from `z.ZodMiniType<T>`.
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
   * @param typeText - The full type text (e.g., "ZodMiniType<{ a: string }, unknown>")
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
        } else if (char === ">" && typeText[endIdx - 1] === "=") {
          // The `>` of an arrow function type's `=>` never opened a matching
          // `<` - decrementing depth for it would close the scan early (or
          // desync depth tracking for the rest of the string), e.g. for
          // `ZodMiniType<(value: string) => number, unknown>`.
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
