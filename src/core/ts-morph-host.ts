import { Project, SourceFile, TypeFormatFlags, ts } from "ts-morph";
import { NORMALIZE_TYPE_DEFINITION } from "./normalizer.js";
import type { TsHost } from "./ts-host.js";

/**
 * ts-morph-backed implementation of {@link TsHost}. Mirrors the historical
 * ZodTypeExtractor behavior: temporary type aliases are appended to the live
 * `SourceFile` via `addStatements` and removed via `TypeAliasDeclaration#remove`.
 */
export class TsMorphHost implements TsHost<SourceFile> {
  readonly project: Project;

  constructor(tsconfigPath?: string) {
    this.project = this.createProject(tsconfigPath);
  }

  getSourceFile(filePath: string): SourceFile {
    return this.project.getSourceFile(filePath) ?? this.project.addSourceFileAtPath(filePath);
  }

  tryGetSourceFile(filePath: string): SourceFile | undefined {
    return this.project.getSourceFile(filePath);
  }

  ensureNormalizeType(sourceFile: SourceFile): void {
    if (!sourceFile.getTypeAlias("__Normalize")) {
      sourceFile.addStatements([NORMALIZE_TYPE_DEFINITION]);
    }
  }

  cleanupNormalizeType(sourceFile: SourceFile): void {
    sourceFile.getTypeAlias("__Normalize")?.remove();
  }

  resolveTypes(
    sourceFile: SourceFile,
    statements: string[],
    typeNames: string[],
  ): Map<string, string> {
    sourceFile.addStatements(statements);
    try {
      const results = new Map<string, string>();
      for (const typeName of typeNames) {
        results.set(typeName, this.resolveType(sourceFile, typeName));
      }
      return results;
    } finally {
      for (const typeName of typeNames) {
        sourceFile.getTypeAlias(typeName)?.remove();
      }
    }
  }

  /**
   * Creates a ts-morph Project with appropriate compiler options.
   */
  private createProject(tsconfigPath?: string): Project {
    if (tsconfigPath) {
      return new Project({
        tsConfigFilePath: tsconfigPath,
        skipAddingFilesFromTsConfig: true,
        skipFileDependencyResolution: true,
      });
    }

    return new Project({
      skipFileDependencyResolution: true,
      compilerOptions: {
        strict: true,
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
        esModuleInterop: true,
        skipLibCheck: true,
      },
    });
  }

  /**
   * Resolves a type alias and returns its fully expanded string representation.
   */
  private resolveType(sourceFile: SourceFile, typeName: string): string {
    const typeAlias = sourceFile.getTypeAlias(typeName);
    if (!typeAlias) {
      throw new Error(`Failed to find type alias: ${typeName}`);
    }

    const type = typeAlias.getType();

    // Use TypeFormatFlags to get the fully expanded type without truncation
    // Don't use UseAliasDefinedOutsideCurrentScope to expand enum types
    const formatFlags = TypeFormatFlags.NoTruncation | TypeFormatFlags.InTypeAlias;

    let rawType = type.getText(typeAlias, formatFlags);

    // Remove trailing spaces from each line (ts-morph 27+ may add them)
    // Skip split/map/join for single-line types (most common case)
    if (rawType.includes("\n")) {
      rawType = rawType
        .split("\n")
        .map((line) => line.trimEnd())
        .join("\n");
    } else {
      rawType = rawType.trimEnd();
    }

    // Expand enum types: if the type is a single identifier, check if it's an enum
    if (/^[A-Z][a-zA-Z0-9]*$/.test(rawType)) {
      const enumDecl = sourceFile.getEnum(rawType);
      if (enumDecl) {
        // Extract enum values
        const members = enumDecl.getMembers();
        const values = members
          .map((member) => {
            const value = member.getValue();
            if (typeof value === "string") {
              return `"${value}"`;
            } else if (typeof value === "number") {
              return value.toString();
            }
            return null;
          })
          .filter(Boolean);

        if (values.length > 0) {
          rawType = values.join(" | ");
        }
      }
    }

    return rawType;
  }
}
