import { Project, SourceFile, TypeFormatFlags, ts } from "ts-morph";
import { NORMALIZE_TYPE_DEFINITION, createTempTypeAlias, TEMP_TYPE_NAMES } from "./normalizer.js";
import { SchemaDetector } from "./schema-detector.js";
import { GetterResolver } from "./getter-resolver.js";
import { SchemaReferenceAnalyzer, type SchemaReferenceInfo } from "./schema-reference-analyzer.js";
import { ImportResolver } from "./import-resolver.js";
import { BrandDetector } from "./brand-detector.js";
import type { ExtractResult, FileExtractResult, DetectedSchema } from "./types.js";

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
  private getterResolver: GetterResolver;
  private referenceAnalyzer: SchemaReferenceAnalyzer;
  private importResolver: ImportResolver;
  private brandDetector: BrandDetector;

  /**
   * Creates a new ZodTypeExtractor instance.
   *
   * @param tsconfigPath - Optional path to tsconfig.json. If not provided,
   *                       default compiler options will be used.
   */
  constructor(tsconfigPath?: string) {
    this.project = this.createProject(tsconfigPath);
    this.schemaDetector = new SchemaDetector();
    this.getterResolver = new GetterResolver();
    this.referenceAnalyzer = new SchemaReferenceAnalyzer();
    this.importResolver = new ImportResolver();
    this.brandDetector = new BrandDetector();
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
    const sourceFile = this.getOrAddSourceFile(filePath);
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
    const sourceFile = this.getOrAddSourceFile(filePath);
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
    return this.schemaDetector.getSchemaNames(this.getOrAddSourceFile(filePath));
  }

  /**
   * Gets or adds a source file to the project.
   */
  private getOrAddSourceFile(filePath: string): SourceFile {
    return this.project.getSourceFile(filePath) ?? this.project.addSourceFileAtPath(filePath);
  }

  /**
   * Internal method to extract multiple schemas from a source file.
   */
  private extractMultipleFromSourceFile(
    sourceFile: SourceFile,
    schemas: DetectedSchema[],
  ): ExtractResult[] {
    const results: ExtractResult[] = [];

    // Find and resolve imported schemas
    const importedSchemas = this.importResolver.findImportedSchemas(sourceFile, this.project);

    // Analyze getter fields for all schemas
    const getterFieldMap = this.getterResolver.analyzeGetterFields(sourceFile);

    // Build schema names set including imports
    const schemaNames = new Set(schemas.map((s) => s.name));
    for (const localName of importedSchemas.keys()) {
      schemaNames.add(localName);
    }

    // Analyze cross-schema references
    const referenceMap = this.referenceAnalyzer.analyzeReferences(sourceFile, schemaNames);

    // Analyze union schema references
    const unionReferenceMap = this.referenceAnalyzer.analyzeUnionReferences(
      sourceFile,
      schemaNames,
    );

    // Detect branded types
    const brandMap = this.brandDetector.detectBrands(sourceFile, schemaNames);

    // First pass: extract raw types for all schemas
    const rawTypes = new Map<string, { input: string; output: string; isExported: boolean }>();

    // Extract types from imported schemas first
    for (const [localName, importInfo] of importedSchemas) {
      if (!importInfo.resolved) continue;

      const importedSourceFile = this.project.getSourceFile(importInfo.sourceFilePath);
      if (!importedSourceFile) continue;

      try {
        this.injectTemporaryTypes(importedSourceFile, importInfo.originalName);
        const inputType = this.resolveType(importedSourceFile, "__TempInput");
        const outputType = this.resolveType(importedSourceFile, "__TempOutput");

        // Use local name as the key (how it's referenced in current file)
        rawTypes.set(localName, {
          input: inputType,
          output: outputType,
          isExported: false, // Imported schemas won't be re-exported
        });
      } catch {
        // Failed to extract imported schema type
      } finally {
        this.cleanupTemporaryTypes(importedSourceFile);
      }
    }

    // Extract types from local schemas
    for (const schema of schemas) {
      const { name: schemaName, explicitType, isExported } = schema;

      if (explicitType) {
        this.injectExplicitType(sourceFile, explicitType);
        try {
          const resolvedType = this.resolveType(sourceFile, "__TempExplicit");
          rawTypes.set(schemaName, {
            input: resolvedType,
            output: resolvedType,
            isExported,
          });
        } finally {
          this.cleanupExplicitType(sourceFile);
        }
        continue;
      }

      this.injectTemporaryTypes(sourceFile, schemaName);
      try {
        let inputType = this.resolveType(sourceFile, "__TempInput");
        let outputType = this.resolveType(sourceFile, "__TempOutput");

        // Resolve getter-based self-references
        const getterFields = getterFieldMap.get(schemaName);
        if (getterFields && this.getterResolver.hasSelfReferences(getterFields)) {
          const inputTypeName = `${schemaName}Input`;
          const outputTypeName = `${schemaName}Output`;
          const originalInputType = inputType;

          inputType = this.getterResolver.resolveAnyTypes(inputType, getterFields, inputTypeName);

          if (outputType === "any") {
            outputType = this.getterResolver.resolveAnyTypes(
              originalInputType,
              getterFields,
              outputTypeName,
            );
          } else {
            outputType = this.getterResolver.resolveAnyTypes(
              outputType,
              getterFields,
              outputTypeName,
            );
          }
        }

        rawTypes.set(schemaName, { input: inputType, output: outputType, isExported });
      } finally {
        this.cleanupTemporaryTypes(sourceFile);
      }
    }

    // Add imported schemas to results first (so they're defined before use)
    for (const [localName] of importedSchemas) {
      const raw = rawTypes.get(localName);
      if (!raw) continue;

      results.push({
        schemaName: localName,
        input: raw.input,
        output: raw.output,
        isExported: false, // Imported schemas are not re-exported
      });
    }

    // Second pass: replace cross-schema references with type names
    for (const schema of schemas) {
      const schemaName = schema.name;
      const raw = rawTypes.get(schemaName);
      if (!raw) continue;

      // Get brand information for this schema
      const brands = brandMap.get(schemaName);

      // Check if this schema is a union with member references
      const unionRef = unionReferenceMap.get(schemaName);
      if (unionRef && unionRef.memberSchemas.length > 0) {
        // Build union type from member type names
        const inputMembers = unionRef.memberSchemas.map((member) => `${member}Input`).join(" | ");
        const outputMembers = unionRef.memberSchemas.map((member) => `${member}Output`).join(" | ");

        results.push({
          schemaName,
          input: inputMembers,
          output: outputMembers,
          isExported: raw.isExported,
          brands,
        });
        continue;
      }

      let { input, output } = raw;
      const refs = referenceMap.get(schemaName) || [];

      // Replace references to other schemas with type names
      // Only replace references to exported schemas
      for (const ref of refs) {
        const refRaw = rawTypes.get(ref.refSchema);
        if (!refRaw) continue;

        // Skip replacement if the referenced schema is not exported
        // Non-exported schemas should remain inlined
        if (!refRaw.isExported) continue;

        input = this.replaceSchemaReference(input, ref, refRaw.input, `${ref.refSchema}Input`);
        output = this.replaceSchemaReference(output, ref, refRaw.output, `${ref.refSchema}Output`);
      }

      // For explicit types, replace self-references with typed names
      if (schema.explicitType) {
        // schema.explicitType already contains just the type name (e.g., "JsonValue")
        const typeName = schema.explicitType;
        // Only replace if the type name is a valid identifier (not a complex type)
        if (this.isValidIdentifier(typeName)) {
          // Escape special regex characters in the type name
          const escapedTypeName = this.escapeRegExp(typeName);
          // Replace type name with self-referencing Input/Output types
          const typeNamePattern = new RegExp(`\\b${escapedTypeName}\\b`, "g");
          input = input.replace(typeNamePattern, `${schemaName}Input`);
          output = output.replace(typeNamePattern, `${schemaName}Output`);
        }
      }

      results.push({
        schemaName,
        input,
        output,
        isExported: raw.isExported,
        brands,
      });
    }

    return results;
  }

  /**
   * Replaces an inline schema reference with a type name.
   */
  private replaceSchemaReference(
    typeStr: string,
    ref: SchemaReferenceInfo,
    refTypeStr: string,
    refTypeName: string,
  ): string {
    const { fieldPath, isArray, isRecord } = ref;

    // Build the replacement type
    let replacement = refTypeName;
    if (isArray) {
      replacement = `${refTypeName}[]`;
    }

    // Find the field and replace its value
    const fieldPatterns = [`${fieldPath}: `, `${fieldPath}?: `];

    for (const pattern of fieldPatterns) {
      const idx = typeStr.indexOf(pattern);
      if (idx === -1) continue;

      const valueStart = idx + pattern.length;

      // Find the end of the field value by tracking braces/brackets
      let depth = 0;
      let endIdx = valueStart;
      let inString = false;

      while (endIdx < typeStr.length) {
        const char = typeStr[endIdx];

        if (char === '"' || char === "'") {
          inString = !inString;
        } else if (!inString) {
          if (char === "{" || char === "[" || char === "(") {
            depth++;
          } else if (char === "}" || char === "]" || char === ")") {
            if (depth === 0) break;
            depth--;
          } else if (char === ";" && depth === 0) {
            break;
          }
        }
        endIdx++;
      }

      // Extract the current value
      const currentValue = typeStr.substring(valueStart, endIdx).trim();

      // Check if this looks like an expanded type that should be replaced
      // Handle: { ... }, readonly { ... }[], SomeType, etc.
      const valueToCheck = currentValue
        .replace(/^readonly\s+/, "")
        .replace(/\[\]$/, "")
        .trim();

      if (
        valueToCheck.startsWith("{") ||
        valueToCheck === refTypeStr ||
        currentValue.includes("[x: string]:")
      ) {
        // Handle record type
        if (isRecord) {
          replacement = `{ [x: string]: ${refTypeName} }`;
        }

        // Preserve readonly prefix for arrays
        if (isArray && currentValue.startsWith("readonly ")) {
          replacement = `readonly ${replacement}`;
        }

        return typeStr.substring(0, valueStart) + replacement + typeStr.substring(endIdx);
      }
    }

    return typeStr;
  }

  /**
   * Injects temporary type for explicit type (without normalization for circular refs).
   */
  private injectExplicitType(sourceFile: SourceFile, explicitType: string): void {
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
  private injectTemporaryTypes(sourceFile: SourceFile, schemaName: string): void {
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
    // Don't use UseAliasDefinedOutsideCurrentScope to expand enum types
    const formatFlags = TypeFormatFlags.NoTruncation | TypeFormatFlags.InTypeAlias;

    let rawType = type.getText(typeAlias, formatFlags);

    // Remove trailing spaces from each line (ts-morph 27+ may add them)
    rawType = rawType
      .split("\n")
      .map((line) => line.trimEnd())
      .join("\n");

    // Expand enum types: if the type is a single identifier, check if it's an enum
    if (/^[A-Z][a-zA-Z0-9]*$/.test(rawType)) {
      const enumDecl = sourceFile.getEnum(rawType);
      if (enumDecl) {
        // Extract enum values
        const members = enumDecl.getMembers();
        const values = members
          .map((member) => {
            const value = member.getValue();
            if (typeof value === "string") {
              return `"${value}"`;
            } else if (typeof value === "number") {
              return value.toString();
            }
            return null;
          })
          .filter(Boolean);

        if (values.length > 0) {
          rawType = values.join(" | ");
        }
      }
    }

    // Post-process to simplify Zod internal function types
    return this.simplifyZodFunctionTypes(rawType);
  }

  /**
   * Simplifies Zod internal function types to Function.
   * Replaces patterns like z.core.$InferInnerFunctionType<...> with Function.
   * Handles nested type parameters properly.
   */
  private simplifyZodFunctionTypes(typeStr: string): string {
    // Pattern prefixes for Zod internal function types
    const zodFunctionPrefixes = [
      "z.core.$InferInnerFunctionType<",
      "z.core.$InferOuterFunctionType<",
    ];

    let result = typeStr;
    let modified = true;

    // Loop until no more replacements are made (handles nested cases)
    while (modified) {
      modified = false;
      for (const prefix of zodFunctionPrefixes) {
        const idx = result.indexOf(prefix);
        if (idx === -1) continue;

        // Find the matching closing bracket using bracket counting
        const startIdx = idx + prefix.length;
        let depth = 1;
        let endIdx = startIdx;

        while (endIdx < result.length && depth > 0) {
          const char = result[endIdx];
          if (char === "<") {
            depth++;
          } else if (char === ">") {
            depth--;
          }
          endIdx++;
        }

        if (depth === 0) {
          // Replace the entire pattern with "Function"
          result = result.substring(0, idx) + "Function" + result.substring(endIdx);
          modified = true;
          break; // Start over to handle any new matches
        }
      }
    }

    return result;
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

  /**
   * Escapes special characters in a string for use in a RegExp.
   */
  private escapeRegExp(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  /**
   * Checks if a string is a valid TypeScript identifier.
   * Used to determine if a type name can be safely used in regex replacement.
   */
  private isValidIdentifier(str: string): boolean {
    return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(str);
  }
}
