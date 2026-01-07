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
 * Information about a branded type.
 */
export interface BrandInfo {
  /** The brand name (e.g., "UserId") */
  brandName: string;
  /** The field path where the brand is applied (empty string for root-level) */
  fieldPath: string;
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
  /** Brand information for output type */
  brands?: BrandInfo[];
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
  /** Unify input/output if they are identical */
  unifyIfSame?: boolean;
}
