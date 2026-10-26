import { mkdtempSync, rmSync } from "node:fs";
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
          if (key === "createSnapshot") counts.snapshotsCreated++;
          return Reflect.get(target, key, target);
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
