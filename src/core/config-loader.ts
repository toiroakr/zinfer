import { existsSync } from "fs";
import { readFile } from "fs/promises";
import { resolve } from "path";
import { pathToFileURL } from "url";

/**
 * Configuration options that can be specified in config file.
 */
export interface ZinferConfig {
  /** File paths or glob patterns to process */
  include?: string[];
  /** Glob patterns to exclude */
  exclude?: string[];
  /** Path to tsconfig.json */
  project?: string;
  /** Schema names to extract (if not specified, all are extracted) */
  schemas?: string[];
  /** Output only input types */
  inputOnly?: boolean;
  /** Output only output types */
  outputOnly?: boolean;
  /** Single type if input===output */
  unifySame?: boolean;
  /** Remove suffix from schema names */
  suffix?: string;
  /** Suffix for input type names */
  inputSuffix?: string;
  /** Suffix for output type names */
  outputSuffix?: string;
  /** Custom name mappings */
  map?: Record<string, string>;
  /** Output directory */
  outDir?: string;
  /** Single output file */
  outFile?: string;
  /** Output file naming pattern */
  outPattern?: string;
  /** Generate .d.ts files */
  declaration?: boolean;
  /** Include Zod .describe() as TSDoc comments */
  withDescriptions?: boolean;
}

/**
 * Result of loading config.
 */
export interface ConfigLoadResult {
  /** The loaded configuration */
  config: ZinferConfig;
  /** Path to the config file (if found) */
  configPath?: string;
}

/**
 * Config file names to search for, in order of priority.
 */
const CONFIG_FILES = [
  "zinfer.config.ts",
  "zinfer.config.mts",
  "zinfer.config.js",
  "zinfer.config.mjs",
];

/**
 * Loads zinfer configuration from config file or package.json.
 */
export class ConfigLoader {
  /**
   * Loads configuration from the specified directory.
   *
   * @param cwd - Directory to search for config files
   * @returns Configuration and config file path
   */
  async load(cwd: string): Promise<ConfigLoadResult> {
    // Try config files first
    for (const configFile of CONFIG_FILES) {
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

    // No config found, return empty config
    return { config: {} };
  }

  /**
   * Loads configuration from a TypeScript/JavaScript config file.
   */
  private async loadConfigFile(configPath: string): Promise<ZinferConfig> {
    try {
      const fileUrl = pathToFileURL(configPath).href;
      const module = await import(fileUrl);
      return module.default || module;
    } catch (error) {
      console.warn(`Warning: Failed to load config from ${configPath}:`, (error as Error).message);
      return {};
    }
  }

  /**
   * Loads configuration from package.json's "zinfer" field.
   */
  private async loadFromPackageJson(packageJsonPath: string): Promise<ZinferConfig | null> {
    try {
      const content = await readFile(packageJsonPath, "utf-8");
      const packageJson = JSON.parse(content);

      if (packageJson.zinfer && typeof packageJson.zinfer === "object") {
        return packageJson.zinfer as ZinferConfig;
      }

      return null;
    } catch {
      return null;
    }
  }
}

/**
 * Creates a new ConfigLoader instance.
 */
export function createConfigLoader(): ConfigLoader {
  return new ConfigLoader();
}

/**
 * Merges CLI options with config file options.
 * CLI options take precedence over config file options.
 */
export function mergeConfig(
  configFile: ZinferConfig,
  cliOptions: Partial<ZinferConfig>,
): ZinferConfig {
  return {
    ...configFile,
    ...Object.fromEntries(Object.entries(cliOptions).filter(([_, v]) => v !== undefined)),
  };
}

/**
 * Defines a zinfer configuration with type checking.
 * Use this in zinfer.config.ts for type safety.
 *
 * @example
 * ```typescript
 * // zinfer.config.ts
 * import { defineConfig } from 'zinfer';
 *
 * export default defineConfig({
 *   include: ['src/** /*.schema.ts'],
 *   outDir: './types',
 *   unifySame: true,
 *   suffix: 'Schema',
 * });
 * ```
 */
export function defineConfig(config: ZinferConfig): ZinferConfig {
  return config;
}
