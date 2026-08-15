/**
 * Shared type definitions for zinfer.
 */

/**
 * Information about a detected Zod schema in a source file.
 */
export interface DetectedSchema {
  /** Variable name of the schema */
  name: string;
  /** Whether the schema is exported */
  isExported: boolean;
  /** Line number where the schema is defined */
  line: number;
  /** Explicit type annotation if present (e.g., "Category" from z.ZodType<Category>) */
  explicitType?: string;
  /** JSDoc comment if present */
  jsDoc?: string;
  /** Identifier the schema is declared under; differs from `name` for aliased re-exports (`export { X as Y }`). */
  localName?: string;
}

/**
 * Field description from Zod .describe().
 */
export interface FieldDescription {
  /** Field path (e.g., "user.name" for nested fields) */
  path: string;
  /** Description text */
  description: string;
}

/**
 * A schema declared in another file whose generated types are referenced by
 * name (instead of having its structure inlined).
 */
export interface ExternalTypeReference {
  /** Name the schema is exported under in its own file (e.g. "NodeSchema") */
  schemaName: string;
  /** Absolute path to the file declaring the schema */
  sourceFilePath: string;
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
  /** Schema-level description from .describe() */
  description?: string;
  /** Field descriptions from .describe() */
  fieldDescriptions?: FieldDescription[];
  /**
   * Schemas from other files whose generated type names appear in `input` /
   * `output`. The printer turns these into `import type { ... }` statements.
   */
  externalReferences?: ExternalTypeReference[];
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
   * Resolves the module specifier used to import the generated types of a
   * schema declared in another file. Return `undefined` when those types land
   * in the same output file (e.g. `--outFile`), so no import is needed.
   */
  resolveExternalImport?: (ref: ExternalTypeReference) => string | undefined;
}
