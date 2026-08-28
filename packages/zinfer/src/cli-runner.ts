import { dirname, basename, relative, resolve } from "pathe";
import {
  ZodTypeExtractor,
  generateDeclarationFile,
  relativizeImportPaths,
  containsBrandMarker,
  NameMapper,
  DescriptionExtractor,
  InvalidOptionError,
  generateTypeTests,
  generateImportPrefix,
  runCLI as sharedRunCLI,
  computeImportableFiles,
  type CLIOptionsBase,
  type CliBindings,
  type ExtractResult,
  type ZinferConfig,
  type TestFileInfo,
  type TestSchemaInfo,
} from "./core/index.js";
import { zinferErrorMessages } from "./core/errors.js";

export interface CLIOptions extends CLIOptionsBase {
  brandStrategy?: "zod-import" | "local-symbol";
}

const bindings: CliBindings<ZinferConfig, CLIOptions> = {
  toolName: "zinfer",
  errorMessages: zinferErrorMessages,

  createExtractor(tsconfigPath) {
    return new ZodTypeExtractor(tsconfigPath);
  },

  createDescriptionExtractor(tsconfigPath) {
    return new DescriptionExtractor({ tsconfigPath });
  },

  mergeCliExtra(merged, cli) {
    if (cli.brandStrategy !== undefined) merged.brandStrategy = cli.brandStrategy;
  },

  validateExtra(config) {
    // commander's .choices() rejects an invalid CLI flag value before this ever
    // runs, but a config file is untyped JS/JSON and can carry any string.
    if (
      config.brandStrategy !== undefined &&
      config.brandStrategy !== "zod-import" &&
      config.brandStrategy !== "local-symbol"
    ) {
      throw new InvalidOptionError(
        "--brand-strategy",
        `Invalid value "${config.brandStrategy}"`,
        'Use "zod-import" or "local-symbol"',
      );
    }
  },

  buildExtractContextExtra(config, resolvedFiles, outputOptions, cwd, fileResolver) {
    return {
      importableFiles: config.outFile
        ? new Set(resolvedFiles.map((filePath) => resolve(filePath)))
        : computeImportableFiles(resolvedFiles, outputOptions, cwd, fileResolver),
      generatedSchemaNames: config.schemas ? new Set(config.schemas) : undefined,
    };
  },

  generateDeclarationFileContent(results, nameMapper, declOptions, config) {
    return generateDeclarationFile(results, nameMapper.createMapFunction(), {
      ...declOptions,
      brandStrategy: config.brandStrategy,
    });
  },

  relativizeImportPaths,

  generateTestFileForSingleOutput(fileResultsMap, outputPath, testPath, nameMapper, config) {
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

    return generateTypeTests(testFiles, { brandStrategy: config.brandStrategy });
  },

  generateTestFileForPerFile(schemaFile, outputPath, testPath, results, nameMapper, config) {
    const schemas = createTestSchemas(results, nameMapper);
    if (schemas.length === 0) {
      return "";
    }

    const testDir = dirname(testPath);

    return generateTypeTests(
      [
        {
          schemaFilePath: getRelativePath(testDir, schemaFile),
          typesFilePath: getRelativePath(testDir, outputPath),
          importPrefix: generateImportPrefix(basename(schemaFile, ".ts")),
          schemas,
        },
      ],
      { brandStrategy: config.brandStrategy },
    );
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
      hasBrand: containsBrandMarker(result.output),
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
