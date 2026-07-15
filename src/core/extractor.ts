import type { SourceFile } from "ts-morph";
import { createTempTypeAlias } from "./normalizer.js";
import { SchemaDetector } from "./schema-detector.js";
import { GetterResolver } from "./getter-resolver.js";
import { SchemaReferenceAnalyzer, type SchemaReferenceInfo } from "./schema-reference-analyzer.js";
import { ImportResolver } from "./import-resolver.js";
import { BrandDetector } from "./brand-detector.js";
import { TsMorphHost } from "./ts-morph-host.js";
import { logDebugError } from "./logger.js";
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
  private host: TsMorphHost;
  private schemaDetector: SchemaDetector;
  private getterResolver: GetterResolver;
  private referenceAnalyzer: SchemaReferenceAnalyzer;
  private importResolver: ImportResolver;
  private brandDetector: BrandDetector;
  private importedSchemaCache = new Map<string, { input: string; output: string }>();

  /**
   * Creates a new ZodTypeExtractor instance.
   *
   * @param tsconfigPath - Optional path to tsconfig.json. If not provided,
   *                       default compiler options will be used.
   */
  constructor(tsconfigPath?: string) {
    this.host = new TsMorphHost(tsconfigPath);
    this.schemaDetector = new SchemaDetector();
    this.getterResolver = new GetterResolver();
    this.referenceAnalyzer = new SchemaReferenceAnalyzer();
    this.importResolver = new ImportResolver(this.schemaDetector);
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
    return this.host.getSourceFile(filePath);
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
    const importedSchemas = this.importResolver.findImportedSchemas(sourceFile, this.host.project);

    // Build schema names set including imports
    const schemaNames = new Set(schemas.map((s) => s.name));
    for (const localName of importedSchemas.keys()) {
      schemaNames.add(localName);
    }

    // Analyze getter fields for target schemas only
    const getterFieldMap = this.getterResolver.analyzeGetterFields(sourceFile, schemaNames);

    // Analyze cross-schema references and union references in a single pass
    const { references: referenceMap, unionReferences: unionReferenceMap } =
      this.referenceAnalyzer.analyzeAllReferences(sourceFile, schemaNames);

    // Detect branded types
    const brandMap = this.brandDetector.detectBrands(sourceFile, schemaNames);

    // First pass: extract raw types for all schemas
    const rawTypes = new Map<string, { input: string; output: string; isExported: boolean }>();

    // Inject __Normalize once for the main source file
    this.host.ensureNormalizeType(sourceFile);

    // Extract types from imported schemas first
    for (const [localName, importInfo] of importedSchemas) {
      if (!importInfo.resolved) continue;

      // Check cache for previously extracted imported schemas
      const cacheKey = `${importInfo.sourceFilePath}:${importInfo.originalName}`;
      const cached = this.importedSchemaCache.get(cacheKey);
      if (cached) {
        rawTypes.set(localName, {
          input: cached.input,
          output: cached.output,
          isExported: false,
        });
        continue;
      }

      const importedSourceFile = this.host.tryGetSourceFile(importInfo.sourceFilePath);
      if (!importedSourceFile) continue;

      this.host.ensureNormalizeType(importedSourceFile);
      try {
        const resolved = this.host.resolveTypes(
          importedSourceFile,
          [
            createTempTypeAlias(importInfo.originalName, "input"),
            createTempTypeAlias(importInfo.originalName, "output"),
          ],
          ["__TempInput", "__TempOutput"],
        );
        const inputType = this.simplifyZodFunctionTypes(resolved.get("__TempInput") ?? "");
        const outputType = this.simplifyZodFunctionTypes(resolved.get("__TempOutput") ?? "");

        // Cache the result
        this.importedSchemaCache.set(cacheKey, { input: inputType, output: outputType });

        // Use local name as the key (how it's referenced in current file)
        rawTypes.set(localName, {
          input: inputType,
          output: outputType,
          isExported: false, // Imported schemas won't be re-exported
        });
      } catch (error) {
        logDebugError(`Failed to extract imported schema "${localName}"`, error);
      } finally {
        this.host.cleanupNormalizeType(importedSourceFile);
      }
    }

    // Extract types from local schemas
    for (const schema of schemas) {
      const { name: schemaName, explicitType, isExported } = schema;

      if (explicitType) {
        const resolved = this.host.resolveTypes(
          sourceFile,
          [`type __TempExplicit = ${explicitType};`],
          ["__TempExplicit"],
        );
        const resolvedType = this.simplifyZodFunctionTypes(resolved.get("__TempExplicit") ?? "");
        rawTypes.set(schemaName, {
          input: resolvedType,
          output: resolvedType,
          isExported,
        });
        continue;
      }

      const resolved = this.host.resolveTypes(
        sourceFile,
        [createTempTypeAlias(schemaName, "input"), createTempTypeAlias(schemaName, "output")],
        ["__TempInput", "__TempOutput"],
      );
      let inputType = this.simplifyZodFunctionTypes(resolved.get("__TempInput") ?? "");
      let outputType = this.simplifyZodFunctionTypes(resolved.get("__TempOutput") ?? "");

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
    }

    // Clean up __Normalize from the main source file after all schemas are processed
    this.host.cleanupNormalizeType(sourceFile);

    const schemasByName = new Map(schemas.map((schema) => [schema.name, schema]));
    const resolvedTypes = new Map<string, { input: string; output: string }>();
    const resolvingSchemas = new Set<string>();

    const resolveSchemaTypes = (
      schemaName: string,
    ): { input: string; output: string } | undefined => {
      const cached = resolvedTypes.get(schemaName);
      if (cached) return cached;

      const raw = rawTypes.get(schemaName);
      if (!raw) return undefined;

      if (resolvingSchemas.has(schemaName)) {
        return { input: raw.input, output: raw.output };
      }
      resolvingSchemas.add(schemaName);

      let { input, output } = raw;
      const unionRef = unionReferenceMap.get(schemaName);

      const shouldComposeUnion =
        unionRef &&
        unionRef.memberSchemas.length > 0 &&
        (unionRef.memberSchemas.every((member) => rawTypes.get(member)?.isExported) ||
          (!unionRef.hasInlineMembers &&
            (unionRef.memberSchemas.some((member) => importedSchemas.has(member)) ||
              unionRef.memberSchemas.some((member) => {
                if (rawTypes.get(member)?.isExported) return false;
                return (referenceMap.get(member) ?? []).some(
                  (ref) => rawTypes.get(ref.refSchema)?.isExported,
                );
              }))));

      if (unionRef && shouldComposeUnion) {
        const inputMembers: string[] = [];
        const outputMembers: string[] = [];
        let canComposeUnion = true;

        for (const member of unionRef.memberSchemas) {
          const memberRaw = rawTypes.get(member);
          if (!memberRaw) continue;

          if (memberRaw.isExported) {
            inputMembers.push(`${member}Input`);
            outputMembers.push(`${member}Output`);
            continue;
          }

          const resolvedMember = resolveSchemaTypes(member);
          if (!resolvedMember) continue;
          if (
            resolvedMember.input.includes(`${member}Input`) ||
            resolvedMember.output.includes(`${member}Output`)
          ) {
            canComposeUnion = false;
            break;
          }
          inputMembers.push(resolvedMember.input);
          outputMembers.push(resolvedMember.output);
        }

        if (canComposeUnion && inputMembers.length === unionRef.memberSchemas.length) {
          input = inputMembers.join(" | ");
          output = outputMembers.join(" | ");
        }
      }

      const refs = referenceMap.get(schemaName) || [];
      for (const ref of refs) {
        const refRaw = rawTypes.get(ref.refSchema);
        if (!refRaw?.isExported) continue;

        input = this.replaceSchemaReference(input, ref, refRaw.input, `${ref.refSchema}Input`);
        output = this.replaceSchemaReference(output, ref, refRaw.output, `${ref.refSchema}Output`);
      }

      const explicitType = schemasByName.get(schemaName)?.explicitType;
      if (explicitType && this.isValidIdentifier(explicitType)) {
        const escapedTypeName = this.escapeRegExp(explicitType);
        const typeNamePattern = new RegExp(`\\b${escapedTypeName}\\b`, "g");
        input = input.replace(typeNamePattern, `${schemaName}Input`);
        output = output.replace(typeNamePattern, `${schemaName}Output`);
      }

      resolvingSchemas.delete(schemaName);
      const resolved = { input, output };
      resolvedTypes.set(schemaName, resolved);
      return resolved;
    };

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
      const resolved = resolveSchemaTypes(schemaName);
      if (!resolved) continue;

      results.push({
        schemaName,
        input: resolved.input,
        output: resolved.output,
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
   * Simplifies Zod internal function types to Function.
   * Replaces patterns like z.core.$InferInnerFunctionType<...> with Function.
   * Handles nested type parameters properly.
   */
  private simplifyZodFunctionTypes(typeStr: string): string {
    // Quick check: skip if no Zod function type patterns are present
    if (!typeStr.includes("z.core.$Infer")) return typeStr;

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
        // If depth > 0, the bracket is unbalanced - skip this match
      }
    }

    return result;
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
