import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import * as ast from "typescript-native/ast";
import {
  API,
  ModuleKind,
  ModuleResolutionKind,
  TypeFormatFlags,
  SymbolFlags,
  type RawCompilerOptions,
  type Snapshot,
  type Project as NativeProject,
} from "typescript-native/sync";
import { createFileSystemLayer } from "typescript-native/fs";

export type {
  SourceFile,
  VariableDeclaration,
  ImportDeclaration,
  CallExpression,
  PropertyAccessExpression,
  TypeAliasDeclaration,
  InterfaceDeclaration,
  ClassDeclaration,
  EnumDeclaration,
  Expression,
  ObjectLiteralExpression,
} from "typescript-native/ast";
export { TypeFormatFlags, ModuleKind, ModuleResolutionKind } from "typescript-native/sync";
export { SyntaxKind } from "typescript-native/ast";
export const ts = { ...ast, ModuleKind, ModuleResolutionKind, TypeFormatFlags };
export type Node = ast.Node;
export const Node = { ...ast, isTypeReference: ast.isTypeReferenceNode };

function fileKey(fileName: string): string {
  return resolve(fileName).split(sep).join("/");
}

const owners = new WeakMap<ast.SourceFile, Project>();
function owner(node: ast.Node): Project {
  const source = node.getSourceFile();
  const existing = owners.get(source);
  if (existing) return existing;
  const project = new Project();
  project.adoptSource(source);
  return project;
}
function current(source: ast.SourceFile): ast.SourceFile {
  return owner(source).getSourceFile(source.fileName) ?? source;
}

interface ProjectOptions {
  tsConfigFilePath?: string;
  compilerOptions?: RawCompilerOptions;
}

export class Project {
  private api: API | undefined;
  private snapshot: Snapshot | undefined;
  private native: NativeProject | undefined;
  private root: string | undefined;
  private files = new Map<string, ast.SourceFile>();
  private originals = new Map<string, ast.SourceFile>();
  private revision = 0;
  private programRevision = -1;
  private options: RawCompilerOptions | undefined;
  private sessionDepth = 0;

  run<T>(operation: () => T): T {
    this.sessionDepth++;
    try {
      return operation();
    } finally {
      this.files = new Map(this.originals);
      this.revision++;
      if (--this.sessionDepth === 0) this.close();
    }
  }

  query<T>(node: ast.Node, operation: (project: NativeProject, live: ast.Node) => T): T {
    this.sessionDepth++;
    try {
      const native = this.program(node);
      return operation(native, liveNode(node, native));
    } finally {
      if (--this.sessionDepth === 0) this.close();
    }
  }

  constructor(private readonly config: ProjectOptions = {}) {}

  adoptSource(source: ast.SourceFile): void {
    owners.set(source, this);
    this.files.set(fileKey(source.fileName), source);
    this.originals.set(fileKey(source.fileName), source);
    this.revision++;
  }

  private client(): API {
    return (this.api ??= new API());
  }

  private getCompilerOptions(): RawCompilerOptions {
    return (this.options ??= this.config.tsConfigFilePath
      ? this.client().parseConfigFile(resolve(this.config.tsConfigFilePath)).options
      : {
          strict: true,
          target: ast.ScriptTarget.ESNext,
          module: ModuleKind.ESNext,
          moduleResolution: ModuleResolutionKind.Bundler,
          skipLibCheck: true,
          ...this.config.compilerOptions,
        });
  }

  parseSource(fileName: string, text: string): ast.SourceFile {
    const lease = this.client().createSourceFile(resolve(fileName), text);
    const source = lease.sourceFile;
    owners.set(source, this);
    lease.dispose();
    if (this.sessionDepth === 0) this.close();
    return source;
  }

  createSourceFile(fileName: string, text: string): ast.SourceFile {
    const source = this.parseSource(fileName, text);
    this.files.set(fileKey(source.fileName), source);
    this.originals.set(fileKey(source.fileName), source);
    this.revision++;
    return source;
  }

  updateSource(fileName: string, text: string): ast.SourceFile {
    const source = this.parseSource(fileName, text);
    this.files.set(fileKey(source.fileName), source);
    this.revision++;
    return source;
  }

  getSourceFile(fileName: string): ast.SourceFile | undefined {
    return this.files.get(fileKey(fileName));
  }

  addSourceFileAtPath(fileName: string): ast.SourceFile {
    return (
      this.getSourceFile(fileName) ??
      this.createSourceFile(fileName, readFileSync(fileName, "utf8"))
    );
  }

  addSourceFileAtPathIfExists(fileName: string): ast.SourceFile | undefined {
    return (
      this.getSourceFile(fileName) ??
      (existsSync(fileName) ? this.addSourceFileAtPath(fileName) : undefined)
    );
  }

  program(node: ast.Node): NativeProject {
    const file = node.getSourceFile().fileName;
    if (this.native && this.root === file && this.programRevision === this.revision)
      return this.native;
    this.native?.program.dispose();
    this.snapshot?.dispose();
    this.snapshot = this.client().createSnapshot({
      fileSystem: createFileSystemLayer(
        [...this.files].map(([name, source]) => [name, source.text]),
      ),
      createPrograms: [
        {
          rootFiles: [
            file,
            ...[...this.originals.values()]
              .filter((source) => source.isDeclarationFile && source.fileName !== file)
              .map((source) => source.fileName),
          ],
          compilerOptions: this.getCompilerOptions(),
        },
      ],
    });
    const program = this.snapshot.operation.createdPrograms![0];
    this.native = this.snapshot.getProject(program.id)!;
    this.root = file;
    this.programRevision = this.revision;
    return this.native;
  }

  resolveModule(moduleName: string, containingFile: string) {
    const resolver = this.client().createModuleResolver(this.getCompilerOptions());
    try {
      return resolver.resolveModuleName(moduleName, dirname(containingFile), undefined, {
        snapshot: this.snapshot,
      }).resolvedModule;
    } finally {
      resolver.dispose();
    }
  }

  close(): void {
    this.native?.program.dispose();
    this.snapshot?.dispose();
    this.api?.close();
    this.native = undefined;
    this.snapshot = undefined;
    this.api = undefined;
  }

  [Symbol.dispose](): void {
    this.close();
  }
}

export function getName(node: ast.Node): string {
  if (ast.isImportSpecifier(node) || ast.isExportSpecifier(node))
    return (node.propertyName ?? node.name).getText();
  if ("name" in node) {
    const name = node.name as ast.Node | undefined;
    if (name) return name.getText();
  }
  throw new Error(`Node ${ast.SyntaxKind[node.kind]} has no name`);
}
export function getFilePath(source: ast.SourceFile): string {
  return source.fileName;
}
export function getDirectoryPath(source: ast.SourceFile): string {
  return dirname(source.fileName);
}
export function getStartLineNumber(node: ast.Node): number {
  return node.getSourceFile().getLineAndCharacterOfPosition(node.getStart()).line + 1;
}
export function getLiteralValue(node: ast.StringLiteral): string {
  return node.text;
}
export function getLiteralText(node: ast.StringLiteral): string {
  return node.text;
}
export function getVariableStatements(source: ast.SourceFile): ast.VariableStatement[] {
  return current(source).statements.filter(ast.isVariableStatement);
}
export function getDeclarations(statement: ast.VariableStatement): ast.VariableDeclaration[] {
  return [...statement.declarationList.declarations];
}
export function getVariableDeclaration(
  source: ast.SourceFile,
  name: string,
): ast.VariableDeclaration | undefined {
  return getVariableStatements(source)
    .flatMap(getDeclarations)
    .find((decl) => getName(decl) === name);
}
export function getImportDeclarations(source: ast.SourceFile): ast.ImportDeclaration[] {
  return current(source).statements.filter(ast.isImportDeclaration);
}
export function getExportDeclarations(source: ast.SourceFile): ast.ExportDeclaration[] {
  return current(source).statements.filter(ast.isExportDeclaration);
}
export function getNamedImports(node: ast.ImportDeclaration): readonly ast.ImportSpecifier[] {
  const bindings = node.importClause?.namedBindings;
  return bindings && ast.isNamedImports(bindings) ? bindings.elements : [];
}
export function getNamedExports(node: ast.ExportDeclaration): readonly ast.ExportSpecifier[] {
  return node.exportClause && ast.isNamedExports(node.exportClause)
    ? node.exportClause.elements
    : [];
}
export function getAliasNode(
  node: ast.ImportSpecifier | ast.ExportSpecifier,
): ast.ModuleExportName | undefined {
  return node.propertyName ? node.name : undefined;
}
export function getNamespaceImport(node: ast.ImportDeclaration): ast.Identifier | undefined {
  const bindings = node.importClause?.namedBindings;
  return bindings && ast.isNamespaceImport(bindings) ? bindings.name : undefined;
}
export function getDefaultImport(node: ast.ImportDeclaration): ast.Identifier | undefined {
  return node.importClause?.name;
}
export function getModuleSpecifierValue(
  node: ast.ImportDeclaration | ast.ExportDeclaration,
): string {
  return node.moduleSpecifier && ast.isStringLiteral(node.moduleSpecifier)
    ? node.moduleSpecifier.text
    : "";
}
export function getModuleSpecifierSourceFile(
  node: ast.ImportDeclaration | ast.ExportDeclaration,
): ast.SourceFile | undefined {
  const host = owner(node);
  return host.query(node, (project, live) => {
    const declaration = live as ast.ImportDeclaration | ast.ExportDeclaration;
    const specifier = declaration.moduleSpecifier;
    if (!specifier || !ast.isStringLiteral(specifier)) return undefined;
    const resolved = project.program.getResolvedModuleFromModuleSpecifier(specifier);
    return resolved && host.addSourceFileAtPathIfExists(resolved.resolvedFileName);
  });
}
export function isExported(node: ast.Node): boolean {
  if (
    "modifiers" in node &&
    (node.modifiers as readonly ast.Node[] | undefined)?.some(
      (m) => m.kind === ast.SyntaxKind.ExportKeyword || m.kind === ast.SyntaxKind.DefaultKeyword,
    )
  )
    return true;
  if (ast.isVariableDeclaration(node)) return isExported(node.parent.parent);
  return false;
}
export function getTypeAliases(source: ast.SourceFile): ast.TypeAliasDeclaration[] {
  return current(source).statements.filter(ast.isTypeAliasDeclaration);
}
export function getInterfaces(source: ast.SourceFile): ast.InterfaceDeclaration[] {
  return current(source).statements.filter(ast.isInterfaceDeclaration);
}
export function getEnums(source: ast.SourceFile): ast.EnumDeclaration[] {
  return current(source).statements.filter(ast.isEnumDeclaration);
}
export function getTypeAlias(
  source: ast.SourceFile,
  name: string,
): ast.TypeAliasDeclaration | undefined {
  return getTypeAliases(source).find((n) => getName(n) === name);
}
export function getInterface(
  source: ast.SourceFile,
  name: string,
): ast.InterfaceDeclaration | undefined {
  return getInterfaces(source).find((n) => getName(n) === name);
}
export function getEnum(source: ast.SourceFile, name: string): ast.EnumDeclaration | undefined {
  return getEnums(source).find((n) => getName(n) === name);
}
export function getClass(source: ast.SourceFile, name: string): ast.ClassDeclaration | undefined {
  return current(source)
    .statements.filter(ast.isClassDeclaration)
    .find((n) => n.name?.text === name);
}
export function addStatements(source: ast.SourceFile, statements: string[]): ast.Statement[] {
  const live = current(source);
  const next = owner(source).updateSource(
    source.fileName,
    live.text + "\n" + statements.join("\n") + "\n",
  );
  return next.statements.slice(live.statements.length);
}
export function remove(node: ast.Node): void {
  const source = current(node.getSourceFile());
  owner(node).updateSource(
    source.fileName,
    source.text.slice(0, node.getFullStart()) + source.text.slice(node.end),
  );
}
export function forEachDescendant(
  node: ast.Node,
  visitor: (node: ast.Node, traversal: { skip(): void }) => void,
): void {
  node.forEachChild((child) => {
    let skip = false;
    visitor(child, {
      skip() {
        skip = true;
      },
    });
    if (!skip) forEachDescendant(child, visitor);
  });
}
type NodeFor<K> = K extends ast.SyntaxKind.GetAccessor
  ? ast.GetAccessorDeclaration
  : K extends ast.SyntaxKind.ReturnStatement
    ? ast.ReturnStatement
    : K extends ast.SyntaxKind.TypeQuery
      ? ast.TypeQueryNode
      : ast.Node;
export function getDescendantsOfKind<K extends ast.SyntaxKind>(
  node: ast.Node,
  kind: K,
): NodeFor<K>[] {
  const result: ast.Node[] = [];
  forEachDescendant(node, (child) => {
    if (child.kind === kind) result.push(child);
  });
  return result as NodeFor<K>[];
}
export function getFirstDescendantByKind<K extends ast.SyntaxKind>(
  node: ast.Node,
  kind: K,
): NodeFor<K> | undefined {
  return getDescendantsOfKind(node, kind)[0];
}

function liveNode(node: ast.Node, project: NativeProject): ast.Node {
  return matchingNode(project.program.getSourceFile(node.getSourceFile().fileName)!, node);
}

function matchingNode(source: ast.SourceFile, node: ast.Node): ast.Node {
  if (ast.isSourceFile(node)) return source;
  const start = node.getStart();
  let found: ast.Node | undefined;
  const visit = (child: ast.Node): void => {
    if (child.kind === node.kind && child.getStart() === start && child.end === node.end) {
      found = child;
      return;
    }
    if (child.pos <= start && child.end >= node.end) child.forEachChild(visit);
  };
  visit(source);
  if (!found) throw new Error(`Cannot locate ${ast.SyntaxKind[node.kind]} at ${start}`);
  return found;
}

export function typeOf(node: ast.Node) {
  const host = owner(node);
  return {
    getText(enclosing?: ast.Node, flags?: TypeFormatFlags): string {
      return host.query(node, (project, live) =>
        project.checker.typeToString(
          project.checker.getTypeAtLocation(live),
          enclosing ? liveNode(enclosing, project) : undefined,
          flags,
        ),
      );
    },
    getProperty(name: string) {
      return host.query(node, (project, live) =>
        project.checker.getPropertyOfType(project.checker.getTypeAtLocation(live), name),
      );
    },
  };
}
export function getValue(node: ast.EnumMember): string | number | undefined {
  return owner(node).query(node, (project, live) =>
    project.checker.getConstantValue(live as ast.EnumMember),
  );
}
export function getExportedDeclarations(source: ast.SourceFile): Map<string, ast.Node[]> {
  return owner(source).query(source, (project, live) => {
    const symbol = project.checker.getSymbolAtLocation(live);
    const result = new Map<string, ast.Node[]>();
    if (!symbol) return result;
    for (const exported of project.checker.getExportsOfModule(symbol)) {
      const target =
        exported.flags & SymbolFlags.Alias ? project.checker.getAliasedSymbol(exported) : exported;
      const declarations = target.declarations.flatMap((handle) => {
        const decl = handle.resolve();
        return decl ? [decl] : [];
      });
      result.set(
        exported.name,
        declarations.map((decl) => {
          const file = owner(source).addSourceFileAtPathIfExists(decl.getSourceFile().fileName);
          if (!file) return decl;
          return matchingNode(file, decl);
        }),
      );
    }
    return result;
  });
}
