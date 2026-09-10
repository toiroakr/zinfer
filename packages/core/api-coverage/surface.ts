import path from "node:path";
import {
  ModuleKind,
  ModuleResolutionKind,
  Node,
  Project,
  type SourceFile,
  type Type,
  ts,
} from "ts-morph";

// These are implementation utilities or duplicate entry points, rather than schema APIs.
const EXCLUDED_NAMESPACES = new Set(["core", "util", "regexes", "locales", "z", "default"]);

function isNamespace(type: Type): boolean {
  return (
    type
      .getSymbol()
      ?.getDeclarations()
      .some((node) => Node.isSourceFile(node) || Node.isModuleDeclaration(node)) ?? false
  );
}

/** Collect names from the upstream declarations, independently of our builder registries. */
export function collectSurface(source: SourceFile): string {
  const importDeclaration = source.getImportDeclarations()[0];
  if (!importDeclaration) throw new Error("API inspection requires a namespace import");
  const library = importDeclaration.getModuleSpecifierSourceFileOrThrow();
  const namespace = importDeclaration.getNamespaceImportOrThrow().getType();
  if (namespace.isAny() || namespace.getProperties().length === 0) {
    throw new Error("Cannot inspect an unresolved or empty library API");
  }

  const checker = source.getProject().getTypeChecker().compilerObject;
  function signatures(type: Type): string[] {
    return [...type.getCallSignatures(), ...type.getConstructSignatures()].map((signature) => {
      // Record the public declaration, not every instantiation of an inherited generic method.
      const declared = checker.getSignatureFromDeclaration(signature.getDeclaration().compilerNode);
      return checker.signatureToString(
        declared ?? signature.compilerSignature,
        undefined,
        ts.TypeFormatFlags.NoTruncation,
      );
    });
  }

  const exports: string[] = [];
  function visit(type: Type, prefix: string, ancestors: Set<Type>): void {
    for (const property of type.getProperties()) {
      const name = prefix + property.getName();
      const value = property.getTypeAtLocation(source);
      if (isNamespace(value)) {
        const excluded = prefix === "" && EXCLUDED_NAMESPACES.has(name);
        exports.push(`${name}: namespace${excluded ? " (excluded)" : ""}`);
        if (!excluded && !ancestors.has(value)) {
          visit(value, `${name}.`, new Set([...ancestors, value]));
        }
      } else {
        const kind = value.getCallSignatures().length
          ? "callable"
          : value.getConstructSignatures().length
            ? "constructor"
            : "value";
        exports.push(
          `${name}: ${kind}${signatures(value)
            .map((signature) => `\n  ${signature}`)
            .join("")}`,
        );
      }
    }
  }
  visit(namespace, "", new Set([namespace]));

  // Group equal member sets to avoid repeating inherited Zod methods for every string format.
  const members = new Map<string, string[]>();
  for (const symbol of library.getExportSymbols()) {
    const type = (symbol.getAliasedSymbol() ?? symbol).getDeclaredType();
    if (!type.getProperty("_zod") && !type.getProperty("~run")) continue;
    const names = type
      .getProperties()
      .filter((property) => !/^[~_$]/.test(property.getName()))
      .map(
        (property) =>
          property.getName() +
          signatures(property.getTypeAtLocation(source))
            .map((signature) => `: ${signature}`)
            .join(" | "),
      )
      .sort();
    const key = names.join("\n  ");
    members.set(key, [...(members.get(key) ?? []), symbol.getName()]);
  }
  const groups = [...members]
    .map(([names, owners]) => `${owners.sort().join(", ")}\n  ${names}`)
    .sort();
  return `# Exports\n${exports.sort().join("\n")}\n\n# Schema and action members\n${groups.join("\n\n")}\n`;
}

export function inspectLibrary(packageDirectory: string, moduleSpecifier: string): string {
  const project = new Project({
    compilerOptions: {
      strict: true,
      skipLibCheck: true,
      module: ModuleKind.ESNext,
      moduleResolution: ModuleResolutionKind.Bundler,
      types: [],
    },
  });
  // Resolution starts at the consumer package, so each adapter's installed dependency is inspected.
  const source = project.createSourceFile(
    path.join(packageDirectory, "__api_surface__.ts"),
    `import * as library from ${JSON.stringify(moduleSpecifier)};`,
  );
  const diagnostics = source.getPreEmitDiagnostics();
  if (diagnostics.length)
    throw new Error(project.formatDiagnosticsWithColorAndContext(diagnostics));
  return collectSurface(source);
}
