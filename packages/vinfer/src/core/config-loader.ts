import { defineConfig as sharedDefineConfig, type InferConfig } from "@zinfer-monorepo/core";

/**
 * Configuration options that can be specified in config file.
 */
export type VinferConfig = InferConfig & {
  /**
   * How a `.brand()`/`.flavor()` marker is represented in the generated
   * output. `"valibot-import"` (default) prints `Brand<"Tag">` /
   * `Flavor<"Tag">` and imports `Brand`/`Flavor` from "valibot".
   * `"local-symbol"` prints a self-contained `unique symbol`-keyed property
   * instead, so the generated file never imports valibot.
   */
  brandStrategy?: "valibot-import" | "local-symbol";
};

/**
 * Defines a vinfer configuration with type checking.
 * Use this in vinfer.config.ts for type safety.
 *
 * @example
 * ```typescript
 * // vinfer.config.ts
 * import { defineConfig } from 'vinfer';
 *
 * export default defineConfig({
 *   include: ['src/** /*.schema.ts'],
 *   outDir: './types',
 *   mergeSame: true,
 *   suffix: 'Schema',
 * });
 * ```
 */
export function defineConfig(config: VinferConfig): VinferConfig {
  return sharedDefineConfig(config);
}
