export {
  ConfigLoader,
  defineConfig,
  type InferConfig,
  type ConfigLoadResult,
  type ConfigLoaderOptions,
} from "./config-loader.js";

export {
  InferError,
  NoFilesMatchedError,
  NoSchemasFoundError,
  InvalidOptionError,
  formatError,
  type ErrorMessages,
} from "./errors.js";

export { FileResolver } from "./file-resolver.js";

export { NameMapper, createNameMapper } from "./name-mapper.js";

export {
  ImportResolver,
  type ImportedSchemaInfo,
  type ImportedSchemaMap,
  type SchemaDetectorLike,
} from "./import-resolver.js";

export { setVerbose, logVerbose, logDebugError, logProgress, getErrorMessage } from "./logger.js";

export { NORMALIZE_TYPE_DEFINITION, NORMALIZE_TYPE_NAMES } from "./normalizer.js";

export {
  escapeRegExp,
  isEscaped,
  isGenericMethodName,
  replaceBareTypeName,
  replaceBareTypeNames,
} from "./text-scan.js";

export type {
  ExtractOptions,
  ExtractContext,
  DetectedSchema,
  FieldDescription,
  ExtractResult,
  FileExtractResult,
  MappedTypeName,
  NameMappingOptions,
  OutputOptions,
  GeneratedFile,
  DeclarationOptions,
  TypeReferenceScope,
} from "./types.js";

export {
  runCLI,
  computeImportableFiles,
  disambiguateOptionalValueFlag,
  type CLIOptionsBase,
  type CliBindings,
  type ExtractorLike,
  type DescriptionExtractorLike,
} from "./cli-runner.js";
