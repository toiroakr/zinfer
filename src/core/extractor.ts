import { Project, SourceFile, TypeFormatFlags, ts } from "ts-morph";
import {
  NORMALIZE_TYPE_DEFINITION,
  createTempTypeAlias,
  TEMP_TYPE_NAMES,
} from "./normalizer.js";
import { SchemaDetector } from "./schema-detector.js";
import type {
  ExtractResult,
  FileExtractResult,
  DetectedSchema,
} from "./types.js";

// Re-export ExtractResult for backward compatibility
export type { ExtractResult } from "./types.js";

/**
 * Options for type extraction.
 */
export interface ExtractOptions {
  /** Absolute or relative path to the TypeScript file containing the Zod schema */
  filePath: string;
  /** Name of the exported Zod schema (e.g., "UserSchema") */
  schemaName: string;
  /** Optional path to tsconfig.json for project configuration */
  tsconfigPath?: string;
}

/**
 * Extracts input and output types from Zod schemas using TypeScript Compiler API.
 */
export class ZodTypeExtractor {
  private project: Project;
  private schemaDetector: SchemaDetector;

  /**
   * Creates a new ZodTypeExtractor instance.
   *
   * @param tsconfigPath - Optional path to tsconfig.json. If not provided,
   *                       default compiler options will be used.
   */
  constructor(tsconfigPath?: string) {
    this.project = this.createProject(tsconfigPath);
    this.schemaDetector = new SchemaDetector();
  }

  /**
   * Extracts input and output types from a Zod schema.
   *
   * @param options - Extraction options including file path and schema name
   * @returns The extracted input and output types as strings
   */
  extract(options: ExtractOptions): ExtractResult {
    const { filePath, schemaName } = options;

    // Use extractMultiple to handle explicit type annotations properly
    const results = this.extractMultiple(filePath, [schemaName]);

    if (results.length === 0) {
      throw new Error(`Schema "${schemaName}" not found in ${filePath}`);
    }

    return results[0];
  }

  /**
   * Extracts types from all exported Zod schemas in a file.
   *
   * @param filePath - Path to the TypeScript file
   * @returns Array of extraction results for each schema
   */
  extractAll(filePath: string): ExtractResult[] {
    // Get or add the source file
    let sourceFile = this.project.getSourceFile(filePath);
    if (!sourceFile) {
      sourceFile = this.project.addSourceFileAtPath(filePath);
    }

    // Detect all exported schemas
    const schemas = this.schemaDetector.detectExportedSchemas(sourceFile);

    return this.extractMultipleFromSourceFile(sourceFile, schemas);
  }

  /**
   * Extracts types from specific schemas in a file.
   *
   * @param filePath - Path to the TypeScript file
   * @param schemaNames - Names of schemas to extract
   * @returns Array of extraction results
   */
  extractMultiple(filePath: string, schemaNames: string[]): ExtractResult[] {
    // Get or add the source file
    let sourceFile = this.project.getSourceFile(filePath);
    if (!sourceFile) {
      sourceFile = this.project.addSourceFileAtPath(filePath);
    }

    // Get schema info including explicit types
    const allSchemas = this.schemaDetector.detectExportedSchemas(sourceFile);
    const schemas = schemaNames.map((name) => {
      const found = allSchemas.find((s) => s.name === name);
      return found || { name, isExported: true, line: 0 };
    });

    return this.extractMultipleFromSourceFile(sourceFile, schemas);
  }

  /**
   * Extracts types from all exported schemas and returns file-level result.
   *
   * @param filePath - Path to the TypeScript file
   * @returns File extraction result with all schemas
   */
  extractFile(filePath: string): FileExtractResult {
    return {
      filePath,
      schemas: this.extractAll(filePath),
    };
  }

  /**
   * Gets the list of detected schema names in a file.
   *
   * @param filePath - Path to the TypeScript file
   * @returns Array of schema names
   */
  getSchemaNames(filePath: string): string[] {
    let sourceFile = this.project.getSourceFile(filePath);
    if (!sourceFile) {
      sourceFile = this.project.addSourceFileAtPath(filePath);
    }

    return this.schemaDetector.getSchemaNames(sourceFile);
  }

  /**
   * Internal method to extract multiple schemas from a source file.
   */
  private extractMultipleFromSourceFile(
    sourceFile: SourceFile,
    schemas: DetectedSchema[]
  ): ExtractResult[] {
    const results: ExtractResult[] = [];

    for (const schema of schemas) {
      const { name: schemaName, explicitType } = schema;

      // If schema has explicit type annotation (z.ZodType<T>), use it directly
      if (explicitType) {
        // Use explicit type without normalization to preserve circular references
        this.injectExplicitType(sourceFile, explicitType);

        try {
          const resolvedType = this.resolveType(sourceFile, "__TempExplicit");
          results.push({
            schemaName,
            input: resolvedType,
            output: resolvedType,
          });
        } finally {
          this.cleanupExplicitType(sourceFile);
        }
        continue;
      }

      // Standard extraction using z.input/z.output
      this.injectTemporaryTypes(sourceFile, schemaName);

      try {
        // Resolve types
        const inputType = this.resolveType(sourceFile, "__TempInput");
        const outputType = this.resolveType(sourceFile, "__TempOutput");

        results.push({
          schemaName,
          input: inputType,
          output: outputType,
        });
      } finally {
        // Clean up temporary types
        this.cleanupTemporaryTypes(sourceFile);
      }
    }

    return results;
  }

  /**
   * Injects temporary type for explicit type (without normalization for circular refs).
   */
  private injectExplicitType(
    sourceFile: SourceFile,
    explicitType: string
  ): void {
    // Don't normalize - use the type directly to preserve circular references
    sourceFile.addStatements([`type __TempExplicit = ${explicitType};`]);
  }

  /**
   * Cleans up explicit type temporaries.
   */
  private cleanupExplicitType(sourceFile: SourceFile): void {
    const typeAlias = sourceFile.getTypeAlias("__TempExplicit");
    if (typeAlias) {
      typeAlias.remove();
    }
  }

  /**
   * Creates a ts-morph Project with appropriate compiler options.
   */
  private createProject(tsconfigPath?: string): Project {
    if (tsconfigPath) {
      return new Project({
        tsConfigFilePath: tsconfigPath,
        skipAddingFilesFromTsConfig: true,
      });
    }

    return new Project({
      compilerOptions: {
        strict: true,
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        esModuleInterop: true,
        skipLibCheck: true,
      },
    });
  }

  /**
   * Injects the Normalize type and temporary type aliases into the source file.
   * These are added in-memory only and never saved to disk.
   */
  private injectTemporaryTypes(
    sourceFile: SourceFile,
    schemaName: string
  ): void {
    // Add the Normalize type definition and temporary type aliases at the end of the file
    sourceFile.addStatements([
      NORMALIZE_TYPE_DEFINITION,
      createTempTypeAlias(schemaName, "input"),
      createTempTypeAlias(schemaName, "output"),
    ]);
  }

  /**
   * Resolves a type alias and returns its fully expanded string representation.
   */
  private resolveType(sourceFile: SourceFile, typeName: string): string {
    const typeAlias = sourceFile.getTypeAlias(typeName);
    if (!typeAlias) {
      throw new Error(`Failed to find type alias: ${typeName}`);
    }

    const type = typeAlias.getType();

    // Use TypeFormatFlags to get the fully expanded type without truncation
    const formatFlags =
      TypeFormatFlags.NoTruncation |
      TypeFormatFlags.InTypeAlias |
      TypeFormatFlags.UseAliasDefinedOutsideCurrentScope;

    return type.getText(typeAlias, formatFlags);
  }

  /**
   * Removes the temporary types that were injected during extraction.
   * This ensures the original file remains unmodified.
   */
  private cleanupTemporaryTypes(sourceFile: SourceFile): void {
    for (const name of TEMP_TYPE_NAMES) {
      const typeAlias = sourceFile.getTypeAlias(name);
      if (typeAlias) {
        typeAlias.remove();
      }
    }
  }
}
