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
  InvalidOptionError,
  setVerbose,
  logVerbose,
  logProgress,
  type ExtractResult,
  type NameMappingOptions,
  type OutputOptions,
  type DeclarationOptions,
  type ZinferConfig,
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
  verbose?: boolean;
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
  .option("-v, --verbose", "Enable verbose output for debugging")
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
  const { config: fileConfig, configPath } = await configLoader.load(cwd);

  // Merge CLI options with config file (CLI takes precedence)
  const config = mergeCliWithConfig(options, fileConfig);

  // Enable verbose mode if specified
  if (config.verbose) {
    setVerbose(true);
    logVerbose("Verbose mode enabled");
    if (configPath) {
      logVerbose(`Loaded config from: ${configPath}`);
    }
  }

  // Validate options before processing
  validateOptions(config);
  logVerbose("Options validated successfully");

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

  logVerbose(`Found ${resolvedFiles.length} file(s) to process`);

  // Find tsconfig
  const tsconfigPath = config.project ? resolve(cwd, config.project) : findTsConfig(cwd);

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

    for (let i = 0; i < resolvedFiles.length; i++) {
      const filePath = resolvedFiles[i];
      logProgress(i + 1, resolvedFiles.length, `Processing ${filePath}`);
      let results = getFilteredResults(extractor, filePath, schemaFilter);

      // Add descriptions if enabled
      if (descriptionExtractor) {
        results = await addDescriptionsToResults(descriptionExtractor, filePath, results);
      }

      allResults.push(...results);
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

    return;
  }

  // Per-file output mode or console output
  let totalResults = 0;

  for (let i = 0; i < resolvedFiles.length; i++) {
    const filePath = resolvedFiles[i];
    logProgress(i + 1, resolvedFiles.length, `Processing ${filePath}`);
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
  if (cliOptions.verbose !== undefined) merged.verbose = cliOptions.verbose;

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
 * Validates CLI options and throws InvalidOptionError if invalid.
 */
function validateOptions(config: ZinferConfig): void {
  // Check mutually exclusive options
  if (config.inputOnly && config.outputOnly) {
    throw new InvalidOptionError(
      "inputOnly/outputOnly",
      "Cannot use both --input-only and --output-only at the same time",
      "Choose either --input-only or --output-only, not both",
    );
  }

  // Check suffix format (should not be empty if specified)
  if (config.suffix !== undefined && config.suffix.trim() === "") {
    throw new InvalidOptionError(
      "suffix",
      "Suffix cannot be an empty string",
      "Provide a valid suffix like 'Schema' or remove the option",
    );
  }

  if (config.inputSuffix !== undefined && config.inputSuffix.trim() === "") {
    throw new InvalidOptionError(
      "inputSuffix",
      "Input suffix cannot be an empty string",
      "Provide a valid suffix like 'Input' or remove the option",
    );
  }

  if (config.outputSuffix !== undefined && config.outputSuffix.trim() === "") {
    throw new InvalidOptionError(
      "outputSuffix",
      "Output suffix cannot be an empty string",
      "Provide a valid suffix like 'Output' or remove the option",
    );
  }

  // Check output options conflict
  const outputOptionsCount = [config.outDir, config.outFile, config.outPattern].filter(
    Boolean,
  ).length;
  if (outputOptionsCount > 1 && config.outFile) {
    throw new InvalidOptionError(
      "outFile",
      "Cannot use --outFile together with --outDir or --outPattern",
      "Use either --outFile for a single output file, or --outDir/--outPattern for multiple files",
    );
  }

  // Check map format if specified
  if (config.map) {
    for (const [key, value] of Object.entries(config.map)) {
      if (!key.trim()) {
        throw new InvalidOptionError(
          "map",
          "Mapping key cannot be empty",
          "Use format 'SchemaName:TypeName' for custom mappings",
        );
      }
      if (!value.trim()) {
        throw new InvalidOptionError(
          "map",
          `Mapping value for "${key}" cannot be empty`,
          "Use format 'SchemaName:TypeName' for custom mappings",
        );
      }
    }
  }

  // Check schema filter format if specified
  if (config.schemas) {
    for (const schema of config.schemas) {
      if (!schema.trim()) {
        throw new InvalidOptionError(
          "schemas",
          "Schema name cannot be empty",
          "Provide valid schema names separated by commas",
        );
      }
    }
  }
}
