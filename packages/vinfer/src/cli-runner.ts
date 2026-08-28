/**
 * The CLI's behavior, separated from its commander wiring so it can be driven
 * directly - from tests, or from another tool embedding vinfer.
 */
import { dirname, basename, relative } from "pathe";
import {
  ValibotTypeExtractor,
  generateDeclarationFile,
  relativizeImportPaths,
  NameMapper,
  DescriptionExtractor,
  generateTypeTests,
  generateImportPrefix,
  runCLI as sharedRunCLI,
  computeImportableFiles,
  type CLIOptionsBase,
  type CliBindings,
  type ExtractResult,
  type VinferConfig,
  type TestFileInfo,
  type TestSchemaInfo,
} from "./core/index.js";
import { vinferErrorMessages } from "./core/errors.js";

/**
 * Options accepted by the CLI, after commander has parsed them.
 */
export type CLIOptions = CLIOptionsBase;

const bindings: CliBindings<VinferConfig, CLIOptions> = {
  toolName: "vinfer",
  errorMessages: vinferErrorMessages,

  createExtractor(tsconfigPath) {
    return new ValibotTypeExtractor(tsconfigPath);
  },

  createDescriptionExtractor(tsconfigPath) {
    return new DescriptionExtractor({ tsconfigPath });
  },

  mergeCliExtra() {
    // vinfer has no CLI options beyond the shared set.
  },

  validateExtra() {
    // vinfer has no config fields beyond the shared set.
  },

  buildExtractContextExtra(config, resolvedFiles, outputOptions, cwd, fileResolver) {
    // A `--schemas` filter disables cross-file imports entirely here (unlike
    // zinfer, which narrows to just the generated schemas): vinfer's
    // extractor doesn't take a `generatedSchemaNames` precision hint.
    if (config.schemas) return {};

    return {
      importableFiles: config.outFile
        ? new Set(resolvedFiles)
        : computeImportableFiles(resolvedFiles, outputOptions, cwd, fileResolver),
    };
  },

  generateDeclarationFileContent(results, nameMapper, declOptions) {
    return generateDeclarationFile(results, nameMapper.createMapFunction(), declOptions);
  },

  relativizeImportPaths,

  generateTestFileForSingleOutput(fileResultsMap, outputPath, testPath, nameMapper) {
    const testFiles: TestFileInfo[] = [];
    const testDir = dirname(testPath);

    for (const [schemaFile, results] of fileResultsMap) {
      const schemas = createTestSchemas(results, nameMapper);
      if (schemas.length === 0) continue;

      testFiles.push({
        schemaFilePath: getRelativePath(testDir, schemaFile),
        typesFilePath: getRelativePath(testDir, outputPath),
        importPrefix: generateImportPrefix(basename(schemaFile, ".ts")),
        schemas,
      });
    }

    return generateTypeTests(testFiles);
  },

  generateTestFileForPerFile(schemaFile, outputPath, testPath, results, nameMapper) {
    const schemas = createTestSchemas(results, nameMapper);
    if (schemas.length === 0) {
      return "";
    }

    const testDir = dirname(testPath);

    return generateTypeTests([
      {
        schemaFilePath: getRelativePath(testDir, schemaFile),
        typesFilePath: getRelativePath(testDir, outputPath),
        importPrefix: generateImportPrefix(basename(schemaFile, ".ts")),
        schemas,
      },
    ]);
  },
};

/**
 * Creates test schema info from extraction results.
 */
function createTestSchemas(results: ExtractResult[], nameMapper: NameMapper): TestSchemaInfo[] {
  return results
    .filter((r) => r.isExported)
    .map((result) => ({
      schemaName: result.schemaName,
      inputTypeName: nameMapper.map(result.schemaName).inputName,
      outputTypeName: nameMapper.map(result.schemaName).outputName,
    }));
}

/**
 * Gets relative path from one file to another, ensuring it starts with ./
 */
function getRelativePath(from: string, to: string): string {
  const rel = relative(from, to);
  return rel.startsWith(".") ? rel : "./" + rel;
}

/**
 * Main CLI execution logic.
 */
export async function runCLI(files: string[], options: CLIOptions): Promise<void> {
  return sharedRunCLI(files, options, bindings);
}
