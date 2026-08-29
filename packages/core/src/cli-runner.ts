import { resolve, dirname, basename, relative, parse as parsePath } from "pathe";
import { existsSync, writeFileSync, mkdirSync, realpathSync } from "fs";
import { ConfigLoader, type InferConfig } from "./config-loader.js";
import {
  NoFilesMatchedError,
  NoSchemasFoundError,
  InvalidOptionError,
  type ErrorMessages,
} from "./errors.js";
import { FileResolver } from "./file-resolver.js";
import { NameMapper } from "./name-mapper.js";
import { setVerbose, logVerbose, logProgress } from "./logger.js";
import type {
  ExtractResult,
  ExtractContext,
  NameMappingOptions,
  OutputOptions,
  DeclarationOptions,
  FieldDescription,
} from "./types.js";

/**
 * Options accepted by the CLI, after commander has parsed them.
 */
export interface CLIOptionsBase {
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
  verbose?: boolean;
  inlineExternalTypes?: boolean;
}

/**
 * The subset of a schema-library-specific type extractor that `runCLI` needs.
 */
export interface ExtractorLike {
  extractAll(filePath: string, context?: ExtractContext): ExtractResult[];
  getSchemaNames(filePath: string): string[];
  extractMultiple(
    filePath: string,
    schemaNames: string[],
    context?: ExtractContext,
  ): ExtractResult[];
}

/**
 * The subset of a schema-library-specific description extractor that
 * `runCLI` needs.
 */
export interface DescriptionExtractorLike {
  extractDescriptions(
    filePath: string,
    schemaNames: string[],
  ): Promise<Map<string, { description?: string; fields: FieldDescription[] }>>;
}

/**
 * Schema-library-specific bindings `runCLI` needs to drive the CLI without
 * depending on Zod, Valibot, or either adapter's own extraction/printing
 * logic.
 */
export interface CliBindings<TConfig extends InferConfig, TCLIOptions extends CLIOptionsBase> {
  /** CLI/tool name, e.g. "zinfer" or "vinfer" - used for config lookup and log messages */
  toolName: string;
  /** Wording plugged into `NoSchemasFoundError`'s message */
  errorMessages: ErrorMessages;

  createExtractor(tsconfigPath?: string): ExtractorLike;
  createDescriptionExtractor(tsconfigPath?: string): DescriptionExtractorLike;

  /** Copies any adapter-specific CLI options onto `merged` (e.g. zinfer's `--brand-strategy`). */
  mergeCliExtra(merged: TConfig, cli: TCLIOptions): void;
  /** Validates any adapter-specific config fields. @throws InvalidOptionError */
  validateExtra(config: TConfig): void;

  /**
   * Computes the extra (adapter-specific) `ExtractContext` fields that
   * decide which files' schemas are safe to reference by name instead of
   * inlining - e.g. zinfer's `generatedSchemaNames` precision. Called only
   * when at least one output file is being written.
   */
  buildExtractContextExtra(
    config: TConfig,
    resolvedFiles: string[],
    outputOptions: OutputOptions,
    cwd: string,
    fileResolver: FileResolver,
  ): Partial<ExtractContext>;

  /** Renders a declaration file's content for the given results. */
  generateDeclarationFileContent(
    results: ExtractResult[],
    nameMapper: NameMapper,
    declOptions: DeclarationOptions,
    config: TConfig,
  ): string;
  /** Rewrites `import(...)` paths in generated content to be relative to `outputPath`. */
  relativizeImportPaths(content: string, outputPath: string): string;

  /** Renders a test file's content for single-output (`--outFile`) mode. Empty string means "nothing to write". */
  generateTestFileForSingleOutput(
    fileResultsMap: Map<string, ExtractResult[]>,
    outputPath: string,
    testPath: string,
    nameMapper: NameMapper,
    config: TConfig,
  ): string;
  /** Renders a test file's content for per-file (`--outDir`/`--outPattern`) mode. Empty string means "nothing to write". */
  generateTestFileForPerFile(
    schemaFile: string,
    outputPath: string,
    testPath: string,
    results: ExtractResult[],
    nameMapper: NameMapper,
    config: TConfig,
  ): string;
}

/**
 * Selects the files that get an output file to themselves.
 *
 * Per-file output can map two inputs onto one path - `[dir]` for two files in
 * the same directory, say - and the second write then replaces the first. A
 * declaration that may not survive is no use to reference by name, so those
 * files are left out and their schemas stay inlined.
 *
 * @returns Absolute paths, canonicalized so extraction can match them against
 *   the paths TypeScript reports for the same files
 */
export function computeImportableFiles(
  resolvedFiles: string[],
  outputOptions: OutputOptions,
  cwd: string,
  fileResolver: FileResolver,
): ReadonlySet<string> {
  const filesByOutputPath = new Map<string, string[]>();

  for (const filePath of resolvedFiles) {
    const outputPath = fileResolver.resolveOutputPath(filePath, outputOptions, cwd);
    const files = filesByOutputPath.get(outputPath);
    if (files) {
      files.push(filePath);
    } else {
      filesByOutputPath.set(outputPath, [filePath]);
    }
  }

  return new Set(
    [...filesByOutputPath.values()]
      .filter((files) => files.length === 1)
      .map(([filePath]) => resolve(filePath)),
  );
}

/**
 * Main CLI execution logic, shared by every schema-library adapter.
 */
export async function runCLI<TConfig extends InferConfig, TCLIOptions extends CLIOptionsBase>(
  files: string[],
  options: TCLIOptions,
  bindings: CliBindings<TConfig, TCLIOptions>,
): Promise<void> {
  const cwd = process.cwd();

  // Enable verbose mode if requested
  if (options.verbose) {
    setVerbose(true);
    logVerbose("Verbose mode enabled");
  }

  // Load config file
  logVerbose("Loading configuration...");
  const configLoader = new ConfigLoader<TConfig>({ toolName: bindings.toolName });
  const { config: fileConfig, configPath } = options.config
    ? await configLoader.loadFrom(resolve(cwd, options.config))
    : await configLoader.load(cwd);
  logVerbose(`Using config: ${configPath ?? "(none)"}`);

  // Merge CLI options with config file (CLI takes precedence)
  const config = mergeCliWithConfig(options, fileConfig, bindings);

  // Validate options
  validateOptions(config, bindings);
  logVerbose("Configuration validated");

  // Use files from CLI args, or from config, or fail
  const inputFiles = files.length > 0 ? files : config.include || [];

  if (inputFiles.length === 0) {
    throw new NoFilesMatchedError(["(no files specified)"]);
  }

  // Resolve file paths (support glob patterns)
  logVerbose("Resolving input files...");
  const fileResolver = new FileResolver();
  const resolvedFiles = await fileResolver.resolveInputFiles(inputFiles, cwd, config.exclude);

  if (resolvedFiles.length === 0) {
    throw new NoFilesMatchedError(inputFiles);
  }
  logVerbose(`Found ${resolvedFiles.length} file(s) to process`);

  // Find tsconfig
  const tsconfigPath = config.project ? resolve(cwd, config.project) : findTsConfig(cwd);
  logVerbose(`Using tsconfig: ${tsconfigPath || "(none)"}`);

  // Create extractor and name mapper
  const extractor = bindings.createExtractor(tsconfigPath);
  const nameMapper = createNameMapper(config);
  const descriptionExtractor = config.withDescriptions
    ? bindings.createDescriptionExtractor(tsconfigPath)
    : null;

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

  // Types are only referenced across files when every matched file actually
  // gets written out: without a file output there is nowhere to import from.
  const writesFiles = Boolean(config.outDir || config.outFile || config.outPattern);
  const extractContext: ExtractContext = {
    inlineExternalTypes: config.inlineExternalTypes,
    ...(writesFiles
      ? bindings.buildExtractContextExtra(config, resolvedFiles, outputOptions, cwd, fileResolver)
      : {}),
  };

  // Single output file mode
  if (config.outFile) {
    logVerbose("Processing files for single output...");
    const allResults: ExtractResult[] = [];
    const fileResultsMap: Map<string, ExtractResult[]> = new Map();

    for (let i = 0; i < resolvedFiles.length; i++) {
      const filePath = resolvedFiles[i];
      logProgress(i + 1, resolvedFiles.length, `Processing ${basename(filePath)}`);
      let results = getFilteredResults(extractor, filePath, schemaFilter, extractContext);

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
      throw new NoSchemasFoundError(resolvedFiles, schemaFilter, bindings.errorMessages);
    }

    let content = bindings.generateDeclarationFileContent(
      allResults,
      nameMapper,
      declOptions,
      config,
    );

    const outputPath = resolve(cwd, config.outFile);
    content = bindings.relativizeImportPaths(content, outputPath);

    if (options.dryRun) {
      console.log(`Would write to: ${outputPath}`);
      console.log("---");
      console.log(content);
    } else {
      ensureDir(dirname(outputPath));
      writeFile(outputPath, content);
      console.log(`Generated: ${outputPath} (${allResults.length} types)`);
    }

    // Generate test file if requested (skip if no exported schema produced a test case)
    if (config.generateTests) {
      const testPath = outputPath.replace(/\.ts$/, ".test.ts");
      const testContent = bindings.generateTestFileForSingleOutput(
        fileResultsMap,
        outputPath,
        testPath,
        nameMapper,
        config,
      );

      if (testContent) {
        if (options.dryRun) {
          console.log(`Would write to: ${testPath}`);
          console.log("---");
          console.log(testContent);
        } else {
          writeFile(testPath, testContent);
          console.log(`Generated: ${testPath} (${allResults.length * 2} test cases)`);
        }
      }
    }

    return;
  }

  // Per-file output mode or console output
  logVerbose("Processing files...");
  let totalResults = 0;

  for (let i = 0; i < resolvedFiles.length; i++) {
    const filePath = resolvedFiles[i];
    logProgress(i + 1, resolvedFiles.length, `Processing ${basename(filePath)}`);
    let results = getFilteredResults(extractor, filePath, schemaFilter, extractContext);

    if (results.length === 0) {
      logVerbose(`  No schemas found in ${basename(filePath)}`);
      continue;
    }

    totalResults += results.length;

    // Add descriptions if enabled
    if (descriptionExtractor) {
      results = await addDescriptionsToResults(descriptionExtractor, filePath, results);
    }

    // File output mode
    if (config.outDir || config.outPattern) {
      const outputPath = fileResolver.resolveOutputPath(filePath, outputOptions, cwd);
      // Realpath'd separately, and only the directory - not re-run through
      // resolveOutputPath - so this stays blind to any `[dir]`/`[name]`
      // pattern substitution: that has to keep matching what outputPath
      // above (the caller-spelled, actually-written path) computed, or the
      // specifier buildImportSources builds would name a file that was never
      // written. Only the directory needs canonicalizing - see
      // buildImportSources's own comment.
      //
      // With outDir set, every file's output directory is the same
      // cwd-relative literal regardless of the input file's own path, so
      // there's no per-file symlink base to reconcile (and outDir may not
      // exist yet for realpathSync to resolve) - dirname(outputPath) is used
      // as-is. Without outDir, resolveOutputPath uses dirname(filePath) as
      // the output directory, which does already exist (the input file was
      // just read from there) and is what needs realpathing.
      const canonicalOutputDir = config.outDir
        ? dirname(outputPath)
        : resolve(realpathSync(dirname(filePath)));
      const importSources = buildImportSources(
        results,
        outputPath,
        canonicalOutputDir,
        outputOptions,
        cwd,
        fileResolver,
      );

      let content = bindings.generateDeclarationFileContent(
        results,
        nameMapper,
        { ...declOptions, importSources },
        config,
      );
      content = bindings.relativizeImportPaths(content, outputPath);

      if (options.dryRun) {
        console.log(`Would write to: ${outputPath}`);
        console.log("---");
        console.log(content);
        console.log("");
      } else {
        ensureDir(dirname(outputPath));
        writeFile(outputPath, content);
        console.log(`Generated: ${outputPath} (${results.length} types)`);
      }

      // Generate test file if requested (skip if no exported schema produced a test case)
      if (config.generateTests) {
        const testPath = outputPath.replace(/\.ts$/, ".test.ts");
        const testContent = bindings.generateTestFileForPerFile(
          filePath,
          outputPath,
          testPath,
          results,
          nameMapper,
          config,
        );

        if (testContent) {
          if (options.dryRun) {
            console.log(`Would write to: ${testPath}`);
            console.log("---");
            console.log(testContent);
            console.log("");
          } else {
            writeFile(testPath, testContent);
            console.log(`Generated: ${testPath} (${results.length * 2} test cases)`);
          }
        }
      }
    } else {
      // Console output mode
      if (resolvedFiles.length > 1) {
        console.log(`// File: ${filePath}`);
      }

      const content = bindings.generateDeclarationFileContent(
        results,
        nameMapper,
        declOptions,
        config,
      );
      console.log(content);
    }
  }

  // Error if no schemas were found
  if (totalResults === 0) {
    throw new NoSchemasFoundError(resolvedFiles, schemaFilter, bindings.errorMessages);
  }
}

/**
 * Adds extracted descriptions to extraction results.
 */
async function addDescriptionsToResults(
  descriptionExtractor: DescriptionExtractorLike,
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
  extractor: ExtractorLike,
  filePath: string,
  schemaFilter?: string[],
  context: ExtractContext = {},
): ExtractResult[] {
  if (!schemaFilter) {
    return extractor.extractAll(filePath, context);
  }

  const existingSchemas = extractor.getSchemaNames(filePath);
  const schemasToExtract = schemaFilter.filter((name) => existingSchemas.includes(name));

  if (schemasToExtract.length === 0) {
    return [];
  }

  return extractor.extractMultiple(filePath, schemasToExtract, context);
}

/**
 * Resolves where each cross-file type reference has to be imported from.
 *
 * A schema whose declaring file lands in the very file being written needs no
 * import, so it is left out; everything else is addressed by the path from this
 * output file to the one that declares it, extension dropped.
 *
 * @param outputPath - This file's own actually-written output path (as the
 *   caller spelled it - unchanged, since this is what the file really landed
 *   at).
 * @param canonicalOutputDir - `dirname(outputPath)`, realpath'd. When
 *   `outPattern` is used without `outDir`, `resolveOutputPath` derives the
 *   output directory from the input file's own directory - so on a symlinked
 *   working directory, this file's own directory and `result.importedFrom`'s
 *   directory (realpath'd by ts-morph's module resolution in some resolution
 *   paths, per #495) can land on different symlink bases for what is
 *   otherwise the same physical location. Only the directory is
 *   canonicalized: the declaring file's *name* still has to come from
 *   `result.importedFrom` unmodified, since `resolveOutputPath`'s `[dir]`/
 *   `[name]` pattern substitution is itself path-derived - canonicalizing the
 *   path passed into it would risk computing a name that doesn't match what
 *   the declaring file's own iteration actually wrote (flagged in review on
 *   #502). The resulting relative specifier still resolves correctly from
 *   `outputPath`'s own (possibly symlinked) directory, since a relative path
 *   is structural and symlinks are transparent to it.
 * @returns Map of schema name to module specifier
 */
function buildImportSources(
  results: ExtractResult[],
  outputPath: string,
  canonicalOutputDir: string,
  outputOptions: OutputOptions,
  cwd: string,
  fileResolver: FileResolver,
): Map<string, string> {
  const importSources = new Map<string, string>();

  for (const result of results) {
    if (!result.importedFrom) continue;

    const declaringOutputPath = fileResolver.resolveOutputPath(
      result.importedFrom,
      outputOptions,
      cwd,
    );
    const canonicalDeclaringDir = outputOptions.outDir
      ? dirname(declaringOutputPath)
      : resolve(realpathSync(dirname(result.importedFrom)));
    // Same file iff both the (canonicalized) directory and the actual
    // filename agree - the directory comparison alone would miss a same-file
    // case whose non-canonical outputPath differs only in symlink spelling.
    if (
      canonicalDeclaringDir === canonicalOutputDir &&
      basename(declaringOutputPath) === basename(outputPath)
    ) {
      continue;
    }

    const withoutExtension = basename(declaringOutputPath).replace(/\.d\.ts$|\.ts$/, "");
    let specifier = relative(canonicalOutputDir, resolve(canonicalDeclaringDir, withoutExtension));
    if (!specifier.startsWith(".")) {
      specifier = `./${specifier}`;
    }

    importSources.set(result.schemaName, specifier);
  }

  return importSources;
}

/**
 * Merges CLI options with config file options.
 * CLI options take precedence.
 */
function mergeCliWithConfig<TConfig extends InferConfig, TCLIOptions extends CLIOptionsBase>(
  cliOptions: TCLIOptions,
  fileConfig: TConfig,
  bindings: CliBindings<TConfig, TCLIOptions>,
): TConfig {
  const merged: TConfig = { ...fileConfig };

  // Merge CLI options (only non-undefined values)
  if (cliOptions.project !== undefined) merged.project = cliOptions.project;
  if (cliOptions.schemas !== undefined) {
    merged.schemas = parseSchemaNames(cliOptions.schemas);
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
  if (cliOptions.generateTests !== undefined) merged.generateTests = cliOptions.generateTests;
  if (cliOptions.inlineExternalTypes !== undefined)
    merged.inlineExternalTypes = cliOptions.inlineExternalTypes;

  bindings.mergeCliExtra(merged, cliOptions);

  return merged;
}

/**
 * Validates CLI options for conflicts and invalid values.
 * @throws InvalidOptionError if any validation fails
 */
function validateOptions<TConfig extends InferConfig, TCLIOptions extends CLIOptionsBase>(
  config: TConfig,
  bindings: CliBindings<TConfig, TCLIOptions>,
): void {
  // Check mutually exclusive options
  if (config.inputOnly && config.outputOnly) {
    throw new InvalidOptionError(
      "--input-only / --output-only",
      "Cannot use both options together",
      "Use only one of --input-only or --output-only",
    );
  }

  // Check conflicting output options
  if (config.outFile && (config.outDir || config.outPattern)) {
    throw new InvalidOptionError(
      "--outFile",
      "Cannot use with --outDir or --outPattern",
      "Use --outFile for single output, or --outDir/--outPattern for multiple outputs",
    );
  }

  // Check empty suffix
  if (config.suffix === "") {
    throw new InvalidOptionError(
      "--suffix",
      "Empty suffix is not allowed",
      "Provide a non-empty suffix value or omit the option",
    );
  }

  // --generate-tests requires file output to place the companion test file next to the generated type file
  if (config.generateTests && !config.outDir && !config.outFile) {
    throw new InvalidOptionError(
      "--generate-tests",
      "Requires file output",
      "Add --outDir or --outFile",
    );
  }

  // The generated test imports the schema as a runtime value, which .d.ts output
  // cannot provide, and the test path derivation would also produce a malformed
  // name (e.g. name.types.d.test.ts) since .d.ts has two extensions.
  if (config.generateTests && config.declaration) {
    throw new InvalidOptionError(
      "--generate-tests",
      "Cannot be used with --declaration",
      "Generate tests without -d/--declaration, or generate .d.ts output without --generate-tests",
    );
  }

  bindings.validateExtra(config);
}

/**
 * Creates a NameMapper from config.
 */
function createNameMapper(config: InferConfig): NameMapper {
  const mappingOptions: NameMappingOptions = {};

  if (config.suffix) {
    mappingOptions.removeSuffix = config.suffix;
  }
  if (config.inputSuffix != null) {
    mappingOptions.inputSuffix = config.inputSuffix;
  }
  if (config.outputSuffix != null) {
    mappingOptions.outputSuffix = config.outputSuffix;
  }
  if (config.map) {
    mappingOptions.customMap = config.map;
  }

  return new NameMapper(mappingOptions);
}

/**
 * Parses schema names from a comma-separated string.
 * Filters out empty strings and validates identifier format.
 *
 * @param schemasStr - Comma-separated schema names
 * @returns Array of valid schema names
 * @throws Error if any schema name is invalid
 */
function parseSchemaNames(schemasStr: string): string[] {
  const schemas = schemasStr
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  // Validate that each schema name is a valid identifier
  const identifierPattern = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;
  for (const schema of schemas) {
    if (!identifierPattern.test(schema)) {
      throw new Error(
        `Invalid schema name: "${schema}". Schema names must be valid TypeScript identifiers.`,
      );
    }
  }

  return schemas;
}

/**
 * Parses custom mapping string: "Schema1:Type1,Schema2:Type2"
 * Validates both schema names and type names.
 *
 * @param mapStr - Custom mapping string
 * @returns Map of schema names to type names
 * @throws Error if any mapping is invalid
 */
function parseCustomMap(mapStr: string): Record<string, string> {
  const result: Record<string, string> = {};
  const identifierPattern = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/;

  for (const pair of mapStr.split(",")) {
    const trimmedPair = pair.trim();
    if (!trimmedPair) continue;

    const colonIndex = trimmedPair.indexOf(":");
    if (colonIndex === -1) {
      throw new Error(`Invalid mapping format: "${trimmedPair}". Expected "SchemaName:TypeName".`);
    }

    const from = trimmedPair.substring(0, colonIndex).trim();
    const to = trimmedPair.substring(colonIndex + 1).trim();

    if (!from || !to) {
      throw new Error(
        `Invalid mapping: "${trimmedPair}". Both schema name and type name are required.`,
      );
    }

    if (!identifierPattern.test(from)) {
      throw new Error(
        `Invalid schema name in mapping: "${from}". Must be a valid TypeScript identifier.`,
      );
    }

    if (!identifierPattern.test(to)) {
      throw new Error(
        `Invalid type name in mapping: "${to}". Must be a valid TypeScript identifier.`,
      );
    }

    if (result[from] !== undefined) {
      console.warn(
        `Warning: Duplicate mapping for "${from}". Using "${to}" (overwriting "${result[from]}").`,
      );
    }

    result[from] = to;
  }
  return result;
}

/**
 * Finds tsconfig.json starting from the given directory.
 */
function findTsConfig(startDir: string): string | undefined {
  let currentDir = startDir;
  // Get the root directory in a cross-platform way (e.g., "/" on Unix, "C:\" on Windows)
  const root = parsePath(resolve(startDir)).root;

  while (currentDir !== root) {
    const tsconfigPath = resolve(currentDir, "tsconfig.json");
    if (existsSync(tsconfigPath)) {
      return tsconfigPath;
    }
    const parentDir = resolve(currentDir, "..");
    // Prevent infinite loop at root
    if (parentDir === currentDir) {
      break;
    }
    currentDir = parentDir;
  }

  // Check root directory as well
  const rootTsconfig = resolve(root, "tsconfig.json");
  if (existsSync(rootTsconfig)) {
    return rootTsconfig;
  }

  return undefined;
}

/**
 * Ensures a directory exists.
 * @throws Error if the directory cannot be created
 */
function ensureDir(dirPath: string): void {
  if (!existsSync(dirPath)) {
    try {
      mkdirSync(dirPath, { recursive: true });
    } catch (error) {
      const err = error as NodeJS.ErrnoException;
      throw new Error(`Failed to create directory "${dirPath}": ${err.message}`);
    }
  }
}

/**
 * Writes content to a file with proper error handling.
 * @throws Error if the file cannot be written
 */
function writeFile(filePath: string, content: string): void {
  try {
    writeFileSync(filePath, content, "utf-8");
  } catch (error) {
    const err = error as NodeJS.ErrnoException;
    throw new Error(`Failed to write file "${filePath}": ${err.message}`);
  }
}
