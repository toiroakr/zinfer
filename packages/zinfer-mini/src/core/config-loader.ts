import { defineConfig as sharedDefineConfig, type InferConfig } from "@zinfer-monorepo/core";

/**
 * Configuration options that can be specified in config file.
 */
export interface ZinferMiniConfig extends InferConfig {
  /**
   * How a `.brand()` marker is represented in the generated output.
   * `"zod-import"` (default) prints `BRAND<"Tag">` and imports `BRAND` from
   * zod. `"local-symbol"` prints a self-contained `unique symbol`-keyed
   * property instead, so the generated file never imports zod.
   */
  brandStrategy?: "zod-import" | "local-symbol";
}

/**
 * Defines a zinfer-mini configuration with type checking.
 * Use this in zinfer-mini.config.ts for type safety.
 *
 * @example
 * ```typescript
 * // zinfer-mini.config.ts
 * import { defineConfig } from 'zinfer-mini';
 *
 * export default defineConfig({
 *   include: ['src/** /*.schema.ts'],
 *   outDir: 'src/types',
 *   suffix: 'Schema',
 * });
 * ```
 */
export function defineConfig(config: ZinferMiniConfig): ZinferMiniConfig {
  return sharedDefineConfig(config);
}
