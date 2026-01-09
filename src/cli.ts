#!/usr/bin/env node
import { Command } from "commander";
import { resolve } from "path";
import { existsSync, writeFileSync, mkdirSync } from "fs";
import { dirname } from "path";
import {
  ZodTypeExtractor,
  generateDeclarationFile,
  NameMapper,
  FileResolver,
  DescriptionExtractor,
  ConfigLoader,
  formatError,
  NoFilesMatchedError,
  NoSchemasFoundError,
  generateTypeTests,
  generateImportPrefix,
  type ExtractResult,
  type NameMappingOptions,
  type OutputOptions,
  type DeclarationOptions,
  type ZinferConfig,
  type TestFileInfo,
  type TestSchemaInfo,
} from "./core/index.js";

interface CLIOptions {
  project?: string;
  schemas?: string;
  inputOnly?: boolean;
  outputOnly?: boolean;
  mergeSame?: boolean;
  suffix?: string;
  inputSuffix?: string;
  outputSuffix?: string;
  map?: string;
  outDir?: string;
  outFile?: string;
  outPattern?: string;
  declaration?: boolean;
  dryRun?: boolean;
  withDescriptions?: boolean;
  config?: string;
  generateTests?: boolean;
}

const program = new Command();

program.name("zinfer").description("Extract input/output types from Zod schemas").version("0.1.0");

program
  .argument("[files...]", "File paths or glob patterns")
  .option("-c, --config <path>", "Path to config file")
  .option("-p, --project <path>", "Path to tsconfig.json")
  .option("--schemas <names>", "Comma-separated schema names to extract")
  .option("--input-only", "Output only input types")
  .option("--output-only", "Output only output types")
  .option("--merge-same", "Single type if input===output")
  .option("--suffix <suffix>", "Remove suffix from schema names (e.g., 'Schema')")
  .option("--input-suffix <suffix>", "Suffix for input type names (default: 'Input')")
  .option("--output-suffix <suffix>", "Suffix for output type names (default: 'Output')")
  .option("--map <mappings>", "Custom name mappings (e.g., 'UserSchema:User')")
  .option("--outDir <dir>", "Output directory for generated files")
  .option("--outFile <file>", "Single output file for all types")
  .option("--outPattern <pattern>", "Output file naming pattern (e.g., '[name].types.ts')")
  .option("-d, --declaration", "Generate .d.ts files")
  .option("--dry-run", "Preview without writing files")
  .option("--with-descriptions", "Include Zod .describe() as TSDoc comments")
  .option("--generate-tests", "Generate vitest type equality tests alongside type files")
  .action(async (files: string[], options: CLIOptions) => {
    try {
      await runCLI(files, options);
    } catch (error) {
      console.error(formatError(error));
      process.exit(1);
    }
  });

program.parse();

/**
 * Main CLI execution logic.
 */
async function runCLI(files: string[], options: CLIOptions): Promise<void> {
  const cwd = process.cwd();

  // Load config file
  const configLoader = new ConfigLoader();
  const { config: fileConfig } = await configLoader.load(cwd);

  // Merge CLI options with config file (CLI takes precedence)
  const config = mergeCliWithConfig(options, fileConfig);

  // Use files from CLI args, or from config, or fail
  const inputFiles = files.length > 0 ? files : config.include || [];

  if (inputFiles.length === 0) {
    throw new NoFilesMatchedError(["(no files specified)"]);
  }

  // Resolve file paths (support glob patterns)
  const fileResolver = new FileResolver();
  const resolvedFiles = await fileResolver.resolveInputFiles(inputFiles, cwd);

  if (resolvedFiles.length === 0) {
    throw new NoFilesMatchedError(inputFiles);
  }

  // Find tsconfig
  const tsconfigPath = config.project ? resolve(cwd, config.project) : findTsConfig(cwd);

  // Validate --generate-tests requires file output
  if (options.generateTests && !config.outDir && !config.outFile) {
    throw new Error("--generate-tests requires --outDir or --outFile");
  }

  // Create extractor and name mapper
  const extractor = new ZodTypeExtractor(tsconfigPath);
  const nameMapper = createNameMapper(config);
  const descriptionExtractor = config.withDescriptions ? new DescriptionExtractor() : null;

  // Parse schema names if specified
  const schemaFilter = config.schemas;

  // Output options
  const outputOptions: OutputOptions = {
    outDir: config.outDir,
    outFile: config.outFile,
    outPattern: config.outPattern,
    declaration: config.declaration,
  };

  // Declaration options
  const declOptions: DeclarationOptions = {
    inputOnly: config.inputOnly,
    outputOnly: config.outputOnly,
    mergeSame: config.mergeSame,
  };

  // Single output file mode
  if (config.outFile) {
    const allResults: ExtractResult[] = [];
    const fileResultsMap: Map<string, ExtractResult[]> = new Map();

    for (const filePath of resolvedFiles) {
      let results = getFilteredResults(extractor, filePath, schemaFilter);

      // Add descriptions if enabled
      if (descriptionExtractor) {
        results = await addDescriptionsToResults(descriptionExtractor, filePath, results);
      }

      if (results.length > 0) {
        allResults.push(...results);
        fileResultsMap.set(filePath, results);
      }
    }

    if (allResults.length === 0) {
      throw new NoSchemasFoundError(resolvedFiles, schemaFilter);
    }

    const content = generateDeclarationFile(
      allResults,
      nameMapper.createMapFunction(),
      declOptions,
    );

    const outputPath = resolve(cwd, config.outFile);

    if (options.dryRun) {
      console.log(`Would write to: ${outputPath}`);
      console.log("---");
      console.log(content);
    } else {
      ensureDir(dirname(outputPath));
      writeFileSync(outputPath, content, "utf-8");
      console.log(`Generated: ${outputPath} (${allResults.length} types)`);
    }

    // Generate test file if requested
    if (options.generateTests) {
      const testPath = outputPath.replace(/\.ts$/, ".test.ts");
      const testContent = generateTestFileForSingleOutput(
        fileResultsMap,
        outputPath,
        testPath,
        nameMapper,
      );

      if (options.dryRun) {
        console.log(`Would write to: ${testPath}`);
        console.log("---");
        console.log(testContent);
      } else {
        writeFileSync(testPath, testContent, "utf-8");
        console.log(`Generated: ${testPath} (${allResults.length * 2} test cases)`);
      }
    }

    return;
  }

  // Per-file output mode or console output
  let totalResults = 0;

  for (const filePath of resolvedFiles) {
    let results = getFilteredResults(extractor, filePath, schemaFilter);

    if (results.length === 0) {
      continue;
    }

    totalResults += results.length;

    // Add descriptions if enabled
    if (descriptionExtractor) {
      results = await addDescriptionsToResults(descriptionExtractor, filePath, results);
    }

    // File output mode
    if (config.outDir || config.outPattern) {
      const content = generateDeclarationFile(results, nameMapper.createMapFunction(), declOptions);

      const outputPath = fileResolver.resolveOutputPath(filePath, outputOptions, cwd);

      if (options.dryRun) {
        console.log(`Would write to: ${outputPath}`);
        console.log("---");
        console.log(content);
        console.log("");
      } else {
        ensureDir(dirname(outputPath));
        writeFileSync(outputPath, content, "utf-8");
        console.log(`Generated: ${outputPath} (${results.length} types)`);
      }

      // Generate test file if requested
      if (options.generateTests) {
        const testPath = outputPath.replace(/\.ts$/, ".test.ts");
        const testContent = generateTestFileForPerFile(
          filePath,
          outputPath,
          testPath,
          results,
          nameMapper,
        );

        if (options.dryRun) {
          console.log(`Would write to: ${testPath}`);
          console.log("---");
          console.log(testContent);
          console.log("");
        } else {
          writeFileSync(testPath, testContent, "utf-8");
          console.log(`Generated: ${testPath} (${results.length * 2} test cases)`);
        }
      }
    } else {
      // Console output mode
      if (resolvedFiles.length > 1) {
        console.log(`// File: ${filePath}`);
      }

      const content = generateDeclarationFile(results, nameMapper.createMapFunction(), declOptions);
      console.log(content);
    }
  }

  // Error if no schemas were found
  if (totalResults === 0) {
    throw new NoSchemasFoundError(resolvedFiles, schemaFilter);
  }
}

/**
 * Adds descriptions from Zod schemas to extraction results.
 */
async function addDescriptionsToResults(
  descriptionExtractor: DescriptionExtractor,
  filePath: string,
  results: ExtractResult[],
): Promise<ExtractResult[]> {
  const schemaNames = results.map((r) => r.schemaName);
  const descriptions = await descriptionExtractor.extractDescriptions(filePath, schemaNames);

  return results.map((result) => {
    const desc = descriptions.get(result.schemaName);
    if (!desc) {
      return result;
    }

    return {
      ...result,
      description: desc.description,
      fieldDescriptions: desc.fields,
    };
  });
}

/**
 * Gets extraction results, filtering by schema names if specified.
 * Only extracts schemas that actually exist in the file.
 */
function getFilteredResults(
  extractor: ZodTypeExtractor,
  filePath: string,
  schemaFilter?: string[],
): ExtractResult[] {
  if (!schemaFilter) {
    return extractor.extractAll(filePath);
  }

  const existingSchemas = extractor.getSchemaNames(filePath);
  const schemasToExtract = schemaFilter.filter((name) => existingSchemas.includes(name));

  if (schemasToExtract.length === 0) {
    return [];
  }

  return extractor.extractMultiple(filePath, schemasToExtract);
}

/**
 * Merges CLI options with config file options.
 * CLI options take precedence.
 */
function mergeCliWithConfig(cliOptions: CLIOptions, fileConfig: ZinferConfig): ZinferConfig {
  const merged: ZinferConfig = { ...fileConfig };

  // Merge CLI options (only non-undefined values)
  if (cliOptions.project !== undefined) merged.project = cliOptions.project;
  if (cliOptions.schemas !== undefined) {
    merged.schemas = cliOptions.schemas.split(",").map((s) => s.trim());
  }
  if (cliOptions.inputOnly !== undefined) merged.inputOnly = cliOptions.inputOnly;
  if (cliOptions.outputOnly !== undefined) merged.outputOnly = cliOptions.outputOnly;
  if (cliOptions.mergeSame !== undefined) merged.mergeSame = cliOptions.mergeSame;
  if (cliOptions.suffix !== undefined) merged.suffix = cliOptions.suffix;
  if (cliOptions.inputSuffix !== undefined) merged.inputSuffix = cliOptions.inputSuffix;
  if (cliOptions.outputSuffix !== undefined) merged.outputSuffix = cliOptions.outputSuffix;
  if (cliOptions.map !== undefined) {
    merged.map = parseCustomMap(cliOptions.map);
  }
  if (cliOptions.outDir !== undefined) merged.outDir = cliOptions.outDir;
  if (cliOptions.outFile !== undefined) merged.outFile = cliOptions.outFile;
  if (cliOptions.outPattern !== undefined) merged.outPattern = cliOptions.outPattern;
  if (cliOptions.declaration !== undefined) merged.declaration = cliOptions.declaration;
  if (cliOptions.withDescriptions !== undefined)
    merged.withDescriptions = cliOptions.withDescriptions;

  return merged;
}

/**
 * Creates a NameMapper from config.
 */
function createNameMapper(config: ZinferConfig): NameMapper {
  const mappingOptions: NameMappingOptions = {};

  if (config.suffix) {
    mappingOptions.removeSuffix = config.suffix;
  }
  if (config.inputSuffix) {
    mappingOptions.inputSuffix = config.inputSuffix;
  }
  if (config.outputSuffix) {
    mappingOptions.outputSuffix = config.outputSuffix;
  }
  if (config.map) {
    mappingOptions.customMap = config.map;
  }

  return new NameMapper(mappingOptions);
}

/**
 * Parses custom mapping string: "Schema1:Type1,Schema2:Type2"
 */
function parseCustomMap(mapStr: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const pair of mapStr.split(",")) {
    const [from, to] = pair.split(":").map((s) => s.trim());
    if (from && to) {
      result[from] = to;
    }
  }
  return result;
}

/**
 * Finds tsconfig.json starting from the given directory.
 */
function findTsConfig(startDir: string): string | undefined {
  let currentDir = startDir;
  const root = resolve("/");

  while (currentDir !== root) {
    const tsconfigPath = resolve(currentDir, "tsconfig.json");
    if (existsSync(tsconfigPath)) {
      return tsconfigPath;
    }
    currentDir = resolve(currentDir, "..");
  }

  return undefined;
}

/**
 * Ensures a directory exists.
 */
function ensureDir(dirPath: string): void {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Generates test file content for single output mode (--outFile).
 */
function generateTestFileForSingleOutput(
  fileResultsMap: Map<string, ExtractResult[]>,
  typesPath: string,
  testPath: string,
  nameMapper: NameMapper,
): string {
  const testFiles: TestFileInfo[] = [];
  const testDir = dirname(testPath);

  for (const [schemaFile, results] of fileResultsMap) {
    const exportedSchemas = results.filter((r) => r.isExported);
    if (exportedSchemas.length === 0) continue;

    const fileName = schemaFile.replace(/\.ts$/, "").split("/").pop() || "";
    const importPrefix = generateImportPrefix(fileName);

    const schemas: TestSchemaInfo[] = exportedSchemas.map((result) => {
      const mapped = nameMapper.map(result.schemaName);
      return {
        schemaName: result.schemaName,
        inputTypeName: mapped.inputName,
        outputTypeName: mapped.outputName,
      };
    });

    const relativeSchemaPath = getRelativePath(testDir, schemaFile);
    const relativeTypesPath = getRelativePath(testDir, typesPath);

    testFiles.push({
      schemaFilePath: relativeSchemaPath,
      typesFilePath: relativeTypesPath,
      importPrefix,
      schemas,
    });
  }

  return generateTypeTests(testFiles);
}

/**
 * Generates test file content for per-file output mode (--outDir).
 */
function generateTestFileForPerFile(
  schemaFile: string,
  typesPath: string,
  testPath: string,
  results: ExtractResult[],
  nameMapper: NameMapper,
): string {
  const exportedSchemas = results.filter((r) => r.isExported);
  if (exportedSchemas.length === 0) {
    return "";
  }

  const testDir = dirname(testPath);
  const fileName = schemaFile.replace(/\.ts$/, "").split("/").pop() || "";
  const importPrefix = generateImportPrefix(fileName);

  const schemas: TestSchemaInfo[] = exportedSchemas.map((result) => {
    const mapped = nameMapper.map(result.schemaName);
    return {
      schemaName: result.schemaName,
      inputTypeName: mapped.inputName,
      outputTypeName: mapped.outputName,
    };
  });

  const relativeSchemaPath = getRelativePath(testDir, schemaFile);
  const relativeTypesPath = getRelativePath(testDir, typesPath);

  const testFile: TestFileInfo = {
    schemaFilePath: relativeSchemaPath,
    typesFilePath: relativeTypesPath,
    importPrefix,
    schemas,
  };

  return generateTypeTests([testFile]);
}

/**
 * Gets relative path from one file to another, ensuring it starts with ./
 */
function getRelativePath(from: string, to: string): string {
  // Compute proper relative path
  const fromParts = from.split("/").filter(Boolean);
  const toParts = resolve(to).split("/").filter(Boolean);

  // Find common prefix
  let commonLength = 0;
  for (let i = 0; i < Math.min(fromParts.length, toParts.length); i++) {
    if (fromParts[i] === toParts[i]) {
      commonLength++;
    } else {
      break;
    }
  }

  // Build relative path
  const upCount = fromParts.length - commonLength;
  const downPath = toParts.slice(commonLength).join("/");

  if (upCount === 0) {
    return "./" + downPath;
  }

  return "../".repeat(upCount) + downPath;
}
