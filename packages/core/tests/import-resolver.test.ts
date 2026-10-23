import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createFileSystemLayer } from "typescript-native/fs";
import { API, ModuleKind, ModuleResolutionKind } from "typescript-native/sync";
import { Project, registerCompilerContext } from "../src/compiler";
import { ImportResolver } from "../src/import-resolver";

const directories: string[] = [];
afterEach(() => {
  for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true });
});

it("follows barrel re-exports through path aliases of the caller's native project", () => {
  const root = mkdtempSync(join(tmpdir(), "zinfer-import-resolver-"));
  directories.push(root);
  const consumer = join(root, "consumer.ts");
  const barrel = join(root, "barrel.ts");
  const dependency = join(root, "dependency.ts");
  using api = new API();
  using snapshot = api.createSnapshot({
    fileSystem: createFileSystemLayer([
      [consumer, 'import { value } from "./barrel"; export const used = value;'],
      [barrel, 'export { value } from "configured-alias";'],
      [dependency, "export const value = 1;"],
    ]),
    createPrograms: [
      {
        rootFiles: [consumer],
        compilerOptions: {
          strict: true,
          module: ModuleKind.ESNext,
          moduleResolution: ModuleResolutionKind.Bundler,
          paths: { "configured-alias": [dependency] },
        },
      },
    ],
  });
  const native = snapshot.getProject(snapshot.operation.createdPrograms![0].id)!;
  const source = native.program.getSourceFile(consumer)!;
  registerCompilerContext(source, native);
  using project = new Project({ nativeProject: native });
  const resolver = new ImportResolver({
    detectExportedSchemas: (file) => (file.fileName === dependency ? [{ name: "value" }] : []),
  } as never);

  const imported = resolver.findImportedSchemas(source, project);

  expect(imported.get("value")?.sourceFilePath).toBe(dependency);
});
