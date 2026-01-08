// Core exports
export {
  ZodTypeExtractor,
  type ExtractOptions,
  formatResult,
  formatInputOnly,
  formatOutputOnly,
  formatAsDeclaration,
  formatMultipleAsDeclarations,
  generateDeclarationFile,
  type PrintOptions,
  SchemaDetector,
  NameMapper,
  createNameMapper,
  FileResolver,
  createFileResolver,
  defineConfig,
  type ZinferConfig,
} from "./core/index.js";

// Type exports
export type {
  ExtractResult,
  FileExtractResult,
  DetectedSchema,
  MappedTypeName,
  NameMappingOptions,
  OutputOptions,
  GeneratedFile,
  DeclarationOptions,
} from "./core/index.js";

import {
  ZodTypeExtractor,
  generateDeclarationFile,
  NameMapper,
  type ExtractResult,
  type NameMappingOptions,
  type DeclarationOptions,
} from "./core/index.js";
import { formatResult } from "./core/index.js";

/**
 * Simple API to extract input and output types from a Zod schema.
 *
 * @param filePath - Path to the TypeScript file containing the Zod schema
 * @param schemaName - Name of the exported Zod schema
 * @param tsconfigPath - Optional path to tsconfig.json
 * @returns Object containing input and output type strings
 *
 * @example
 * ```typescript
 * import { extractZodTypes } from 'zinfer';
 *
 * const { input, output } = extractZodTypes('./schemas.ts', 'UserSchema');
 * console.log('Input:', input);
 * console.log('Output:', output);
 * ```
 */
export function extractZodTypes(
  filePath: string,
  schemaName: string,
  tsconfigPath?: string,
): { input: string; output: string } {
  const extractor = new ZodTypeExtractor(tsconfigPath);
  const result = extractor.extract({ filePath, schemaName });
  return {
    input: result.input,
    output: result.output,
  };
}

/**
 * Extracts types and returns a formatted string ready for console output.
 *
 * @param filePath - Path to the TypeScript file containing the Zod schema
 * @param schemaName - Name of the exported Zod schema
 * @param tsconfigPath - Optional path to tsconfig.json
 * @returns Formatted string with input and output types
 *
 * @example
 * ```typescript
 * import { extractAndFormat } from 'zinfer';
 *
 * console.log(extractAndFormat('./schemas.ts', 'UserSchema'));
 * // Output:
 * // // input
 * // { id: string; name: string; }
 * //
 * // // output
 * // { id: string; name: string; }
 * ```
 */
export function extractAndFormat(
  filePath: string,
  schemaName: string,
  tsconfigPath?: string,
): string {
  const extractor = new ZodTypeExtractor(tsconfigPath);
  const result: ExtractResult = extractor.extract({ filePath, schemaName });
  return formatResult(result);
}

/**
 * Extracts all schemas from a file.
 *
 * @param filePath - Path to the TypeScript file
 * @param tsconfigPath - Optional path to tsconfig.json
 * @returns Array of extraction results
 */
export function extractAllSchemas(filePath: string, tsconfigPath?: string): ExtractResult[] {
  const extractor = new ZodTypeExtractor(tsconfigPath);
  return extractor.extractAll(filePath);
}

/**
 * Generates TypeScript type declarations from extraction results.
 *
 * @param results - Array of extraction results
 * @param options - Generation options
 * @returns TypeScript declaration file content
 */
export function generateTypeDeclarations(
  results: ExtractResult[],
  options: {
    nameMapping?: NameMappingOptions;
    declaration?: DeclarationOptions;
  } = {},
): string {
  const mapper = new NameMapper(options.nameMapping || {});
  return generateDeclarationFile(results, mapper.createMapFunction(), options.declaration || {});
}
