import type { DeclarationOptions as CoreDeclarationOptions } from "@zinfer-monorepo/core";

export type {
  ExtractOptions,
  ExtractContext,
  DetectedSchema,
  FieldDescription,
  ExtractResult,
  FileExtractResult,
  MappedTypeName,
  NameMappingOptions,
  OutputOptions,
  GeneratedFile,
  TypeReferenceScope,
} from "@zinfer-monorepo/core";

/**
 * Options for type declaration formatting.
 *
 * A type alias (not `interface X extends Y`) on purpose: dts-bundle-generator
 * flattens the published .d.ts into one file, and an `extends` of a
 * same-named core interface makes it try to export both under the identical
 * name "DeclarationOptions", colliding and silently renaming one of them.
 */
export type DeclarationOptions = CoreDeclarationOptions & {
  /**
   * How a `.brand()` marker is represented in the generated output.
   * `"zod-import"` (default) prints `BRAND<"Tag">` and imports `BRAND` from
   * zod. `"local-symbol"` prints a self-contained `unique symbol`-keyed
   * property instead, so the generated file never imports zod.
   */
  brandStrategy?: "zod-import" | "local-symbol";
};
