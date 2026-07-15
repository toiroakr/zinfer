/**
 * Abstraction boundary around the TypeScript "type resolution" primitives that
 * ZodTypeExtractor needs: loading a source file, and resolving the fully
 * expanded text of one or more type aliases after temporarily injecting
 * synthetic type-alias statements (e.g. `__TempInput` / `__TempOutput`).
 *
 * This exists so the trickiest, most compiler-API-specific piece of the
 * extraction pipeline - injecting throwaway type aliases and asking the
 * checker to expand them - has a single, narrow seam. Today the only
 * implementation is `TsMorphHost`. A future `TsgoHost` (built on
 * `@typescript/native-preview`'s Corsa API, once its public surface
 * stabilizes around TypeScript 7.1) can implement the same contract by
 * building a virtual-FS overlay per call instead of mutating a live
 * `SourceFile`, without ZodTypeExtractor's orchestration logic changing.
 *
 * Other core modules (SchemaDetector, GetterResolver, ImportResolver,
 * BrandDetector, SchemaReferenceAnalyzer) still work directly against
 * ts-morph's `SourceFile`/`Node` types and are out of scope for this
 * abstraction.
 */
export interface TsHost<TSourceFile = unknown> {
  /** Loads (if necessary) and returns the source file at `filePath`. */
  getSourceFile(filePath: string): TSourceFile;

  /** Returns the source file at `filePath` only if it is already loaded. */
  tryGetSourceFile(filePath: string): TSourceFile | undefined;

  /**
   * Ensures the shared `__Normalize<T>` helper type is present in
   * `sourceFile`. Idempotent; safe to call before every batch of
   * `resolveTypes` calls against the same file.
   */
  ensureNormalizeType(sourceFile: TSourceFile): void;

  /** Removes the `__Normalize<T>` helper type injected by `ensureNormalizeType`. */
  cleanupNormalizeType(sourceFile: TSourceFile): void;

  /**
   * Temporarily injects `statements` (type-alias declarations, e.g.
   * `type __TempInput = ...;`) into `sourceFile`, resolves the fully
   * expanded type text for each name in `typeNames`, then removes the
   * injected statements again - regardless of whether resolution succeeded.
   *
   * @returns a map from type name to its expanded, printable type text.
   */
  resolveTypes(
    sourceFile: TSourceFile,
    statements: string[],
    typeNames: string[],
  ): Map<string, string>;
}
