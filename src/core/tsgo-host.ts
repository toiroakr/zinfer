import os from "node:os";
import path from "node:path";
import { readFileSync } from "node:fs";
import { API } from "@typescript/native-preview/unstable/sync";
import type { Project } from "@typescript/native-preview/unstable/sync";
import { SyntaxKind } from "@typescript/native-preview/unstable/ast";
import type { EnumDeclaration, SourceFile } from "@typescript/native-preview/unstable/ast";
import { parse as parseJsonc } from "jsonc-parser";
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
 *
 * When a real tsconfig.json is supplied, we serve a patched copy of it at
 * its *own* path (only `files` gets an extra entry appended) rather than
 * extracting `compilerOptions` into a from-scratch config elsewhere:
 * `Checker`/`parseConfigFile` return fully-resolved options (enum fields as
 * raw numbers, `lib` as resolved filenames), which isn't valid to re-embed
 * as tsconfig.json text, and moving the served config to a different
 * directory would break relative `extends`/`typeRoots` resolution. Keeping
 * the same path means `extends` and comments are simply passed through
 * unread - the tsgo server resolves them itself when it loads our patched
 * text - and every other relative path in the config keeps working exactly
 * as it would for the real project.
 */
export class TsgoHost implements TsHost<SourceFile> {
  private readonly api: API;
  private readonly projectConfigPath: string;
  private readonly realTsconfigPath: string | undefined;
  private readonly overlays = new Map<string, string>();
  private readonly virtualFiles = new Map<string, string>();
  private readonly normalizeFlags = new Set<string>();
  private currentRootFiles: string[] = [];

  constructor(tsconfigPath?: string) {
    this.realTsconfigPath = tsconfigPath ? path.resolve(tsconfigPath) : undefined;
    this.projectConfigPath =
      this.realTsconfigPath ??
      path.join(
        os.tmpdir(),
        `zinfer-tsgo-${process.pid}-${Math.random().toString(36).slice(2)}.tsconfig.json`,
      );

    this.api = new API({
      fs: {
        readFile: (fileName) => {
          const resolved = path.resolve(fileName);
          if (resolved === this.projectConfigPath) {
            return this.buildProjectConfig();
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
          if (resolved === this.projectConfigPath) return true;
          if (this.virtualFiles.has(resolved)) return true;
          return undefined;
        },
      },
    });
  }

  /**
   * Builds the text served for `projectConfigPath`. With a real tsconfig,
   * this is the original text - `extends`, comments, everything - with only
   * `files` appended to; `extends` is never read or resolved here, only
   * passed through for the server to handle.
   */
  private buildProjectConfig(): string {
    if (!this.realTsconfigPath) {
      return JSON.stringify({
        compilerOptions: DEFAULT_COMPILER_OPTIONS,
        files: this.currentRootFiles,
      });
    }

    const original = parseJsonc(readFileSync(this.realTsconfigPath, "utf8")) as Record<
      string,
      unknown
    >;
    const existingFiles = Array.isArray(original.files) ? original.files : [];
    return JSON.stringify({
      ...original,
      files: [...existingFiles, ...this.currentRootFiles],
    });
  }

  /**
   * Opens the virtual project scoped to exactly `rootFiles` for this call.
   * Always marks every root file (not just the config) as changed: since
   * the same path is repeatedly reused as a root across calls with
   * different virtual-FS overlay content (or none), the server must never
   * assume a cached parse of it is still valid.
   */
  private openProject(rootFiles: string[]): Project {
    this.currentRootFiles = rootFiles;
    const snapshot = this.api.updateSnapshot({
      openProject: this.projectConfigPath,
      fileChanges: { changed: [this.projectConfigPath, ...rootFiles] },
    });
    const project = snapshot.getProject(this.projectConfigPath);
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
