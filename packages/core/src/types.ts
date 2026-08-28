/**
 * Shared type definitions for the schema-library-agnostic core.
 */

/**
 * Options for extracting a single schema's types.
 */
export interface ExtractOptions {
  /** Absolute or relative path to the TypeScript file containing the schema */
  filePath: string;
  /** Name of the exported schema (e.g., "UserSchema") */
  schemaName: string;
  /** Optional path to tsconfig.json for project configuration */
  tsconfigPath?: string;
}

/**
 * Extra context that lets extraction reach beyond the file being processed.
 */
export interface ExtractContext {
  /**
   * Absolute paths of the files that get generated types of their own.
   *
   * A recursive schema imported from one of them is referenced by name rather
   * than inlined - an inline copy of a recursive type can only ever be an
   * approximation - leaving the caller to `import type` it. Schemas from files
   * outside this set are inlined as before.
   *
   * Paths are compared canonicalized, so a caller's separators do not have to
   * match the spelling TypeScript reports for the same file.
   */
  importableFiles?: ReadonlySet<string>;
  /**
   * Schema names actually generated for this run (e.g. from `--schemas`).
   * A schema outside this set is never declared by its own file either, so
   * referencing it by name would point at a declaration that doesn't exist -
   * it is inlined instead. Undefined means every schema in an importable file
   * is generated.
   *
   * Only zinfer's extractor currently honors this field for precision;
   * vinfer's extractor ignores it and instead omits `importableFiles`
   * entirely whenever a schema filter is active.
   */
  generatedSchemaNames?: ReadonlySet<string>;
  /**
   * When an explicit type annotation's referenced type reaches a plain
   * (non-schema) type declared in another file, TypeScript's printer
   * synthesizes an `import("...").Name` reference to it rather than
   * expanding it in place - there is nothing else to point at from this
   * print location. Setting this replaces that reference with the
   * referenced type's own structure instead, recursively, so the generated
   * output carries no dependency on the original file layout. A reference
   * that would recurse into itself (directly or through another file) is
   * left as `import(...)` at the point it would cycle.
   */
  inlineExternalTypes?: boolean;
}

/**
 * Information about a detected schema in a source file.
 */
export interface DetectedSchema {
  /** Variable name of the schema */
  name: string;
  /**
   * Identifier the schema is actually declared under in the source file.
   *
   * Differs from `name` for aliased re-exports (`export { XSchema as YSchema }`),
   * where the type must still be read from the original declaration.
   */
  localName?: string;
  /** Whether the schema is exported */
  isExported: boolean;
  /** Line number where the schema is defined */
  line: number;
  /** Explicit type annotation if present */
  explicitType?: string;
  /** JSDoc comment if present */
  jsDoc?: string;
}

/**
 * A field-level description extracted from a schema.
 */
export interface FieldDescription {
  /** Field path (e.g., "user.name" for nested fields) */
  path: string;
  /** Description text */
  description: string;
}

/**
 * Result of extracting types from a single schema.
 */
export interface ExtractResult {
  /** Name of the schema */
  schemaName: string;
  /** Extracted input type as string */
  input: string;
  /** Extracted output type as string */
  output: string;
  /** Whether the original schema was exported */
  isExported: boolean;
  /**
   * Absolute path of the file declaring the schema, when it lives in another
   * file and the types generated for it are referenced by name instead of being
   * inlined. The generated file has to `import type` them from there.
   */
  importedFrom?: string;
  /** Schema-level description */
  description?: string;
  /** Field descriptions */
  fieldDescriptions?: FieldDescription[];
}

/**
 * Result of extracting types from a single file with multiple schemas.
 */
export interface FileExtractResult {
  /** Path to the source file */
  filePath: string;
  /** Extracted schemas */
  schemas: ExtractResult[];
}

/**
 * Mapped type names for a schema.
 */
export interface MappedTypeName {
  /** Original schema name */
  originalName: string;
  /** Generated input type name */
  inputName: string;
  /** Generated output type name */
  outputName: string;
  /** Unified name (when input === output) */
  unifiedName: string;
}

/**
 * Options for name mapping.
 */
export interface NameMappingOptions {
  /** Suffix to remove from schema names (e.g., "Schema") */
  removeSuffix?: string;
  /** Suffix to add for input types (default: "Input") */
  inputSuffix?: string;
  /** Suffix to add for output types (default: "Output") */
  outputSuffix?: string;
  /** Custom name mappings */
  customMap?: Record<string, string>;
}

/**
 * Options for output generation.
 */
export interface OutputOptions {
  /** Output directory */
  outDir?: string;
  /** Single output file path */
  outFile?: string;
  /** Output file naming pattern (e.g., "[name].types.ts") */
  outPattern?: string;
  /** Generate .d.ts declaration files */
  declaration?: boolean;
}

/**
 * Generated file information.
 */
export interface GeneratedFile {
  /** Output file path */
  path: string;
  /** File content */
  content: string;
}

/**
 * Options for type declaration formatting.
 */
export interface DeclarationOptions {
  /** Output only input types */
  inputOnly?: boolean;
  /** Output only output types */
  outputOnly?: boolean;
  /** Merge input/output if they are identical */
  mergeSame?: boolean;
  /**
   * Module specifier to `import type` a schema's generated types from, keyed by
   * schema name. Only schemas whose `ExtractResult` carries `importedFrom` are
   * looked up here; an entry is what turns a cross-file reference into an
   * import instead of leaving the name undeclared.
   */
  importSources?: ReadonlyMap<string, string>;
}
