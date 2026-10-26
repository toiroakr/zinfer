import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";

const counts = vi.hoisted(() => ({ snapshotsCreated: 0 }));

vi.mock("typescript-native/sync", async (importOriginal) => {
  const actual = await importOriginal<typeof import("typescript-native/sync")>();
  class CountingAPI {
    constructor(...args: ConstructorParameters<typeof actual.API>) {
      return new Proxy(new actual.API(...args), {
        get(target, key) {
          const value = Reflect.get(target, key, target);
          if (key !== "createSnapshot") return value;
          const method = value as typeof target.createSnapshot;
          return Object.assign(
            (...params: Parameters<typeof method>) => {
              counts.snapshotsCreated++;
              return method(...params);
            },
            { gen: method.gen },
          );
        },
      });
    }
  }
  return { ...actual, API: CountingAPI };
});

const {
  Project,
  TypeFormatFlags,
  addStatements,
  getTypeAlias,
  getVariableDeclaration,
  remove,
  typeOf,
} = await import("../src/compiler.js");

const directories: string[] = [];
afterEach(() => {
  counts.snapshotsCreated = 0;
  for (const dir of directories.splice(0)) rmSync(dir, { recursive: true, force: true });
});

it("creates one native snapshot while temporary types are added and removed around each query", () => {
  using project = new Project();
  const dir = mkdtempSync(join(tmpdir(), "zinfer-snapshots-"));
  directories.push(dir);
  const source = project.createSourceFile(
    join(dir, "virtual.ts"),
    "export const value = 42 as const;",
  );
  project.run(() => {
    for (const alias of ["First", "Second", "Third"]) {
      addStatements(source, [`type ${alias} = [typeof value, "${alias}"];`]);
      const declaration = getTypeAlias(source, alias)!;
      expect(typeOf(declaration).getText(undefined, TypeFormatFlags.InTypeAlias)).toBe(
        `[42, "${alias}"]`,
      );
      remove(declaration);
      expect(getTypeAlias(source, alias)).toBeUndefined();
    }
  });
  expect(counts.snapshotsCreated).toBe(1);
});

it("reflects an edit of a virtual dependency in its importer without creating another snapshot", () => {
  using project = new Project();
  const dir = mkdtempSync(join(tmpdir(), "zinfer-snapshots-"));
  directories.push(dir);
  const dependency = join(dir, "dependency.ts");
  project.createSourceFile(dependency, "export type Value = { text: string };");
  const importer = project.createSourceFile(
    join(dir, "importer.ts"),
    'import type { Value } from "./dependency"; type Result = Value;',
  );
  const printResult = () =>
    typeOf(getTypeAlias(importer, "Result")!).getText(undefined, TypeFormatFlags.InTypeAlias);
  project.run(() => {
    expect(printResult()).toBe("{ text: string; }");
    project.updateSource(dependency, "export type Value = { count: number };");
    expect(printResult()).toBe("{ count: number; }");
  });
  expect(counts.snapshotsCreated).toBe(1);
});

it("rebuilds the snapshot once when a file is added during a session", () => {
  using project = new Project();
  const dir = mkdtempSync(join(tmpdir(), "zinfer-snapshots-"));
  directories.push(dir);
  const first = project.createSourceFile(join(dir, "first.ts"), "export const value = 1 as const;");
  project.run(() => {
    expect(
      typeOf(getVariableDeclaration(first, "value")!).getText(
        undefined,
        TypeFormatFlags.InTypeAlias,
      ),
    ).toBe("1");
    const second = project.createSourceFile(
      join(dir, "second.ts"),
      'import { value } from "./first"; export const doubled = [value, value] as const;',
    );
    expect(
      typeOf(getVariableDeclaration(second, "doubled")!).getText(
        undefined,
        TypeFormatFlags.InTypeAlias,
      ),
    ).toBe("readonly [1, 1]");
  });
  expect(counts.snapshotsCreated).toBe(2);
});

it("keeps the snapshot when a file the program already loaded from disk is added with the same text", () => {
  using project = new Project();
  const dir = mkdtempSync(join(tmpdir(), "zinfer-snapshots-"));
  directories.push(dir);
  const dependency = join(dir, "dependency.ts");
  writeFileSync(dependency, "export const value = 1 as const;");
  const importer = join(dir, "importer.ts");
  writeFileSync(
    importer,
    'import { value } from "./dependency"; export const result = [value] as const;',
  );
  const source = project.addSourceFileAtPath(importer);
  project.run(() => {
    expect(
      typeOf(getVariableDeclaration(source, "result")!).getText(
        undefined,
        TypeFormatFlags.InTypeAlias,
      ),
    ).toBe("readonly [1]");
    const loaded = project.addSourceFileAtPath(dependency);
    expect(
      typeOf(getVariableDeclaration(loaded, "value")!).getText(
        undefined,
        TypeFormatFlags.InTypeAlias,
      ),
    ).toBe("1");
  });
  expect(counts.snapshotsCreated).toBe(1);
});

it("keeps an explicitly added global declaration file after the reference to it is removed", () => {
  using project = new Project();
  const dir = mkdtempSync(join(tmpdir(), "zinfer-snapshots-"));
  directories.push(dir);
  const globals = join(dir, "globals.d.ts");
  writeFileSync(globals, "declare type GlobalValue = { text: string };");
  const entryPath = join(dir, "entry.ts");
  writeFileSync(
    entryPath,
    '/// <reference path="./globals.d.ts" />\nexport type Result = GlobalValue;',
  );
  const entry = project.addSourceFileAtPath(entryPath);
  const printResult = () =>
    typeOf(getTypeAlias(entry, "Result")!).getText(undefined, TypeFormatFlags.InTypeAlias);
  project.run(() => {
    expect(printResult()).toBe("{ text: string; }");
    project.addSourceFileAtPath(globals);
    project.updateSource(entryPath, "export type Result = GlobalValue;");
    expect(printResult()).toBe("{ text: string; }");
  });
});
