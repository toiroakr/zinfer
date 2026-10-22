import { existsSync, mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createFileSystemLayer } from "typescript-native/fs";
import { API, ModuleKind, ModuleResolutionKind } from "typescript-native/sync";
import {
  Project,
  registerCompilerContext,
  getImportDeclarations,
  getModuleSpecifierSourceFile,
  TypeFormatFlags,
  addStatements,
  getExportedDeclarations,
  getTypeAlias,
  getVariableDeclaration,
  getName,
  isExported,
  getInterface,
  Node,
  typeOf,
} from "../src/compiler.js";

const directories: string[] = [];
afterEach(() => {
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true });
});
function directory(): string {
  const dir = mkdtempSync(join(tmpdir(), "zinfer-compiler-"));
  directories.push(dir);
  return dir;
}

it("discards temporary types after an exception and can resolve the same file again", () => {
  using project = new Project();
  const path = join(directory(), "virtual.ts");
  const source = project.createSourceFile(path, "export const value = 42 as const;");
  expect(project.getSourceFile(path)).toBe(source);
  expect(() =>
    project.run(() => {
      addStatements(source, ["type Temporary = typeof value;"]);
      expect(typeOf(getTypeAlias(source, "Temporary")!).getText()).toBe("42");
      throw new Error("interrupted");
    }),
  ).toThrow("interrupted");
  expect(getTypeAlias(source, "Temporary")).toBeUndefined();
  expect(typeOf(getVariableDeclaration(source, "value")!).getText()).toBe("42");
  expect(existsSync(path)).toBe(false);
});

it("resolves virtual imports without losing their original content across operations", () => {
  using project = new Project();
  const dir = directory();
  project.createSourceFile(join(dir, "dependency.ts"), "export type Value = { text: string };");
  const source = project.createSourceFile(
    join(dir, "entry.ts"),
    'import type { Value } from "./dependency.js"; type Result = Value;',
  );
  for (let index = 0; index < 2; index++) {
    const printed = project.run(() =>
      typeOf(getTypeAlias(source, "Result")!).getText(undefined, TypeFormatFlags.InTypeAlias),
    );
    expect(printed).toBe("{ text: string; }");
  }
});

it.each(["ambient.d.ts", "ambient.ts"])(
  "keeps explicitly loaded ambient modules from %s available in subsequent operations",
  (fileName) => {
    using project = new Project();
    const dir = directory();
    project.run(() =>
      project.createSourceFile(
        join(dir, fileName),
        'declare module "virtual" { export type Value = string; }',
      ),
    );
    const source = project.createSourceFile(
      join(dir, "entry.ts"),
      'import type { Value } from "virtual"; type Result = Value;',
    );
    expect(typeOf(getTypeAlias(source, "Result")!).getText()).toBe("string");
  },
);

it("respects JSONC extends and paths relative to the original configuration", () => {
  const dir = directory();
  mkdirSync(join(dir, "src"));
  writeFileSync(
    join(dir, "base.json"),
    '{ "compilerOptions": { "strict": true, "paths": { "#/*": ["./src/*"] }, "moduleResolution": "bundler" } }',
  );
  writeFileSync(
    join(dir, "tsconfig.json"),
    '{ // Project settings\n "extends": "./base.json", "include": ["src"] }',
  );
  writeFileSync(join(dir, "src/value.ts"), "export type Value = { resolved: true };");
  using project = new Project({ tsConfigFilePath: join(dir, "tsconfig.json") });
  const source = project.createSourceFile(
    join(dir, "src/entry.ts"),
    'import type { Value } from "#/value"; type Result = Value;',
  );
  expect(
    typeOf(getTypeAlias(source, "Result")!).getText(undefined, TypeFormatFlags.InTypeAlias),
  ).toBe("{ resolved: true; }");
});

it("resolves renamed and anonymous default exports without changing declaration identity", () => {
  using project = new Project();
  const source = project.createSourceFile(
    join(directory(), "exports.ts"),
    "const value = 42; export { value as renamed }; export default { value };",
  );
  const declarations = getExportedDeclarations(source);
  expect(declarations.get("renamed")).toEqual([getVariableDeclaration(source, "value")]);
  expect(declarations.get("default")?.[0].getText()).toBe("export default { value };");
});

it("accepts a source file created directly by the native API", () => {
  using api = new API();
  using lease = api.createSourceFile(join(directory(), "native.ts"), "type Result = 123;");
  expect(typeOf(getTypeAlias(lease.sourceFile, "Result")!).getText()).toBe("123");
});

it("preserves the spelling of quoted and computed property names", () => {
  using project = new Project();
  const source = project.createSourceFile(
    join(directory(), "names.ts"),
    "const value = { 'quoted-key': 1, [Symbol.iterator]: 2 };",
  );
  const object = getVariableDeclaration(source, "value")!.initializer!;
  expect(Node.isObjectLiteralExpression(object)).toBe(true);
  if (Node.isObjectLiteralExpression(object)) {
    expect(object.properties.map(getName)).toEqual(["'quoted-key'", "[Symbol.iterator]"]);
  }
});

it("recognizes local type exports without inventing an original-name export for aliases", () => {
  using project = new Project();
  const source = project.createSourceFile(
    join(directory(), "visibility.ts"),
    "interface Tree { children: Tree[] } export type { Tree }; interface PrivateTree {} export type { PrivateTree as PublicTree };",
  );
  expect(isExported(getInterface(source, "Tree")!)).toBe(true);
  expect(isExported(getInterface(source, "PrivateTree")!)).toBe(false);
});

it("uses the caller's native context for virtual imports without disposing it", () => {
  const file = join(directory(), "main.ts");
  const dependency = join(directory(), "dependency.ts");
  using api = new API();
  using snapshot = api.createSnapshot({
    fileSystem: createFileSystemLayer([
      [file, 'import { value } from "configured-alias"; export type Result = typeof value;'],
      [dependency, 'export const value = "configured" as const;'],
    ]),
    createPrograms: [
      {
        rootFiles: [file],
        compilerOptions: {
          strict: true,
          module: ModuleKind.ESNext,
          moduleResolution: ModuleResolutionKind.Bundler,
          paths: { "configured-alias": [dependency] },
        },
      },
    ],
  });
  const project = snapshot.getProject(snapshot.operation.createdPrograms![0].id)!;
  const source = project.program.getSourceFile(file)!;
  registerCompilerContext(source, project);
  expect(typeOf(getTypeAlias(source, "Result")!).getText()).toBe('"configured"');
  const imported = getModuleSpecifierSourceFile(getImportDeclarations(source)[0])!;
  expect(imported.fileName).toBe(dependency);
  expect(typeOf(getVariableDeclaration(imported, "value")!).getText()).toBe('"configured"');
  expect(project.program.getSemanticDiagnostics(file)).toEqual([]);
});
