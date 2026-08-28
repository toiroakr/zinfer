import { existsSync } from "fs";
import { readFile } from "fs/promises";
import { basename, resolve } from "pathe";
import { pathToFileURL } from "url";

/**
 * Configuration options that can be specified in config file.
 */
export interface InferConfig {
  /** File paths or glob patterns to process */
  include?: string[];
  /** Glob patterns to exclude */
  exclude?: string[];
  /** Path to tsconfig.json */
  project?: string;
  /** Comma-separated schema names to filter */
  schemas?: string[];
  /** Output only input types */
  inputOnly?: boolean;
  /** Output only output types */
  outputOnly?: boolean;
  /** Merge input/output if they are identical */
  mergeSame?: boolean;
  /** Suffix to remove from schema names */
  suffix?: string;
  /** Suffix to add for input types */
  inputSuffix?: string;
  /** Suffix to add for output types */
  outputSuffix?: string;
  /** Custom name mappings */
  map?: Record<string, string>;
  /** Output directory */
  outDir?: string;
  /** Single output file path */
  outFile?: string;
  /** Output file naming pattern */
  outPattern?: string;
  /** Generate .d.ts files */
  declaration?: boolean;
  /** Include schema-level descriptions as TSDoc comments */
  withDescriptions?: boolean;
  /** Generate vitest type equality tests alongside type files */
  generateTests?: boolean;
  /**
   * Replace the `import("...")` reference an explicit annotation's `T`
   * synthesizes for a plain type declared in another file with that type's
   * own structure, instead of leaving the generated output pointing back at
   * it.
   */
  inlineExternalTypes?: boolean;
}

/**
 * Result of loading a config file.
 */
export interface ConfigLoadResult<TConfig extends InferConfig = InferConfig> {
  /** The loaded configuration */
  config: TConfig;
  /** Path to the config file (if found) */
  configPath?: string;
}

/**
 * Identity plugged into `ConfigLoader` so it can look for the right config
 * filenames and package.json field without hardcoding "zinfer" or "vinfer".
 */
export interface ConfigLoaderOptions {
  /** CLI/tool name, e.g. "zinfer" or "vinfer" - config filename stem and package.json field */
  toolName: string;
}

/**
 * Loads configuration from config file or package.json.
 */
export class ConfigLoader<TConfig extends InferConfig = InferConfig> {
  private readonly configFiles: readonly string[];

  constructor(private readonly options: ConfigLoaderOptions) {
    this.configFiles = [
      `${options.toolName}.config.ts`,
      `${options.toolName}.config.mts`,
      `${options.toolName}.config.js`,
      `${options.toolName}.config.mjs`,
    ];
  }

  /**
   * Loads configuration from the specified directory.
   *
   * @param cwd - Directory to search for config files
   * @returns Configuration and config file path (if found)
   */
  async load(cwd: string = process.cwd()): Promise<ConfigLoadResult<TConfig>> {
    // Try config files first
    for (const configFile of this.configFiles) {
      const configPath = resolve(cwd, configFile);
      if (existsSync(configPath)) {
        const config = await this.loadConfigFile(configPath);
        return { config, configPath };
      }
    }

    // Try package.json
    const packageJsonPath = resolve(cwd, "package.json");
    if (existsSync(packageJsonPath)) {
      const config = await this.loadFromPackageJson(packageJsonPath);
      if (config) {
        return { config, configPath: packageJsonPath };
      }
    }

    return { config: {} as TConfig };
  }

  /**
   * Loads configuration from an explicitly requested config file.
   *
   * @param configPath - Path to the config file (`.ts`, `.js`, or a package.json)
   * @throws Error if the file does not exist, or if it exists but fails to
   *   load/parse - unlike auto-discovery, silently continuing with no
   *   configuration here would produce wrong output for a path the caller
   *   named explicitly.
   */
  async loadFrom(configPath: string): Promise<ConfigLoadResult<TConfig>> {
    const resolvedPath = resolve(configPath);
    if (!existsSync(resolvedPath)) {
      throw new Error(`Config file not found: ${resolvedPath}`);
    }

    if (basename(resolvedPath) === "package.json") {
      const config = await this.loadFromPackageJson(resolvedPath, { throwOnError: true });
      return { config: config ?? ({} as TConfig), configPath: resolvedPath };
    }

    return {
      config: await this.loadConfigFile(resolvedPath, { throwOnError: true }),
      configPath: resolvedPath,
    };
  }

  /**
   * Loads configuration from a TypeScript/JavaScript config file.
   *
   * @param options.throwOnError - Rethrow load failures instead of warning and
   * returning an empty config. Used for an explicitly requested path (`loadFrom`),
   * where silently continuing with no configuration would produce wrong output;
   * not used for auto-discovered well-known filenames, where a config file is optional.
   */
  private async loadConfigFile(
    configPath: string,
    options?: { throwOnError?: boolean },
  ): Promise<TConfig> {
    try {
      const fileUrl = pathToFileURL(configPath).href;
      const module = await import(fileUrl);
      return module.default || module;
    } catch (error) {
      if (options?.throwOnError) {
        throw new Error(`Failed to load config from ${configPath}: ${(error as Error).message}`);
      }
      console.warn(`Warning: Failed to load config from ${configPath}:`, (error as Error).message);
      return {} as TConfig;
    }
  }

  /**
   * Loads configuration from package.json's tool-name field.
   *
   * @param options.throwOnError - Rethrow read/parse failures instead of
   * warning and returning null. Used for an explicitly requested path
   * (`loadFrom`), matching `loadConfigFile`'s throwOnError; not used for
   * auto-discovered package.json, where a config file is optional.
   */
  private async loadFromPackageJson(
    packageJsonPath: string,
    options?: { throwOnError?: boolean },
  ): Promise<TConfig | null> {
    let content: string;
    try {
      content = await readFile(packageJsonPath, "utf-8");
    } catch (error) {
      if (options?.throwOnError) {
        throw new Error(
          `Failed to load config from ${packageJsonPath}: ${(error as Error).message}`,
        );
      }
      // File read error (permissions, not found, etc.) - silently return null
      // since package.json config is optional
      return null;
    }

    try {
      const packageJson = JSON.parse(content);
      const field = packageJson[this.options.toolName];

      if (field && typeof field === "object") {
        return field as TConfig;
      }

      return null;
    } catch (error) {
      if (options?.throwOnError) {
        throw new Error(`Failed to parse ${packageJsonPath}: ${(error as Error).message}`);
      }
      // JSON parse error - warn the user since this is likely a syntax error
      console.warn(`Warning: Failed to parse ${packageJsonPath}: ${(error as Error).message}`);
      return null;
    }
  }
}

/**
 * Defines a configuration with type checking.
 *
 * @example
 * ```typescript
 * import { defineConfig } from 'zinfer'; // or 'vinfer'
 *
 * export default defineConfig({
 *   include: ['src/** /*.schema.ts'],
 *   outDir: 'src/types',
 *   suffix: 'Schema',
 * });
 * ```
 */
export function defineConfig<TConfig extends InferConfig>(config: TConfig): TConfig {
  return config;
}
