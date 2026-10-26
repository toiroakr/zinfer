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

const { Project, TypeFormatFlags, addStatements, getTypeAlias, remove, typeOf } =
  await import("../src/compiler.js");

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
