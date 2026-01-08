import { SourceFile, ImportDeclaration, Project } from "ts-morph";
import { SchemaDetector } from "./schema-detector.js";
import { logDebugError } from "./logger.js";

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
  private schemaDetector: SchemaDetector;
  private processedFiles: Set<string> = new Set();

  constructor() {
    this.schemaDetector = new SchemaDetector();
  }

  /**
   * Finds all imported schemas in a source file.
   *
   * @param sourceFile - The source file to analyze
   * @param project - The ts-morph project for module resolution
   * @returns Map of local names to imported schema info
   */
  findImportedSchemas(sourceFile: SourceFile, project: Project): ImportedSchemaMap {
    const result: ImportedSchemaMap = new Map();
    const imports = sourceFile.getImportDeclarations();

    for (const importDecl of imports) {
      const moduleSpecifier = importDecl.getModuleSpecifierValue();

      // Skip node_modules imports
      if (!moduleSpecifier.startsWith(".") && !moduleSpecifier.startsWith("/")) {
        continue;
      }

      // Resolve the module to a source file
      const resolvedSourceFile = this.resolveImportedFile(importDecl, sourceFile, project);

      if (!resolvedSourceFile) {
        continue;
      }

      // Check named imports
      const namedImports = importDecl.getNamedImports();
      for (const namedImport of namedImports) {
        const importedName = namedImport.getName();
        const localName = namedImport.getAliasNode()?.getText() || importedName;

        // Find the actual source file containing the schema definition
        // This handles re-exports from index.ts files
        const actualSource = this.findSchemaSource(resolvedSourceFile, importedName, project);

        if (actualSource) {
          result.set(localName, {
            localName,
            originalName: actualSource.schemaName,
            sourceFilePath: actualSource.sourceFile.getFilePath(),
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
    const filePath = sourceFile.getFilePath();

    // Prevent infinite loops
    if (visited.has(filePath)) {
      return undefined;
    }
    visited.add(filePath);

    // Check if the schema is defined directly in this file
    const schemas = this.schemaDetector.detectExportedSchemas(sourceFile);
    if (schemas.some((s) => s.name === schemaName)) {
      return { sourceFile, schemaName };
    }

    // Check export declarations for re-exports
    const exportDecls = sourceFile.getExportDeclarations();
    for (const exportDecl of exportDecls) {
      const moduleSpecifier = exportDecl.getModuleSpecifierValue();
      if (!moduleSpecifier) continue;

      // Check if this is "export * from" or "export { name } from"
      const namedExports = exportDecl.getNamedExports();

      if (namedExports.length === 0) {
        // This is "export * from './module'" - follow it
        const reExportedFile = this.resolveModuleSpecifier(sourceFile, moduleSpecifier, project);
        if (reExportedFile) {
          const found = this.findSchemaSource(reExportedFile, schemaName, project, visited);
          if (found) {
            return found;
          }
        }
      } else {
        // Check named exports
        for (const namedExport of namedExports) {
          const exportedName = namedExport.getAliasNode()?.getText() || namedExport.getName();
          if (exportedName === schemaName) {
            const originalName = namedExport.getName();
            const reExportedFile = this.resolveModuleSpecifier(
              sourceFile,
              moduleSpecifier,
              project,
            );
            if (reExportedFile) {
              return this.findSchemaSource(reExportedFile, originalName, project, visited);
            }
          }
        }
      }
    }

    return undefined;
  }

  /**
   * Resolves a module specifier to a source file.
   */
  private resolveModuleSpecifier(
    fromFile: SourceFile,
    moduleSpecifier: string,
    project: Project,
  ): SourceFile | undefined {
    const sourceDir = fromFile.getDirectoryPath();
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
    const possiblePaths = [
      `${sourceDir}/${moduleSpecifier}.ts`,
      `${sourceDir}/${moduleSpecifier}/index.ts`,
      `${sourceDir}/${moduleSpecifier}.js`,
      `${sourceDir}/${moduleSpecifier}/index.js`,
    ];

    for (const possiblePath of possiblePaths) {
      let resolved = project.getSourceFile(possiblePath);
      if (!resolved) {
        try {
          resolved = project.addSourceFileAtPathIfExists(possiblePath);
        } catch (error) {
          logDebugError(`Failed to add source file at path "${possiblePath}"`, error);
          continue;
        }
      }
      if (resolved) {
        return resolved;
      }
    }

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
    const moduleSpecifier = importDecl.getModuleSpecifierValue();

    try {
      // Get the module specifier source file
      const moduleSourceFile = importDecl.getModuleSpecifierSourceFile();

      if (moduleSourceFile) {
        return moduleSourceFile;
      }

      // Try to resolve manually for index.ts patterns
      const sourceDir = sourceFile.getDirectoryPath();
      return this.resolveFromPossiblePaths(sourceDir, moduleSpecifier, project);
    } catch (error) {
      logDebugError(`Module resolution failed for "${moduleSpecifier}"`, error);
    }

    return undefined;
  }

  /**
   * Extracts schemas from imported files and returns their types.
   *
   * @param importedSchemas - Map of imported schema info
   * @param project - The ts-morph project
   * @param extractType - Function to extract type from a schema
   * @returns Map of local schema name to its input/output types
   */
  extractImportedSchemaTypes(
    importedSchemas: ImportedSchemaMap,
    project: Project,
    extractType: (sourceFile: SourceFile, schemaName: string) => { input: string; output: string },
  ): Map<string, { input: string; output: string }> {
    const result = new Map<string, { input: string; output: string }>();

    // Group by source file
    const byFile = new Map<string, ImportedSchemaInfo[]>();
    for (const info of importedSchemas.values()) {
      if (!info.resolved) continue;

      const existing = byFile.get(info.sourceFilePath) || [];
      existing.push(info);
      byFile.set(info.sourceFilePath, existing);
    }

    // Extract types from each file
    for (const [filePath, schemas] of byFile) {
      // Skip if already processed (avoid circular dependencies)
      if (this.processedFiles.has(filePath)) {
        continue;
      }
      this.processedFiles.add(filePath);

      const sourceFile = project.getSourceFile(filePath);
      if (!sourceFile) continue;

      for (const schemaInfo of schemas) {
        try {
          const types = extractType(sourceFile, schemaInfo.originalName);
          result.set(schemaInfo.localName, types);
        } catch (error) {
          logDebugError(`Failed to extract types for schema "${schemaInfo.originalName}"`, error);
        }
      }
    }

    return result;
  }

  /**
   * Clears the processed files cache.
   */
  clearCache(): void {
    this.processedFiles.clear();
  }
}
