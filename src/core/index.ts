export {
  NORMALIZE_TYPE_DEFINITION,
  createTempTypeAlias,
  TEMP_TYPE_NAMES,
} from "./normalizer.js";

export {
  ZodTypeExtractor,
  type ExtractOptions,
} from "./extractor.js";

export {
  formatResult,
  formatInputOnly,
  formatOutputOnly,
  formatAsDeclaration,
  formatMultipleAsDeclarations,
  generateDeclarationFile,
  type PrintOptions,
} from "./type-printer.js";

export { SchemaDetector } from "./schema-detector.js";

export { NameMapper, createNameMapper } from "./name-mapper.js";

export { FileResolver, createFileResolver } from "./file-resolver.js";

export {
  DescriptionExtractor,
  createDescriptionExtractor,
} from "./description-extractor.js";

export {
  ZinferError,
  SchemaNotFoundError,
  NoSchemasFoundError,
  NoFilesMatchedError,
  TypeScriptError,
  ExtractionError,
  formatError,
} from "./errors.js";

export {
  ConfigLoader,
  createConfigLoader,
  mergeConfig,
  defineConfig,
  type ZinferConfig,
  type ConfigLoadResult,
} from "./config-loader.js";

export { BrandDetector, type SchemaBrandMap } from "./brand-detector.js";

export type {
  ExtractResult,
  FileExtractResult,
  DetectedSchema,
  MappedTypeName,
  NameMappingOptions,
  OutputOptions,
  GeneratedFile,
  DeclarationOptions,
  FieldDescription,
  BrandInfo,
} from "./types.js";
