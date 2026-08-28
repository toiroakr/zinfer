import type {
  ExtractResult as CoreExtractResult,
  DeclarationOptions as CoreDeclarationOptions,
} from "@zinfer-monorepo/core";

export type {
  ExtractOptions,
  ExtractContext,
  DetectedSchema,
  FieldDescription,
  FileExtractResult,
  MappedTypeName,
  NameMappingOptions,
  OutputOptions,
  GeneratedFile,
} from "@zinfer-monorepo/core";

/**
 * Result of extracting types from a single schema.
 *
 * A type alias (not `interface X extends Y`) on purpose: dts-bundle-generator
 * flattens the published .d.ts into one file, and an `extends` of a
 * same-named core interface makes it try to export both under the identical
 * name "ExtractResult", colliding and silently renaming one of them.
 */
export type ExtractResult = CoreExtractResult & {
  /**
   * The schema's name as declared in `importedFrom`, when it differs from
   * `schemaName` (an aliased named import, e.g. `import { X as Y }`). The
   * declaring file names its generated types after this one, not after the
   * local alias, so the `import type` has to bridge the two with `as`.
   */
  originalName?: string;
};

/**
 * Options for type declaration formatting.
 *
 * A type alias (not `interface X extends Y`) on purpose - same reasoning as
 * `ExtractResult` above, this time for the identical name "DeclarationOptions".
 */
export type DeclarationOptions = CoreDeclarationOptions & {
  /**
   * How a `.brand()`/`.flavor()` marker is represented in the generated
   * output. `"valibot-import"` (default) prints `Brand<"Tag">` /
   * `Flavor<"Tag">` and imports `Brand`/`Flavor` from "valibot".
   * `"local-symbol"` prints a self-contained `unique symbol`-keyed property
   * instead, so the generated file never imports valibot.
   */
  brandStrategy?: "valibot-import" | "local-symbol";
};
