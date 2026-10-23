import * as compiler from "./compiler.js";
import { SourceFile, ImportDeclaration, ExportDeclaration, Project } from "./compiler.js";
import { join } from "pathe";
import { logDebugError } from "./logger.js";
import type { DetectedSchema } from "./types.js";

/**
 * The subset of a schema-library-specific `SchemaDetector` that
 * `ImportResolver` needs to follow an import back to the schema it names.
 */
export interface SchemaDetectorLike {
  detectExportedSchemas(sourceFile: SourceFile): DetectedSchema[];
}

/**
 * Information about an imported schema.
 */
export interface ImportedSchemaInfo {
  /** Local name used in the importing file */
  localName: string;
  /** Original name in the source file */
  originalName: string;
  /** Resolved source file path */
  sourceFilePath: string;
  /** Whether the schema was successfully resolved */
  resolved: boolean;
}

/**
 * Map of local schema name to imported schema info.
 */
export type ImportedSchemaMap = Map<string, ImportedSchemaInfo>;

/**
 * Resolves imported schemas from other files.
 */
export class ImportResolver {
  private schemaDetector: SchemaDetectorLike;
  private moduleResolutionCache = new Map<string, SourceFile | undefined>();
  private schemaSourceCache = new Map<
    string,
    { sourceFile: SourceFile; schemaName: string } | undefined
  >();

  constructor(schemaDetector: SchemaDetectorLike) {
    this.schemaDetector = schemaDetector;
  }

  /**
   * Finds all imported schemas in a source file.
   *
   * @param sourceFile - The source file to analyze
   * @param project - The native compiler project for module resolution
   * @returns Map of local names to imported schema info
   */
  findImportedSchemas(sourceFile: SourceFile, project: Project): ImportedSchemaMap {
    const result: ImportedSchemaMap = new Map();
    const imports = compiler.getImportDeclarations(sourceFile);

    for (const importDecl of imports) {
      const moduleSpecifier = compiler.getModuleSpecifierValue(importDecl);

      // Skip bare module specifiers (node_modules), but allow relative,
      // absolute, and subpath imports (package.json "imports" field, e.g.
      // "#/schemas/user.js"). Subpath imports — including the "#/*" form — are
      // resolved by TypeScript's own module resolution (requires the
      // native TypeScript compiler).
      if (
        !moduleSpecifier.startsWith(".") &&
        !moduleSpecifier.startsWith("/") &&
        !moduleSpecifier.startsWith("#")
      ) {
        continue;
      }

      // Resolve the module to a source file
      const resolvedSourceFile = this.resolveImportedFile(importDecl, sourceFile, project);

      if (!resolvedSourceFile) {
        continue;
      }

      // Check named imports
      const namedImports = compiler.getNamedImports(importDecl);
      for (const namedImport of namedImports) {
        const importedName = compiler.getName(namedImport);
        const localName = compiler.getAliasNode(namedImport)?.getText() || importedName;

        // Find the actual source file containing the schema definition
        // This handles re-exports from index.ts files
        const actualSource = this.findSchemaSource(resolvedSourceFile, importedName, project);

        if (actualSource) {
          result.set(localName, {
            localName,
            originalName: actualSource.schemaName,
            sourceFilePath: compiler.getFilePath(actualSource.sourceFile),
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
    const filePath = compiler.getFilePath(sourceFile);

    // Check cross-call cache first
    const cacheKey = `${filePath}:${schemaName}`;
    if (this.schemaSourceCache.has(cacheKey)) {
      return this.schemaSourceCache.get(cacheKey);
    }

    // Prevent infinite loops
    if (visited.has(filePath)) {
      return undefined;
    }
    visited.add(filePath);

    // Check if the schema is defined directly in this file
    const schemas = this.schemaDetector.detectExportedSchemas(sourceFile);
    if (schemas.some((s) => s.name === schemaName)) {
      const result = { sourceFile, schemaName };
      this.schemaSourceCache.set(cacheKey, result);
      return result;
    }

    // Check export declarations for re-exports
    const exportDecls = compiler.getExportDeclarations(sourceFile);
    for (const exportDecl of exportDecls) {
      const moduleSpecifier = compiler.getModuleSpecifierValue(exportDecl);
      if (!moduleSpecifier) continue;

      // Check if this is "export * from" or "export { name } from"
      const namedExports = compiler.getNamedExports(exportDecl);

      if (namedExports.length === 0) {
        // This is "export * from './module'" - follow it
        const reExportedFile = this.resolveModuleSpecifier(
          exportDecl,
          sourceFile,
          moduleSpecifier,
          project,
        );
        if (reExportedFile) {
          const found = this.findSchemaSource(reExportedFile, schemaName, project, visited);
          if (found) {
            this.schemaSourceCache.set(cacheKey, found);
            return found;
          }
        }
      } else {
        // Check named exports
        for (const namedExport of namedExports) {
          const exportedName =
            compiler.getAliasNode(namedExport)?.getText() || compiler.getName(namedExport);
          if (exportedName === schemaName) {
            const originalName = compiler.getName(namedExport);
            const reExportedFile = this.resolveModuleSpecifier(
              exportDecl,
              sourceFile,
              moduleSpecifier,
              project,
            );
            if (reExportedFile) {
              const found = this.findSchemaSource(reExportedFile, originalName, project, visited);
              if (found) {
                this.schemaSourceCache.set(cacheKey, found);
                return found;
              }
            }
          }
        }
      }
    }

    this.schemaSourceCache.set(cacheKey, undefined);
    return undefined;
  }

  /**
   * Resolves a module specifier to a source file.
   */
  private resolveModuleSpecifier(
    exportDecl: ExportDeclaration,
    fromFile: SourceFile,
    moduleSpecifier: string,
    project: Project,
  ): SourceFile | undefined {
    const viaProgram = compiler.getModuleSpecifierSourceFile(exportDecl);
    if (viaProgram) return viaProgram;
    const resolved = project.resolveModule(moduleSpecifier, fromFile.fileName);
    if (resolved) return project.addSourceFileAtPathIfExists(resolved.resolvedFileName);
    const sourceDir = compiler.getDirectoryPath(fromFile);
    return this.resolveFromPossiblePaths(sourceDir, moduleSpecifier, project);
  }

  /**
   * Generates possible file paths for a module specifier and resolves to a source file.
   */
  private resolveFromPossiblePaths(
    sourceDir: string,
    moduleSpecifier: string,
    project: Project,
  ): SourceFile | undefined {
    const cacheKey = `${sourceDir}:${moduleSpecifier}`;
    if (this.moduleResolutionCache.has(cacheKey)) {
      return this.moduleResolutionCache.get(cacheKey);
    }

    const possiblePaths = [
      join(sourceDir, `${moduleSpecifier}.ts`),
      join(sourceDir, moduleSpecifier, "index.ts"),
      join(sourceDir, `${moduleSpecifier}.js`),
      join(sourceDir, moduleSpecifier, "index.js"),
    ];

    for (const possiblePath of possiblePaths) {
      let resolved = project.getSourceFile(possiblePath);
      if (!resolved) {
        try {
          resolved = project.addSourceFileAtPathIfExists(possiblePath);
        } catch (error) {
          logDebugError(`Failed to add source file at ${possiblePath}`, error);
          continue;
        }
      }
      if (resolved) {
        this.moduleResolutionCache.set(cacheKey, resolved);
        return resolved;
      }
    }

    this.moduleResolutionCache.set(cacheKey, undefined);
    return undefined;
  }

  /**
   * Resolves an import declaration to its source file.
   */
  private resolveImportedFile(
    importDecl: ImportDeclaration,
    sourceFile: SourceFile,
    project: Project,
  ): SourceFile | undefined {
    const moduleSpecifier = compiler.getModuleSpecifierValue(importDecl);

    try {
      // Get the module specifier source file
      const moduleSourceFile = compiler.getModuleSpecifierSourceFile(importDecl);

      if (moduleSourceFile) {
        return moduleSourceFile;
      }

      // Try to resolve manually for index.ts patterns
      const sourceDir = compiler.getDirectoryPath(sourceFile);
      return this.resolveFromPossiblePaths(sourceDir, moduleSpecifier, project);
    } catch (error) {
      logDebugError(`Module resolution failed for ${moduleSpecifier}`, error);
    }

    return undefined;
  }
}
