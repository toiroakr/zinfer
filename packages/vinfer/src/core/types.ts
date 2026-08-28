import type { ExtractResult as CoreExtractResult } from "@zinfer-monorepo/core";

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
  DeclarationOptions,
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
