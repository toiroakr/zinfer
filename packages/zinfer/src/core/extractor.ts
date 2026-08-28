import {
  Project,
  SourceFile,
  TypeFormatFlags,
  ts,
  type TypeAliasDeclaration,
  type InterfaceDeclaration,
  type ClassDeclaration,
  type EnumDeclaration,
} from "ts-morph";
import {
  NORMALIZE_TYPE_DEFINITION,
  NORMALIZE_TYPE_NAMES,
  createTempTypeAlias,
  normalizeBrandQualifiers,
} from "./normalizer.js";
import { SchemaDetector } from "./schema-detector.js";
import { GetterResolver } from "./getter-resolver.js";
import { SchemaReferenceAnalyzer, type SchemaReferenceInfo } from "./schema-reference-analyzer.js";
import { ImportResolver, type ImportedSchemaMap } from "./import-resolver.js";
import { escapeRegExp } from "./regexp.js";
import { isEscaped } from "./string-scan.js";
import { resolve, isAbsolute } from "pathe";
import { realpathSync } from "fs";
import { logDebugError } from "./logger.js";
import type {
  ExtractResult,
  FileExtractResult,
  DetectedSchema,
  ExtractOptions,
  ExtractContext,
} from "./types.js";

// Re-export ExtractResult for backward compatibility
export type { ExtractResult } from "./types.js";

/**
 * A schema's printed input/output types, before cross-schema references are
 * resolved into type names.
 */
interface RawSchemaType {
  input: string;
  output: string;
  isExported: boolean;
  /** Set when the schema is declared in another file that generates types of its own. */
  importedFrom?: string;
  /**
   * Set alongside `importedFrom`: the name the declaring file's own generated
   * types are printed under. A local `import { X as Y }` alias has no
   * generated type of its own to point at - only the declaring file's own
   * export name does - so this is what the printed reference and the
   * `import type` both have to use instead of the local alias.
   */
  exportedName?: string;
  /**
   * Set when the schema is recursive and imported from a file that gets no
   * generated types, so the printed type is the closest inlinable approximation
   * rather than what TypeScript gave up on.
   */
  isApproximatedImport?: boolean;
}

/**
 * Where a name usable bare within some file's own scope actually lives -
 * built by `collectFileLocalTypeReferences` and consumed by
 * `promoteBareTypeReferences`/`resolveReferenceOrFallback`.
 */
interface LocalTypeReference {
  /** The file that declares this name (itself, for a same-file entry). */
  file: SourceFile;
  /** Absolute path, without extension, of `file` - only meaningful when `hasValidFallback`. */
  modulePath: string;
  /** The name `file` declares/exports this under (never a local import alias). */
  exportedName: string;
  /**
   * Whether `import("${modulePath}").${exportedName}` is a valid reference
   * to fall back on if expanding this hits a cycle. False only for a
   * same-file declaration that isn't exported - nothing can import it, so
   * a cycle through it has no resolvable form at all.
   */
  hasValidFallback: boolean;
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
  private importedSchemaCache = new Map<string, Omit<RawSchemaType, "isExported">>();

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
    this.importResolver = new ImportResolver(this.schemaDetector);
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
  extractAll(filePath: string, context: ExtractContext = {}): ExtractResult[] {
    const sourceFile = this.getOrAddSourceFile(filePath);
    const schemas = this.schemaDetector.detectExportedSchemas(sourceFile);

    return this.extractMultipleFromSourceFile(sourceFile, schemas, context);
  }

  /**
   * Extracts types from specific schemas in a file.
   *
   * @param filePath - Path to the TypeScript file
   * @param schemaNames - Names of schemas to extract
   * @returns Array of extraction results
   */
  extractMultiple(
    filePath: string,
    schemaNames: string[],
    context: ExtractContext = {},
  ): ExtractResult[] {
    const sourceFile = this.getOrAddSourceFile(filePath);
    const allSchemas = this.schemaDetector.detectExportedSchemas(sourceFile);
    const schemas = schemaNames.map((name) => {
      const found = allSchemas.find((s) => s.name === name);
      return found || { name, isExported: true, line: 0 };
    });

    return this.extractMultipleFromSourceFile(sourceFile, schemas, context);
  }

  /**
   * Extracts types from all exported schemas and returns file-level result.
   *
   * @param filePath - Path to the TypeScript file
   * @returns File extraction result with all schemas
   */
  extractFile(filePath: string, context: ExtractContext = {}): FileExtractResult {
    return {
      filePath,
      schemas: this.extractAll(filePath, context),
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
    context: ExtractContext = {},
  ): ExtractResult[] {
    const results: ExtractResult[] = [];

    // Find and resolve imported schemas
    const importedSchemas = this.importResolver.findImportedSchemas(sourceFile, this.project);

    // Build schema names set including imports. Uses the declared (local
    // variable) name, not the exported name, since analyzeGetterFields and
    // analyzeAllReferences walk actual variable declarations - for an aliased
    // re-export (`export { X as Y }`) those only carry the declared name X.
    const schemaNames = new Set(schemas.map((s) => s.localName ?? s.name));
    for (const localName of importedSchemas.keys()) {
      schemaNames.add(localName);
    }

    // Analyze getter fields for target schemas only
    const getterFieldMap = this.getterResolver.analyzeGetterFields(sourceFile, schemaNames);

    // Analyze cross-schema references and union references in a single pass
    const { references: referenceMap, unionReferences: unionReferenceMap } =
      this.referenceAnalyzer.analyzeAllReferences(sourceFile, schemaNames);

    // First pass: extract raw types for all schemas
    const rawTypes = new Map<string, RawSchemaType>();

    // Inject __Normalize once for the main source file
    this.ensureNormalizeType(sourceFile);

    // Compared canonicalized: the caller's paths come from a glob, while the
    // declaring file's comes from TypeScript, and the two spell the same file
    // differently on Windows.
    const importableFiles = context.importableFiles
      ? new Set([...context.importableFiles].map((filePath) => resolve(filePath)))
      : undefined;

    // A name that would print the same generated identifier as a local
    // schema, or as another import of a same-named schema from a different
    // file, can't be referenced by name here - it is inlined instead.
    const localSchemaNames = new Set(schemas.map((schema) => schema.name));
    const ambiguousImportedNames = this.findAmbiguousImportedNames(
      importedSchemas,
      importableFiles,
      context.generatedSchemaNames,
    );

    // Extract types from imported schemas first
    for (const [localName, importInfo] of importedSchemas) {
      if (!importInfo.resolved) continue;

      // The declaring file's own generated types are named after the
      // schema's own (exported) name, never the importing file's local
      // alias - so a renamed import (`import { X as Y }`) is just as
      // importable as a plain one, as long as that name is generated by the
      // declaring file (respecting a `--schemas` filter) and unambiguous here.
      const isImportable =
        (importableFiles?.has(resolve(importInfo.sourceFilePath)) ?? false) &&
        (!context.generatedSchemaNames ||
          context.generatedSchemaNames.has(importInfo.originalName)) &&
        !localSchemaNames.has(importInfo.originalName) &&
        !ambiguousImportedNames.has(importInfo.originalName);
      // The self-references a recursive schema needs are spelled with the
      // exported name (what the printed reference and `import type` also use
      // - see resolveImportedSchemaType), and what they point at depends on
      // whether the declaring file is generated, so both belong in the cache
      // key alongside the declaration.
      const cacheKey = `${importInfo.sourceFilePath}:${importInfo.originalName}:${isImportable}:${Boolean(context.inlineExternalTypes)}`;
      const cached = this.importedSchemaCache.get(cacheKey);
      if (cached) {
        rawTypes.set(localName, { ...cached, isExported: false });
        continue;
      }

      const importedSourceFile = this.project.getSourceFile(importInfo.sourceFilePath);
      if (!importedSourceFile) continue;

      this.ensureNormalizeType(importedSourceFile);
      try {
        this.injectTemporaryTypes(importedSourceFile, importInfo.originalName);
        const raw = this.resolveImportedSchemaType(
          importedSourceFile,
          importInfo.originalName,
          isImportable,
          context.inlineExternalTypes,
        );

        // Cache the result
        this.importedSchemaCache.set(cacheKey, raw);

        // Use local name as the key (how it's referenced in current file)
        rawTypes.set(localName, { ...raw, isExported: false });
      } catch (error) {
        logDebugError(`Failed to extract imported schema "${localName}"`, error);
      } finally {
        this.cleanupTemporaryTypes(importedSourceFile);
        this.cleanupNormalizeType(importedSourceFile);
      }
    }

    // Extract types from local schemas
    for (const schema of schemas) {
      const { name: schemaName, explicitType, isExported, localName } = schema;
      const declaredName = localName ?? schemaName;

      if (explicitType) {
        this.injectExplicitType(sourceFile, explicitType);
        try {
          const resolvedType = this.resolveType(
            sourceFile,
            "__TempExplicit",
            context.inlineExternalTypes,
          );
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

      this.injectTemporaryTypes(sourceFile, declaredName);
      try {
        let inputType = this.resolveType(sourceFile, "__TempInput", context.inlineExternalTypes);
        let outputType = this.resolveType(sourceFile, "__TempOutput", context.inlineExternalTypes);

        // Resolve getter-based self-references. getterFieldMap is keyed by
        // declared (local variable) name, not the exported name.
        const getterFields = getterFieldMap.get(declaredName);
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

    // Clean up __Normalize from the main source file after all schemas are processed
    this.cleanupNormalizeType(sourceFile);

    const schemasByName = new Map(schemas.map((schema) => [schema.name, schema]));
    // referenceMap/unionReferenceMap entries carry the identifier as written
    // in the source (the declared/local name), which for an aliased
    // re-export (`export { X as Y }`) differs from the exported name `Y`
    // that rawTypes is keyed by. Resolve local name -> exported name so
    // references to `X` are looked up (and rewritten) as `Y`.
    const exportNameByLocalName = new Map(
      schemas
        .filter((schema) => schema.localName)
        .map((schema) => [schema.localName!, schema.name]),
    );
    const resolveExportName = (name: string): string => exportNameByLocalName.get(name) ?? name;
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

      // referenceMap/unionReferenceMap are keyed by declared (local variable)
      // name; schemaName here may be the exported name of an aliased
      // re-export, so re-derive the declared name to look them up.
      const declaredName = schemasByName.get(schemaName)?.localName ?? schemaName;

      let { input, output } = raw;
      const unionRef = unionReferenceMap.get(declaredName);

      const shouldComposeUnion =
        unionRef &&
        unionRef.memberSchemas.length > 0 &&
        (unionRef.memberSchemas.every(
          (member) => rawTypes.get(resolveExportName(member))?.isExported,
        ) ||
          (!unionRef.hasInlineMembers &&
            (unionRef.memberSchemas.some((member) => importedSchemas.has(member)) ||
              unionRef.memberSchemas.some((member) => {
                if (rawTypes.get(resolveExportName(member))?.isExported) return false;
                return (referenceMap.get(member) ?? []).some(
                  (ref) => rawTypes.get(resolveExportName(ref.refSchema))?.isExported,
                );
              }))));

      if (unionRef && shouldComposeUnion) {
        const inputMembers: string[] = [];
        const outputMembers: string[] = [];
        let canComposeUnion = true;

        for (const member of unionRef.memberSchemas) {
          const memberExportName = resolveExportName(member);
          const memberRaw = rawTypes.get(memberExportName);
          if (!memberRaw) continue;

          if (memberRaw.isExported) {
            inputMembers.push(`${memberExportName}Input`);
            outputMembers.push(`${memberExportName}Output`);
            continue;
          }

          const resolvedMember = resolveSchemaTypes(memberExportName);
          if (!resolvedMember) continue;
          if (
            resolvedMember.input.includes(`${memberExportName}Input`) ||
            resolvedMember.output.includes(`${memberExportName}Output`)
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

      const refs = referenceMap.get(declaredName) || [];
      for (const ref of refs) {
        const refExportName = resolveExportName(ref.refSchema);
        const refRaw = rawTypes.get(refExportName);
        if (!refRaw) continue;

        // A schema is referenced by name when this file declares its types, or
        // when another generated file does and they can be imported from
        // there - under the name that file exports it under, which for an
        // aliased import (`import { X as Y }`) differs from the local name
        // the reference is written with here.
        if (refRaw.isExported || refRaw.importedFrom) {
          const printedName = refRaw.exportedName ?? refExportName;
          input = this.replaceSchemaReference(input, ref, refRaw.input, `${printedName}Input`);
          output = this.replaceSchemaReference(output, ref, refRaw.output, `${printedName}Output`);
        } else if (refRaw.isApproximatedImport) {
          // Nothing declares this recursive schema's types, so it stays inlined
          // - but as the approximation, which keeps the index signature or array
          // TypeScript dropped at the recursion point.
          input = this.replaceSchemaReference(input, ref, refRaw.input, refRaw.input);
          output = this.replaceSchemaReference(output, ref, refRaw.output, refRaw.output);
        } else {
          // A plain local schema that gets no generated type of its own (not
          // exported, not imported) still holds its own references to schemas
          // that ARE exported/generated - resolve it first, so an inlined copy
          // keeps pointing at generated types instead of the compiler's raw
          // structural expansion, which this file's own reference map never
          // gets a chance to rewrite on its own (it's only ever printed as
          // part of whatever schema inlines it, never resolved independently).
          const resolvedRef = resolveSchemaTypes(refExportName);
          if (resolvedRef) {
            input = this.replaceSchemaReference(input, ref, refRaw.input, resolvedRef.input);
            output = this.replaceSchemaReference(output, ref, refRaw.output, resolvedRef.output);
          }
        }
      }

      const explicitType = schemasByName.get(schemaName)?.explicitType;
      if (explicitType && this.isLocallyDeclaredType(sourceFile, explicitType)) {
        const escapedTypeName = escapeRegExp(explicitType);
        const typeNamePattern = new RegExp(`\\b${escapedTypeName}\\b`, "g");
        // When the resolved type is exactly the explicit identifier (as
        // opposed to appearing inside a larger composite type, e.g. a
        // recursive union member), rewriting it to `<schema>Input`/`Output`
        // would produce a circular alias like `type FooInput = FooInput`.
        // Reference the declaration through its source file instead, so the
        // generated output doesn't print a bare identifier it never imports.
        if (input === explicitType) {
          input = this.qualifyLocalTypeReference(sourceFile, explicitType) ?? input;
        } else {
          input = input.replace(typeNamePattern, `${schemaName}Input`);
        }
        if (output === explicitType) {
          output = this.qualifyLocalTypeReference(sourceFile, explicitType) ?? output;
        } else {
          output = output.replace(typeNamePattern, `${schemaName}Output`);
        }
      }

      resolvingSchemas.delete(schemaName);
      const resolved = { input, output };
      resolvedTypes.set(schemaName, resolved);
      return resolved;
    };

    // Add imported schemas to results first (so they're defined before use).
    // Named by the declaring file's own export (falling back to the local
    // name when it isn't importable) - the name typeNameMap/import lines are
    // built from, matching what printed references now use above.
    for (const [localName] of importedSchemas) {
      const raw = rawTypes.get(localName);
      if (!raw) continue;

      results.push({
        schemaName: raw.exportedName ?? localName,
        input: raw.input,
        output: raw.output,
        isExported: false, // Imported schemas are not re-exported
        ...(raw.importedFrom ? { importedFrom: raw.importedFrom } : {}),
      });
    }

    // Second pass: replace cross-schema references with type names
    for (const schema of schemas) {
      const schemaName = schema.name;
      const raw = rawTypes.get(schemaName);
      if (!raw) continue;

      const resolved = resolveSchemaTypes(schemaName);
      if (!resolved) continue;

      results.push({
        schemaName,
        input: resolved.input,
        output: resolved.output,
        isExported: raw.isExported,
      });
    }

    return results;
  }

  /**
   * Replaces an inline schema reference with a type name.
   *
   * A reference is recorded under the bare name of the field holding it, which
   * a nested field elsewhere in the printed type may share. Every occurrence of
   * the name is therefore scored by how much its printed value looks like the
   * referenced schema, and only the best one is rewritten - the schema's own
   * printed shape beats an unrelated field that merely happens to be inlined or
   * to have been given up on.
   */
  private replaceSchemaReference(
    typeStr: string,
    ref: SchemaReferenceInfo,
    refTypeStr: string,
    refTypeName: string,
  ): string {
    const { fieldPath, isArray, isRecord } = ref;

    const best = this.findReferenceOccurrence(typeStr, fieldPath, refTypeStr);
    if (!best) return typeStr;

    const { valueStart, valueEnd, currentValue, printedArray } = best;

    // Build the replacement type from what the reference's AST says, falling
    // back to what the printed placeholder said when the AST is less specific.
    let replacement: string;
    if (isRecord) {
      replacement = `{ [x: string]: ${refTypeName}; }`;
    } else if (isArray || printedArray) {
      replacement = `${this.asArrayElement(refTypeName)}[]`;
    } else {
      replacement = refTypeName;
    }

    // Preserve readonly prefix for arrays
    if (isArray && currentValue.startsWith("readonly ")) {
      replacement = `readonly ${replacement}`;
    }

    return typeStr.substring(0, valueStart) + replacement + typeStr.substring(valueEnd);
  }

  /**
   * Finds the occurrence of `fieldPath` whose printed value best matches the
   * referenced schema, or undefined when no occurrence looks like the reference.
   */
  private findReferenceOccurrence(
    typeStr: string,
    fieldPath: string,
    refTypeStr: string,
  ):
    | { valueStart: number; valueEnd: number; currentValue: string; printedArray: boolean }
    | undefined {
    const pattern = new RegExp(`${escapeRegExp(fieldPath)}\\??: `, "g");
    let best:
      | { valueStart: number; valueEnd: number; currentValue: string; printedArray: boolean }
      | undefined;
    let bestScore = 0;

    for (const match of typeStr.matchAll(pattern)) {
      const valueStart = match.index + match[0].length;
      const valueEnd = findReferenceValueEnd(typeStr, valueStart);
      const currentValue = typeStr.substring(valueStart, valueEnd).trim();

      // Handle: { ... }, readonly { ... }[], SomeType, etc.
      const valueToCheck = currentValue
        .replace(/^readonly\s+/, "")
        .replace(/\[\]$/, "")
        .trim();

      // A reference to a schema TypeScript itself gave up on - a recursive one
      // whose getter carries no annotation - prints as a bare placeholder rather
      // than an expanded shape. The field is known to hold that schema, so the
      // name says strictly more than the placeholder does. It is the weakest
      // signal of the three, since a placeholder says nothing about the schema.
      const placeholder = /^(?:readonly\s+)?(?:any|unknown)(\[\])?(?:\s*\|\s*undefined)?$/.exec(
        currentValue,
      );

      let score = 0;
      if (valueToCheck === refTypeStr) score = 3;
      else if (valueToCheck.startsWith("{") || currentValue.includes("[x: string]:")) score = 2;
      else if (placeholder) score = 1;

      if (score > bestScore) {
        bestScore = score;
        best = { valueStart, valueEnd, currentValue, printedArray: placeholder?.[1] === "[]" };
      }
    }

    return best;
  }

  /**
   * Parenthesizes an inline type so that wrapping it in `[]` keeps its meaning.
   * A named reference needs nothing; an approximation that prints as a union
   * would otherwise bind `[]` to its last member alone.
   */
  private asArrayElement(refTypeName: string): string {
    return hasTopLevelUnion(refTypeName) ? `(${refTypeName})` : refTypeName;
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
        skipFileDependencyResolution: true,
      });
    }

    return new Project({
      skipFileDependencyResolution: true,
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
   * Injects the __Normalize type definition into a source file if not already present.
   */
  private ensureNormalizeType(sourceFile: SourceFile): void {
    if (!sourceFile.getTypeAlias("__Normalize")) {
      sourceFile.addStatements([NORMALIZE_TYPE_DEFINITION]);
    }
  }

  /**
   * Removes the __Normalize type definition from a source file.
   */
  private cleanupNormalizeType(sourceFile: SourceFile): void {
    for (const name of NORMALIZE_TYPE_NAMES) {
      const typeAlias = sourceFile.getTypeAlias(name);
      if (typeAlias) {
        typeAlias.remove();
      }
    }
  }

  /**
   * Injects temporary type aliases into the source file.
   * The __Normalize type must already be present (via ensureNormalizeType).
   * These are added in-memory only and never saved to disk.
   */
  private injectTemporaryTypes(sourceFile: SourceFile, schemaName: string): void {
    sourceFile.addStatements([
      createTempTypeAlias(schemaName, "input"),
      createTempTypeAlias(schemaName, "output"),
    ]);
  }

  /**
   * Resolves a type alias and returns its fully expanded string representation.
   */
  private resolveType(
    sourceFile: SourceFile,
    typeName: string,
    inlineExternalTypes = false,
  ): string {
    const typeAlias = sourceFile.getTypeAlias(typeName);
    if (!typeAlias) {
      throw new Error(`Failed to find type alias: ${typeName}`);
    }

    const type = typeAlias.getType();
    let rawType = type.getText(typeAlias, this.typeTextFormatFlags());
    rawType = this.trimPrintedType(rawType);

    // The printer synthesizes `import("...")` references for named types
    // declared in another file that isn't otherwise visible at this print
    // location. It prints these already relative - but relative to this
    // source file's directory, not the eventual output file. Rebase them to
    // absolute here so relativizeImportPaths (which only rewrites absolute
    // paths) can correctly recompute them relative to the real output path.
    rawType = this.absolutizeImportPaths(rawType, sourceFile.getDirectoryPath());

    // Expand enum types: if the type is a single identifier, check if it's an enum
    if (/^[A-Z][a-zA-Z0-9]*$/.test(rawType)) {
      const enumDecl = sourceFile.getEnum(rawType);
      if (enumDecl) {
        rawType = this.printEnumAsLiteralUnion(enumDecl) ?? rawType;
      }
    }

    if (inlineExternalTypes) {
      rawType = this.inlineExternalTypeReferences(rawType, new Set());
    }

    // Post-process to simplify Zod internal function types and canonicalize
    // printed brand qualifiers
    return normalizeBrandQualifiers(this.simplifyZodFunctionTypes(rawType));
  }

  /**
   * The shared TypeFormatFlags for every printed type in this file: fully
   * expanded (no truncation), without widening named aliases (which is what
   * lets a same-file enum print as a bare identifier for the expansion right
   * below to catch, instead of being expanded away already).
   */
  private typeTextFormatFlags(): TypeFormatFlags {
    return TypeFormatFlags.NoTruncation | TypeFormatFlags.InTypeAlias;
  }

  /**
   * Removes trailing spaces ts-morph 27+ may add to printed type text.
   * Skips split/map/join for single-line types (most common case).
   */
  private trimPrintedType(rawType: string): string {
    if (!rawType.includes("\n")) {
      return rawType.trimEnd();
    }
    return rawType
      .split("\n")
      .map((line) => line.trimEnd())
      .join("\n");
  }

  /**
   * Rewrites relative `import("...")` specifiers in printed type text to
   * absolute paths, using `sourceDir` as the base. The printer emits these
   * relative to the file the type was read from - not the eventual output
   * file - so this is the form `relativizeImportPaths` (which only rewrites
   * absolute paths) can correctly re-anchor later.
   *
   * `sourceDir` is realpath'd first: it always exists (a file was just read
   * from it), and on a symlinked working directory (e.g. macOS's
   * `/var` -> `/private/var` tmpdir) leaving it un-resolved here would
   * produce an absolute path on a different symlink base than the output
   * directory `relativizeImportPaths` later resolves against, corrupting the
   * relative path between the two.
   */
  private absolutizeImportPaths(rawType: string, sourceDir: string): string {
    if (!rawType.includes('import("')) return rawType;
    const resolvedSourceDir = realpathSync(sourceDir);
    return rawType.replace(/import\("([^"]+)"\)/g, (match, importPath: string) => {
      if (!importPath.startsWith(".")) return match;
      return `import("${resolve(resolvedSourceDir, importPath)}")`;
    });
  }

  /**
   * Prints an enum declaration's members as a literal union, e.g.
   * `"a" | "b"`. Returns undefined when the enum has no members, or when
   * any member's value can't be statically resolved (e.g. initialized from
   * a function call) - printing a union missing that member would be
   * narrower than the enum itself and reject a value the enum actually
   * allows, which is worse than not expanding it at all.
   */
  private printEnumAsLiteralUnion(enumDecl: EnumDeclaration): string | undefined {
    const values: string[] = [];
    for (const member of enumDecl.getMembers()) {
      const value = member.getValue();
      if (typeof value === "string") values.push(`"${value}"`);
      else if (typeof value === "number") values.push(value.toString());
      else return undefined;
    }

    return values.length > 0 ? values.join(" | ") : undefined;
  }

  /**
   * Replaces `import("path").TypeName` references to a plain (non-schema)
   * type declared in another file with that type's own structure, so the
   * generated output no longer depends on the original file layout.
   *
   * `visiting` tracks the `file#TypeName` pairs currently being expanded in
   * this call chain. A reference that would revisit one of them - a type
   * that (directly or through another file) refers back to itself - is left
   * as `import(...)` at that point instead of recursing forever; everything
   * that isn't part of the cycle is still fully expanded.
   *
   * Scoped to plain types only: a reference this can't resolve to a
   * `type`/`interface`/`enum` declaration (a class, a renamed/default
   * export, or anything else `resolveExternalTypeReference` gives up on) is
   * left as `import(...)` unchanged - the same safe fallback the
   * `degenerate-explicit-type` fixtures already rely on for local types.
   *
   * Only `import("path").Name` on its own is expanded - `import("path")
   * .Name.Member` (a qualified name, e.g. an enum member) or
   * `import("path").Name<Args>` (a generic instantiation) is left as-is:
   * substituting only `Name` would strand `.Member`/`<Args>` against
   * whatever replaces it. The identifier after the dot is found by a plain
   * character scan, not a regex lookahead - a backtracking engine can
   * satisfy `(?!\s*<)` by giving back characters (matching `Bo` instead of
   * `Box` when `Box<string>` follows), which a scan never does.
   */
  private inlineExternalTypeReferences(rawType: string, visiting: Set<string>): string {
    if (!rawType.includes('import("')) return rawType;

    const importPrefix = /import\("([^"]+)"\)\./g;
    let result = "";
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = importPrefix.exec(rawType))) {
      const modulePath = match[1];
      const nameStart = match.index + match[0].length;

      let nameEnd = nameStart;
      while (nameEnd < rawType.length && /[A-Za-z0-9_$]/.test(rawType[nameEnd])) nameEnd++;
      const typeName = rawType.slice(nameStart, nameEnd);

      result += rawType.slice(lastIndex, match.index);

      const nextChar = rawType[nameEnd];
      // `typeof import("...").Name` is a valid type query pointing at a
      // value, not a type - `typeof` followed by Name's expanded structure
      // (`typeof { ... }`) is not valid syntax at all. The printer always
      // normalizes to exactly one space after `typeof`.
      const isTypeQuery = rawType.slice(0, match.index).endsWith("typeof ");
      const isQualifiedOrGeneric = nextChar === "." || nextChar === "<";
      const targetFile =
        isQualifiedOrGeneric || isTypeQuery ? undefined : this.resolveModuleSourceFile(modulePath);

      result += targetFile
        ? this.resolveOrKeepImportText(
            targetFile,
            typeName,
            rawType.slice(match.index, nameEnd),
            visiting,
          )
        : rawType.slice(match.index, nameEnd);

      lastIndex = nameEnd;
      importPrefix.lastIndex = nameEnd;
    }

    result += rawType.slice(lastIndex);
    return result;
  }

  /**
   * The `import("path").Name` matched-text branch of `inlineExternalTypeReferences`:
   * expand `typeName` in `targetFile`, or fall back to `originalText`
   * unchanged (on a cycle, or when it isn't a plain type declaration).
   */
  private resolveOrKeepImportText(
    targetFile: SourceFile,
    typeName: string,
    originalText: string,
    visiting: Set<string>,
  ): string {
    const key = `${targetFile.getFilePath()}#${typeName}`;
    if (visiting.has(key)) return originalText;

    visiting.add(key);
    try {
      const expanded = this.resolveExternalTypeReference(targetFile, typeName, visiting);
      if (expanded === undefined) return originalText;
      return this.hasTopLevelUnionOrIntersection(expanded) ? `(${expanded})` : expanded;
    } finally {
      visiting.delete(key);
    }
  }

  /**
   * Looks up `typeName` as a type alias, interface, or enum declared in
   * `targetFile` and returns its expanded structure - recursing into any
   * further external references it carries. Returns undefined when
   * `typeName` isn't one of those (a class, or an export this couldn't
   * match by its declared name), leaving the caller's `import(...)` as-is.
   */
  private resolveExternalTypeReference(
    targetFile: SourceFile,
    typeName: string,
    visiting: Set<string>,
  ): string | undefined {
    const typeAlias = targetFile.getTypeAlias(typeName);
    if (typeAlias) {
      return this.expandExternalDeclaration(targetFile, typeAlias, visiting);
    }

    const iface = targetFile.getInterface(typeName);
    if (iface) {
      return this.expandExternalDeclaration(targetFile, iface, visiting);
    }

    const enumDecl = targetFile.getEnum(typeName);
    if (enumDecl) {
      return this.printEnumAsLiteralUnion(enumDecl);
    }

    return undefined;
  }

  /**
   * Prints a type alias's or interface's own structure and recurses into
   * whatever further references it carries - both the `import("...")`
   * TypeScript itself synthesizes for names invisible from `targetFile`,
   * and the bare names of anything that *is* visible there (its own
   * same-file declarations, or types it imports for its own use). The
   * latter print exactly like any other in-scope identifier - correct
   * only inside `targetFile` itself - so `promoteBareTypeReferences` has
   * to turn them into the same explicit, resolvable form before this text
   * is embedded anywhere else.
   */
  private expandExternalDeclaration(
    targetFile: SourceFile,
    declaration: TypeAliasDeclaration | InterfaceDeclaration,
    visiting: Set<string>,
  ): string {
    let text = declaration.getType().getText(declaration, this.typeTextFormatFlags());
    text = this.trimPrintedType(text);
    text = this.absolutizeImportPaths(text, targetFile.getDirectoryPath());
    text = this.promoteBareTypeReferences(text, targetFile, visiting);
    return this.inlineExternalTypeReferences(text, visiting);
  }

  /**
   * Replaces bare identifiers in `text` - printed type text read from
   * `targetFile`, valid only within its own scope - with an explicit,
   * resolvable reference: either the fully expanded structure of the type
   * they name, or (only on a cycle, and only when that type is exported
   * from wherever it's declared) an `import("...")` pointing at it.
   *
   * A same-file declaration that isn't exported has no importable name to
   * fall back to - a cycle through one is left as the bare identifier,
   * same documented limitation as `nonexported-explicit-type-schema.ts`.
   */
  private promoteBareTypeReferences(
    text: string,
    targetFile: SourceFile,
    visiting: Set<string>,
  ): string {
    const references = this.collectFileLocalTypeReferences(targetFile);
    if (references.size === 0) return text;

    let result = "";
    let quote: string | undefined;
    let i = 0;

    while (i < text.length) {
      const char = text[i];

      if (quote) {
        result += char;
        if (char === quote && !isEscaped(text, i)) quote = undefined;
        i++;
        continue;
      }

      if (char === '"' || char === "'" || char === "`") {
        quote = char;
        result += char;
        i++;
        continue;
      }

      if (/[A-Za-z_$]/.test(char)) {
        let end = i + 1;
        while (end < text.length && /[A-Za-z0-9_$]/.test(text[end])) end++;
        const word = text.slice(i, end);

        const precededByDot = i > 0 && text[i - 1] === ".";
        // The checker prints a property key as `name:`/`name?:` with no
        // space before the colon - a bare type reference never precedes a
        // colon this way (a conditional type's ` ? ` / ` : ` both carry a
        // space), so this is how the two are told apart without a parser.
        const nextChar = text[end];
        const isPropertyKey = nextChar === ":" || (nextChar === "?" && text[end + 1] === ":");
        // A method signature's name (`Name(): T`) is not a type reference
        // at all - substituting it would corrupt the method's own name,
        // not a type. `(` never otherwise directly follows a bare type
        // reference this scan produces.
        const isMethodName = nextChar === "(";
        // `Name.Member` (a qualified name, e.g. an enum member) or
        // `Name<Args>` (a generic instantiation): substituting only `Name`
        // would strand `.Member`/`<Args>` against whatever replaces it.
        // `import("...").Name` keeps both suffixes valid; expanding Name's
        // own structure in place would not, so this reference is only ever
        // qualified, never expanded.
        const isQualifiedOrGeneric = nextChar === "." || nextChar === "<";
        // `typeof Name` is a type query pointing at a value, not a type -
        // `typeof` followed by Name's expanded structure (`typeof { ... }`)
        // isn't valid syntax at all, so this can only ever be qualified.
        const isTypeQuery = result.endsWith("typeof ");

        const reference = references.get(word);
        result +=
          reference && !precededByDot && !isPropertyKey && !isMethodName
            ? isQualifiedOrGeneric || isTypeQuery
              ? this.referenceFallbackText(reference, word)
              : this.resolveReferenceOrFallback(reference, word, visiting)
            : word;
        i = end;
        continue;
      }

      result += char;
      i++;
    }

    return result;
  }

  /**
   * Resolves one entry from `collectFileLocalTypeReferences`: expands it
   * (recursing, with the same cycle handling as `inlineExternalTypeReferences`),
   * or - on a cycle - falls back to an `import(...)` reference if one is
   * valid, else the original bare identifier.
   */
  private resolveReferenceOrFallback(
    reference: LocalTypeReference,
    word: string,
    visiting: Set<string>,
  ): string {
    const key = `${reference.file.getFilePath()}#${reference.exportedName}`;
    const fallback = this.referenceFallbackText(reference, word);

    if (visiting.has(key)) return fallback;

    visiting.add(key);
    try {
      const expanded = this.resolveExternalTypeReference(
        reference.file,
        reference.exportedName,
        visiting,
      );
      if (expanded === undefined) return fallback;
      return this.hasTopLevelUnionOrIntersection(expanded) ? `(${expanded})` : expanded;
    } finally {
      visiting.delete(key);
    }
  }

  /**
   * The safe, non-expanding text for a reference: an `import(...)` pointing
   * at it if one is valid, else the original bare identifier unchanged.
   */
  private referenceFallbackText(reference: LocalTypeReference, word: string): string {
    return reference.hasValidFallback
      ? `import("${reference.modulePath}").${reference.exportedName}`
      : word;
  }

  /**
   * Maps every name usable bare within `targetFile`'s own scope - its own
   * exported or non-exported type/interface/enum declarations, and named
   * imports of the same (default and namespace imports aren't tracked;
   * a bare reference through either is left untouched, the same fallback
   * as an unresolvable one) - to where it actually lives.
   */
  private collectFileLocalTypeReferences(targetFile: SourceFile): Map<string, LocalTypeReference> {
    const references = new Map<string, LocalTypeReference>();
    const selfModulePath = this.modulePathFor(targetFile);

    const addLocal = (name: string, isExported: boolean): void => {
      references.set(name, {
        file: targetFile,
        modulePath: selfModulePath,
        exportedName: name,
        hasValidFallback: isExported,
      });
    };

    for (const typeAlias of targetFile.getTypeAliases()) {
      addLocal(typeAlias.getName(), typeAlias.isExported());
    }
    for (const iface of targetFile.getInterfaces()) {
      addLocal(iface.getName(), iface.isExported());
    }
    for (const enumDecl of targetFile.getEnums()) {
      addLocal(enumDecl.getName(), enumDecl.isExported());
    }

    for (const importDecl of targetFile.getImportDeclarations()) {
      const moduleSourceFile = importDecl.getModuleSpecifierSourceFile();
      if (!moduleSourceFile) continue;

      const modulePath = this.modulePathFor(moduleSourceFile);
      for (const namedImport of importDecl.getNamedImports()) {
        const localName = namedImport.getAliasNode()?.getText() ?? namedImport.getName();
        references.set(localName, {
          file: moduleSourceFile,
          modulePath,
          exportedName: namedImport.getName(),
          hasValidFallback: true,
        });
      }
    }

    return references;
  }

  /**
   * Resolves a printed `import("...")` module specifier to the `SourceFile`
   * it points at, trying each extension TypeScript itself would resolve.
   * Loads the file into the shared project on demand so a type declared
   * there can be read the same way as any file passed to `extractAll`.
   *
   * Only an absolute specifier is probed as a filesystem path.
   * `absolutizeImportPaths` already makes every relative specifier
   * (`./...`) TypeScript prints absolute, so a non-absolute one here is a
   * bare package specifier (`import("zod").Foo`) - treating `zod` as a
   * relative filename could accidentally resolve to an unrelated same-named
   * file the caller never intended to reach.
   */
  private resolveModuleSourceFile(modulePath: string): SourceFile | undefined {
    if (!isAbsolute(modulePath)) return undefined;

    for (const ext of [".ts", ".tsx", ".mts", ".cts", ".d.ts", ".d.mts", ".d.cts"]) {
      const candidate = `${modulePath}${ext}`;
      const sourceFile =
        this.project.getSourceFile(candidate) ??
        this.project.addSourceFileAtPathIfExists(candidate);
      if (sourceFile) return sourceFile;
    }
    return undefined;
  }

  /**
   * Whether `typeText` has a `|` or `&` outside any bracket/quote nesting -
   * a top-level union or intersection that would bind incorrectly if the
   * caller appends a suffix like `[]` without wrapping it in parens first.
   */
  private hasTopLevelUnionOrIntersection(typeText: string): boolean {
    let depth = 0;
    let quote: string | undefined;

    for (let i = 0; i < typeText.length; i++) {
      const char = typeText[i];

      if (quote) {
        if (char === quote && !isEscaped(typeText, i)) quote = undefined;
        continue;
      }

      if (char === '"' || char === "'" || char === "`") {
        quote = char;
      } else if (char === "{" || char === "(" || char === "[" || char === "<") {
        depth++;
      } else if (char === "}" || char === ")" || char === "]") {
        depth--;
      } else if (char === ">") {
        // The `>` of an arrow function type's `=>` never opened a matching
        // `<` - counting it would desync depth tracking for the rest of the
        // string, hiding (or inventing) a top-level union/intersection.
        if (typeText[i - 1] !== "=") depth--;
      } else if (depth === 0 && (char === "|" || char === "&")) {
        return true;
      }
    }

    return false;
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
   * Resolves an imported schema's printed types, including its own recursion.
   *
   * The getters of an imported schema live in the file that declares it, so its
   * recursion has to be resolved against that file. What the recursion points at
   * depends on whether the declaring file gets generated types of its own: if it
   * does, the self-reference is the type name the importing file will `import
   * type`; if it does not, there is no name to point at, and the recursion is
   * left as an `any` - widened to the index signature / array the getter
   * describes, so property access stays type-checked - with the inline copy
   * around it kept for whatever detail it still carries.
   */
  private resolveImportedSchemaType(
    importedSourceFile: SourceFile,
    originalName: string,
    isImportable: boolean,
    inlineExternalTypes = false,
  ): Omit<RawSchemaType, "isExported"> {
    const inputType = this.resolveType(importedSourceFile, "__TempInput", inlineExternalTypes);
    const outputType = this.resolveType(importedSourceFile, "__TempOutput", inlineExternalTypes);

    const getterFields = this.getterResolver
      .analyzeGetterFields(importedSourceFile, new Set([originalName]))
      .get(originalName);

    if (!getterFields || !this.getterResolver.hasSelfReferences(getterFields)) {
      return { input: inputType, output: outputType };
    }

    const resolveOptions = { collapseInlinedCopies: isImportable };
    return {
      // Named after the declaring file's own export (never a local import
      // alias): that is what the printed reference and `import type` at the
      // call site also use, so the recursion point matches them exactly
      // instead of pointing at a name nothing declares.
      input: this.getterResolver.resolveAnyTypes(
        inputType,
        getterFields,
        isImportable ? `${originalName}Input` : "any",
        resolveOptions,
      ),
      output: this.getterResolver.resolveAnyTypes(
        outputType,
        getterFields,
        isImportable ? `${originalName}Output` : "any",
        resolveOptions,
      ),
      ...(isImportable
        ? { importedFrom: importedSourceFile.getFilePath(), exportedName: originalName }
        : { isApproximatedImport: true }),
    };
  }

  /**
   * Names among this file's importable candidates that would collide if
   * referenced by name: the same exported name imported from two different
   * files would print (and `import type`) the same generated identifier for
   * two unrelated schemas.
   */
  private findAmbiguousImportedNames(
    importedSchemas: ImportedSchemaMap,
    importableFiles: ReadonlySet<string> | undefined,
    generatedSchemaNames: ReadonlySet<string> | undefined,
  ): Set<string> {
    const sourceByName = new Map<string, string>();
    const ambiguous = new Set<string>();

    for (const importInfo of importedSchemas.values()) {
      if (!importInfo.resolved) continue;
      // Canonicalized once and reused below: two import resolutions can spell
      // the same file differently (see the importableFiles comment above).
      const sourceFilePath = resolve(importInfo.sourceFilePath);
      if (!importableFiles?.has(sourceFilePath)) continue;
      if (generatedSchemaNames && !generatedSchemaNames.has(importInfo.originalName)) continue;

      const knownSource = sourceByName.get(importInfo.originalName);
      if (knownSource !== undefined && knownSource !== sourceFilePath) {
        ambiguous.add(importInfo.originalName);
        continue;
      }
      sourceByName.set(importInfo.originalName, sourceFilePath);
    }

    return ambiguous;
  }

  /**
   * Removes the temporary input/output types that were injected during extraction.
   * Does not remove __Normalize (managed separately via ensureNormalizeType/cleanupNormalizeType).
   */
  private cleanupTemporaryTypes(sourceFile: SourceFile): void {
    for (const name of ["__TempInput", "__TempOutput"] as const) {
      const typeAlias = sourceFile.getTypeAlias(name);
      if (typeAlias) {
        typeAlias.remove();
      }
    }
  }

  /**
   * Checks if a string is a valid TypeScript identifier.
   * Used to determine if a type name can be safely used in regex replacement.
   */
  private isValidIdentifier(str: string): boolean {
    return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(str);
  }

  /**
   * Returns the type alias, interface, or class declaration for `typeName`
   * in `sourceFile`, or undefined if it isn't declared there (e.g. a global
   * type like `Function`, or a type merely imported into the file).
   */
  private getLocalTypeDeclaration(
    sourceFile: SourceFile,
    typeName: string,
  ): TypeAliasDeclaration | InterfaceDeclaration | ClassDeclaration | undefined {
    if (!this.isValidIdentifier(typeName)) return undefined;
    return (
      sourceFile.getTypeAlias(typeName) ??
      sourceFile.getInterface(typeName) ??
      sourceFile.getClass(typeName)
    );
  }

  /**
   * Checks if a type name is declared in the given source file (as opposed to
   * a global type). Rewriting an explicit annotation's type name to the
   * generated `<schema>Input`/`<schema>Output` alias is only safe for
   * locally declared types - rewriting a global name like `Function`
   * produces a self-referential alias.
   */
  private isLocallyDeclaredType(sourceFile: SourceFile, typeName: string): boolean {
    return this.getLocalTypeDeclaration(sourceFile, typeName) !== undefined;
  }

  /**
   * When an explicit annotation resolves to exactly a locally declared
   * class/interface/type (not a composite type it merely appears inside),
   * rewriting it to `<schema>Input`/`<schema>Output` would produce a
   * circular alias like `type FooInput = FooInput`. Printing the bare
   * identifier instead is also wrong, since the generated declaration file
   * never imports it. Reference it via an inline `import("...")` type
   * instead - this also sidesteps name collisions in `--outFile` mode,
   * where multiple source files are combined into one output and a name
   * like `LocalClass` could collide across files.
   *
   * The member accessed on the `import(...)` must be the name the module
   * actually exports the declaration under, which isn't always `typeName`:
   * a default export (`export default class LocalClass {}`) is reachable
   * only as `.default`, and a renamed export (`export { LocalClass as Foo
   * }`) only as `.Foo`. `getExportedDeclarations()` is keyed by that
   * external name, so find the key whose declarations include this one.
   * Returns null (falling back to the bare, still-broken identifier) when
   * the declaration isn't exported under any name.
   */
  private qualifyLocalTypeReference(sourceFile: SourceFile, typeName: string): string | null {
    const declaration = this.getLocalTypeDeclaration(sourceFile, typeName);
    if (!declaration) return null;

    const exportedName = [...sourceFile.getExportedDeclarations()].find(([, declarations]) =>
      declarations.includes(declaration),
    )?.[0];
    if (!exportedName) return null;

    return `import("${this.modulePathFor(sourceFile)}").${exportedName}`;
  }

  /**
   * The module specifier form of a file's own path: absolute, without a
   * source extension, matching what TypeScript itself prints inside a
   * synthesized `import("...")` type and what `resolveModuleSourceFile`
   * resolves back from - so a type reached either way lands on the same
   * cycle-detection key.
   */
  private modulePathFor(sourceFile: SourceFile): string {
    return sourceFile.getFilePath().replace(/\.d\.(ts|mts|cts)$|\.(ts|tsx|mts|cts)$/, "");
  }
}

/**
 * Finds where a referenced field's printed type ends, tracking nesting and
 * string literals.
 */
function findReferenceValueEnd(typeStr: string, valueStart: number): number {
  let depth = 0;
  let index = valueStart;
  let inString = false;
  let stringChar = "";

  while (index < typeStr.length) {
    const char = typeStr[index];

    if ((char === '"' || char === "'" || char === "`") && !isEscaped(typeStr, index)) {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
        stringChar = "";
      }
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
    index++;
  }

  return index;
}

/**
 * Checks whether a printed type is a union or intersection at its top level,
 * which is what decides whether it can carry a `[]` suffix on its own.
 */
function hasTopLevelUnion(typeStr: string): boolean {
  let depth = 0;

  for (let index = 0; index < typeStr.length; index++) {
    const char = typeStr[index];
    if (char === "{" || char === "[" || char === "(" || char === "<") {
      depth++;
    } else if (char === "}" || char === "]" || char === ")" || char === ">") {
      depth--;
    } else if ((char === "|" || char === "&") && depth === 0) {
      return true;
    }
  }

  return false;
}
