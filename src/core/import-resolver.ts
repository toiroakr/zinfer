import {
  SyntaxKind,
  isNamedExports,
  isNamedImports,
  isStringLiteral,
} from "@typescript/native-preview/unstable/ast";
import type {
  ExportDeclaration,
  Expression,
  ImportDeclaration,
  SourceFile,
} from "@typescript/native-preview/unstable/ast";
import type { Project } from "@typescript/native-preview/unstable/sync";
import { SchemaDetector } from "./schema-detector.js";
import { logDebugError } from "./logger.js";

/**
 * ImportResolver, implemented against the tsgo/Corsa API. Cross-file module
 * resolution goes through `Checker.getSymbolAtLocation` on the module
 * specifier expression instead of ts-morph's `getModuleSpecifierSourceFile`.
 * See issue #200.
 */
export interface ImportedSchemaInfo {
  localName: string;
  originalName: string;
  sourceFilePath: string;
  resolved: boolean;
}

export type ImportedSchemaMap = Map<string, ImportedSchemaInfo>;

export class ImportResolver {
  private schemaDetector: SchemaDetector;
  private schemaSourceCache = new Map<
    string,
    { sourceFile: SourceFile; schemaName: string } | undefined
  >();

  constructor(schemaDetector?: SchemaDetector) {
    this.schemaDetector = schemaDetector ?? new SchemaDetector();
  }

  findImportedSchemas(sourceFile: SourceFile, project: Project): ImportedSchemaMap {
    const result: ImportedSchemaMap = new Map();

    for (const statement of sourceFile.statements) {
      if (statement.kind !== SyntaxKind.ImportDeclaration) continue;
      const importDecl = statement as ImportDeclaration;

      const moduleSpecifierNode = importDecl.moduleSpecifier;
      const moduleSpecifier = isStringLiteral(moduleSpecifierNode) ? moduleSpecifierNode.text : "";

      // Skip bare module specifiers (node_modules), but allow relative,
      // absolute, and subpath imports (package.json "imports" field).
      if (
        !moduleSpecifier.startsWith(".") &&
        !moduleSpecifier.startsWith("/") &&
        !moduleSpecifier.startsWith("#")
      ) {
        continue;
      }

      const resolvedSourceFile = this.resolveModuleSpecifierNode(moduleSpecifierNode, project);
      if (!resolvedSourceFile) continue;

      const namedBindings = importDecl.importClause?.namedBindings;
      if (!namedBindings || !isNamedImports(namedBindings)) continue;

      for (const namedImport of namedBindings.elements) {
        const importedName = namedImport.propertyName
          ? namedImport.propertyName.getText(sourceFile)
          : namedImport.name.getText(sourceFile);
        const localName = namedImport.name.getText(sourceFile);

        // Find the actual source file containing the schema definition.
        // This handles re-exports from index.ts files.
        const actualSource = this.findSchemaSource(resolvedSourceFile, importedName, project);

        if (actualSource) {
          result.set(localName, {
            localName,
            originalName: actualSource.schemaName,
            sourceFilePath: actualSource.sourceFile.fileName,
            resolved: true,
          });
        }
      }
    }

    return result;
  }

  /**
   * Finds the actual source file containing a schema definition.
   * Follows re-exports (export * from "./other") to find the original.
   */
  private findSchemaSource(
    sourceFile: SourceFile,
    schemaName: string,
    project: Project,
    visited: Set<string> = new Set(),
  ): { sourceFile: SourceFile; schemaName: string } | undefined {
    const filePath = sourceFile.fileName;

    const cacheKey = `${filePath}:${schemaName}`;
    if (this.schemaSourceCache.has(cacheKey)) {
      return this.schemaSourceCache.get(cacheKey);
    }

    if (visited.has(filePath)) {
      return undefined;
    }
    visited.add(filePath);

    const schemas = this.schemaDetector.detectExportedSchemas(sourceFile);
    if (schemas.some((s) => s.name === schemaName)) {
      const result = { sourceFile, schemaName };
      this.schemaSourceCache.set(cacheKey, result);
      return result;
    }

    for (const statement of sourceFile.statements) {
      if (statement.kind !== SyntaxKind.ExportDeclaration) continue;
      const exportDecl = statement as ExportDeclaration;
      if (!exportDecl.moduleSpecifier) continue;

      if (!exportDecl.exportClause) {
        // "export * from './module'" - follow it
        const reExportedFile = this.resolveModuleSpecifierNode(exportDecl.moduleSpecifier, project);
        if (reExportedFile) {
          const found = this.findSchemaSource(reExportedFile, schemaName, project, visited);
          if (found) {
            this.schemaSourceCache.set(cacheKey, found);
            return found;
          }
        }
        continue;
      }

      if (!isNamedExports(exportDecl.exportClause)) continue;

      for (const namedExport of exportDecl.exportClause.elements) {
        const exportedName = namedExport.name.getText(sourceFile);
        if (exportedName !== schemaName) continue;

        const originalName = namedExport.propertyName
          ? namedExport.propertyName.getText(sourceFile)
          : exportedName;
        const reExportedFile = this.resolveModuleSpecifierNode(exportDecl.moduleSpecifier, project);
        if (reExportedFile) {
          const found = this.findSchemaSource(reExportedFile, originalName, project, visited);
          if (found) {
            this.schemaSourceCache.set(cacheKey, found);
            return found;
          }
        }
      }
    }

    this.schemaSourceCache.set(cacheKey, undefined);
    return undefined;
  }

  /**
   * Resolves a module specifier expression node to its target source file via
   * the checker's symbol resolution (respects the project's configured
   * module resolution, including package.json "imports" subpath mappings).
   */
  private resolveModuleSpecifierNode(
    moduleSpecifierNode: Expression,
    project: Project,
  ): SourceFile | undefined {
    try {
      const symbol = project.checker.getSymbolAtLocation(moduleSpecifierNode);
      if (!symbol) return undefined;

      const decl = symbol.declarations[0];
      if (!decl) return undefined;

      return project.program.getSourceFile(decl.path);
    } catch (error) {
      logDebugError("Module resolution failed", error);
      return undefined;
    }
  }
}
