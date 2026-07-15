import os from "node:os";
import path from "node:path";
import { API, ModuleKind } from "@typescript/native-preview/unstable/sync";
import type { Project } from "@typescript/native-preview/unstable/sync";
import { ScriptTarget, SyntaxKind } from "@typescript/native-preview/unstable/ast";
import type { EnumDeclaration, SourceFile } from "@typescript/native-preview/unstable/ast";
import { NORMALIZE_TYPE_DEFINITION } from "./normalizer.js";
import type { TsHost } from "./ts-host.js";

const DEFAULT_COMPILER_OPTIONS: Record<string, unknown> = {
  strict: true,
  target: "ESNext",
  module: "ESNext",
  moduleResolution: "bundler",
  esModuleInterop: true,
  skipLibCheck: true,
};

// TS's ModuleResolutionKind isn't re-exported from the public unstable/*
// surface; these numeric values are stable across TS versions.
const MODULE_RESOLUTION_KIND_NAMES: Record<number, string> = {
  1: "classic",
  2: "node10",
  3: "node16",
  99: "nodenext",
  100: "bundler",
};

/**
 * `Checker`/`parseConfigFile` return fully-resolved CompilerOptions: enum
 * fields as raw numbers, `lib` as resolved lib filenames (e.g.
 * `"lib.es2022.d.ts"` instead of the `"es2022"` tsconfig.json expects), and
 * paths (rootDir/outDir/...) absolutized against the *original* project.
 * Naively re-embedding that into our own from-scratch virtual tsconfig.json
 * would fail to parse (invalid `--lib` values, numeric enum fields) and
 * inherit rootDir/outDir constraints from a project zinfer isn't actually
 * building. Only carry over the handful of fields that affect type-checking
 * of the target file, normalized back to valid tsconfig.json string form.
 *
 * `types`/`typeRoots` are resolved relative to the tsconfig's own directory,
 * which for our virtual tsconfig is an unrelated temp directory - so an
 * explicit `types: ["node"]` from the original project would otherwise fail
 * to resolve `@types/node` at all (breaking even ambient globals like
 * `Object`/`Function`). `typeRoots` is pointed at the original project's
 * `node_modules/@types` so `types` keeps resolving correctly.
 */
function sanitizeCompilerOptions(
  options: Record<string, unknown>,
  originalTsconfigDir: string,
): Record<string, unknown> {
  const KEEP_KEYS = [
    "strict",
    "esModuleInterop",
    "skipLibCheck",
    "resolveJsonModule",
    "isolatedModules",
    "forceConsistentCasingInFileNames",
    "allowJs",
    "checkJs",
    "types",
  ] as const;

  const result: Record<string, unknown> = {};
  for (const key of KEEP_KEYS) {
    if (key in options) result[key] = options[key];
  }

  if (Array.isArray(options.lib)) {
    result.lib = options.lib.map((lib) =>
      typeof lib === "string" ? lib.replace(/^lib\./, "").replace(/\.d\.ts$/, "") : lib,
    );
  }
  if (typeof options.target === "number") {
    result.target = ScriptTarget[options.target] ?? DEFAULT_COMPILER_OPTIONS.target;
  }
  if (typeof options.module === "number") {
    result.module = ModuleKind[options.module] ?? DEFAULT_COMPILER_OPTIONS.module;
  }
  if (typeof options.moduleResolution === "number") {
    result.moduleResolution =
      MODULE_RESOLUTION_KIND_NAMES[options.moduleResolution] ??
      DEFAULT_COMPILER_OPTIONS.moduleResolution;
  }
  if ("types" in options) {
    result.typeRoots = [path.join(originalTsconfigDir, "node_modules", "@types")];
  }

  return result;
}

const NO_TRUNCATION = 1;
const IN_TYPE_ALIAS = 8388608;
const FORMAT_FLAGS = NO_TRUNCATION | IN_TYPE_ALIAS;

/**
 * tsgo/Corsa-API-backed implementation of {@link TsHost}. Unlike ts-morph,
 * the Corsa API is read-only at the AST level: there is no live SourceFile
 * to mutate. Temporary type aliases are instead injected via a virtual-FS
 * overlay - the file's real content plus appended synthetic statements - so
 * each `resolveTypes` call opens a throwaway, self-contained snapshot rather
 * than mutating shared state. See issue #200.
 *
 * Each operation (getSourceFile/resolveTypes/...) opens its virtual project
 * scoped to only the one file it needs (plus whatever that file transitively
 * imports) rather than accumulating every file ever touched into one
 * ever-growing program: letting unrelated root files pile up in the same
 * program was observed to make the checker's printed member order for
 * union/object types depend on incidental cross-file caching, producing
 * non-deterministic output depending on what else had been processed
 * earlier in the same run.
 */
export class TsgoHost implements TsHost<SourceFile> {
  private readonly api: API;
  private readonly virtualTsconfigPath: string;
  private readonly compilerOptions: Record<string, unknown>;
  private readonly overlays = new Map<string, string>();
  private readonly virtualFiles = new Map<string, string>();
  private readonly normalizeFlags = new Set<string>();
  private currentRootFiles: string[] = [];

  constructor(tsconfigPath?: string) {
    this.virtualTsconfigPath = path.join(
      os.tmpdir(),
      `zinfer-tsgo-${process.pid}-${Math.random().toString(36).slice(2)}.tsconfig.json`,
    );

    this.api = new API({
      fs: {
        readFile: (fileName) => {
          const resolved = path.resolve(fileName);
          if (resolved === this.virtualTsconfigPath) {
            return this.buildVirtualTsconfig();
          }
          if (this.overlays.has(resolved)) {
            return this.overlays.get(resolved);
          }
          if (this.virtualFiles.has(resolved)) {
            return this.virtualFiles.get(resolved);
          }
          return undefined;
        },
        fileExists: (fileName) => {
          const resolved = path.resolve(fileName);
          if (resolved === this.virtualTsconfigPath) return true;
          if (this.virtualFiles.has(resolved)) return true;
          return undefined;
        },
      },
    });

    this.compilerOptions = tsconfigPath
      ? sanitizeCompilerOptions(
          this.api.parseConfigFile(path.resolve(tsconfigPath)).options as Record<string, unknown>,
          path.dirname(path.resolve(tsconfigPath)),
        )
      : DEFAULT_COMPILER_OPTIONS;
  }

  private buildVirtualTsconfig(): string {
    return JSON.stringify({
      compilerOptions: this.compilerOptions,
      files: this.currentRootFiles,
    });
  }

  /**
   * Opens the virtual project scoped to exactly `rootFiles` for this call.
   * Always marks every root file (not just the tsconfig) as changed: since
   * the same real path is repeatedly reused as a root across calls with
   * different virtual-FS overlay content (or none), the server must never
   * assume a cached parse of it is still valid.
   */
  private openProject(rootFiles: string[]): Project {
    this.currentRootFiles = rootFiles;
    const snapshot = this.api.updateSnapshot({
      openProject: this.virtualTsconfigPath,
      fileChanges: { changed: [this.virtualTsconfigPath, ...rootFiles] },
    });
    const project = snapshot.getProject(this.virtualTsconfigPath);
    if (!project) {
      throw new Error("tsgo: failed to open virtual project");
    }
    return project;
  }

  /** Returns the tsgo Project for whichever file was most recently requested. */
  get project(): Project {
    return this.openProject(this.currentRootFiles);
  }

  getSourceFile(filePath: string): SourceFile {
    const resolved = path.resolve(filePath);
    const project = this.openProject([resolved]);
    const sourceFile = project.program.getSourceFile(resolved);
    if (!sourceFile) {
      throw new Error(`tsgo: source file not found in program: ${resolved}`);
    }
    return sourceFile;
  }

  tryGetSourceFile(filePath: string): SourceFile | undefined {
    const resolved = path.resolve(filePath);
    const project = this.openProject([resolved]);
    return project.program.getSourceFile(resolved);
  }

  /**
   * Creates an in-memory source file from `content`, not backed by any real
   * file on disk. `fileName` need not exist; it is only used as a stable
   * identifier. Mirrors ts-morph's `Project#createSourceFile`.
   */
  createVirtualSourceFile(fileName: string, content: string): SourceFile {
    const resolved = path.resolve(fileName);
    this.virtualFiles.set(resolved, content);
    const project = this.openProject([resolved]);
    const sourceFile = project.program.getSourceFile(resolved);
    if (!sourceFile) {
      throw new Error(`tsgo: virtual source file not found: ${resolved}`);
    }
    return sourceFile;
  }

  ensureNormalizeType(sourceFile: SourceFile): void {
    this.normalizeFlags.add(sourceFile.fileName);
  }

  cleanupNormalizeType(sourceFile: SourceFile): void {
    this.normalizeFlags.delete(sourceFile.fileName);
  }

  resolveTypes(
    sourceFile: SourceFile,
    statements: string[],
    typeNames: string[],
  ): Map<string, string> {
    const filePath = sourceFile.fileName;
    const normalizeContent = this.normalizeFlags.has(filePath) ? NORMALIZE_TYPE_DEFINITION : "";
    const overlayContent = `${sourceFile.text}\n${normalizeContent}\n${statements.join("\n")}\n`;

    this.overlays.set(filePath, overlayContent);
    try {
      const project = this.openProject([filePath]);
      const overlaidSourceFile = project.program.getSourceFile(filePath);
      if (!overlaidSourceFile) {
        throw new Error(`tsgo: source file not found after overlay: ${filePath}`);
      }

      const results = new Map<string, string>();
      for (const typeName of typeNames) {
        const declIdx = overlayContent.indexOf(`type ${typeName}`);
        if (declIdx === -1) {
          throw new Error(`tsgo: could not find injected type alias "${typeName}"`);
        }
        const identPos = declIdx + "type ".length;

        const symbol = project.checker.getSymbolAtPosition(filePath, identPos);
        if (!symbol) {
          throw new Error(`tsgo: failed to resolve symbol for type alias "${typeName}"`);
        }

        const type = project.checker.getDeclaredTypeOfSymbol(symbol);
        let rawType = project.checker.typeToString(type, undefined, FORMAT_FLAGS);

        if (rawType.includes("\n")) {
          rawType = rawType
            .split("\n")
            .map((line) => line.trimEnd())
            .join("\n");
        } else {
          rawType = rawType.trimEnd();
        }

        if (/^[A-Z][a-zA-Z0-9]*$/.test(rawType)) {
          const expanded = this.tryExpandEnum(overlaidSourceFile, rawType, project);
          if (expanded) {
            rawType = expanded;
          }
        }

        results.set(typeName, rawType);
      }
      return results;
    } finally {
      this.overlays.delete(filePath);
    }
  }

  private tryExpandEnum(
    sourceFile: SourceFile,
    name: string,
    project: Project,
  ): string | undefined {
    const enumDecl = sourceFile.statements.find(
      (s) =>
        s.kind === SyntaxKind.EnumDeclaration &&
        (s as EnumDeclaration).name.getText(sourceFile) === name,
    ) as EnumDeclaration | undefined;
    if (!enumDecl) return undefined;

    const values = enumDecl.members
      .map((member) => {
        const value = project.checker.getConstantValue(member);
        if (typeof value === "string") return `"${value}"`;
        if (typeof value === "number") return value.toString();
        return null;
      })
      .filter((v): v is string => v !== null);

    if (values.length === 0) return undefined;
    return values.join(" | ");
  }
}
