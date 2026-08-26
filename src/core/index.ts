export { ZodTypeExtractor, type ExtractOptions, type ExtractContext } from "./extractor.js";

export {
  formatResult,
  formatInputOnly,
  formatOutputOnly,
  formatAsDeclaration,
  formatMultipleAsDeclarations,
  generateDeclarationFile,
  relativizeImportPaths,
  containsBrandMarker,
  type PrintOptions,
} from "./type-printer.js";

export { SchemaDetector } from "./schema-detector.js";

export { NameMapper, createNameMapper } from "./name-mapper.js";

export { FileResolver } from "./file-resolver.js";

export { DescriptionExtractor } from "./description-extractor.js";

export {
  NoSchemasFoundError,
  NoFilesMatchedError,
  InvalidOptionError,
  formatError,
} from "./errors.js";

export { setVerbose, logVerbose, logProgress } from "./logger.js";

export { ConfigLoader, defineConfig, type ZinferConfig } from "./config-loader.js";

export {
  TestGenerator,
  generateTypeTests,
  generateImportPrefix,
  createTestSchemaInfo,
  toPascalCase,
  type TestSchemaInfo,
  type TestFileInfo,
  type TestGeneratorOptions,
} from "./test-generator.js";

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
} from "./types.js";
