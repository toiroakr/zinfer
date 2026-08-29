export { ZodTypeExtractor } from "./extractor.js";

export {
  runCLI,
  computeImportableFiles,
  type CLIOptionsBase,
  type CliBindings,
} from "@zinfer-monorepo/core";

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

export { InvalidOptionError, formatError } from "./errors.js";

export { defineConfig, type ZinferConfig } from "./config-loader.js";

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
  ExtractOptions,
  ExtractContext,
  TypeReferenceScope,
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
