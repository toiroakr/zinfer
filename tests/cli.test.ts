import { describe, it, expect, afterEach } from "vitest";
import { execFileSync } from "child_process";
import { execPath } from "process";
import { resolve, join } from "pathe";
import { readFileSync, mkdirSync, mkdtempSync, symlinkSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { runCLI } from "../src/cli-runner.js";

const cliPath = resolve(import.meta.dirname, "../src/cli.ts");
// The .bin/jiti entry is a POSIX shell script (a .cmd shim on Windows) that
// execFileSync cannot run directly without a shell; run its real JS entry
// point through the Node executable instead, which works on every platform.
const jitiCliPath = resolve(import.meta.dirname, "../node_modules/jiti/lib/jiti-cli.mjs");
const packageJsonPath = resolve(import.meta.dirname, "../package.json");

describe("cli --version", () => {
  it("should report the version from package.json instead of a hardcoded value", () => {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));

    const output = execFileSync(execPath, [jitiCliPath, cliPath, "--version"], {
      encoding: "utf-8",
      timeout: 60_000,
    }).trim();

    expect(output).toBe(packageJson.version);
  }, 60_000);
});

describe("runCLI", () => {
  let workDir: string | undefined;
  const originalCwd = process.cwd();

  afterEach(() => {
    process.chdir(originalCwd);
    if (workDir) {
      rmSync(workDir, { recursive: true, force: true });
      workDir = undefined;
    }
  });

  it("writes generated types to outDir when called programmatically", async () => {
    workDir = mkdtempSync(join(tmpdir(), "zinfer-cli-runner-"));
    symlinkSync(
      resolve(import.meta.dirname, "../node_modules"),
      join(workDir, "node_modules"),
      "junction",
    );
    writeFileSync(
      join(workDir, "schema.ts"),
      'import { z } from "zod";\n\nexport const UserSchema = z.object({ id: z.string() });\n',
    );
    process.chdir(workDir);

    await runCLI(["schema.ts"], { outDir: workDir, suffix: "Schema" });

    const output = readFileSync(join(workDir, "schema.types.ts"), "utf-8");
    expect(output).toContain("export type UserInput");
    expect(output).toContain("id: string");
  });

  it("loads config from an explicit --config path, not just well-known filenames", async () => {
    workDir = mkdtempSync(join(tmpdir(), "zinfer-cli-runner-"));
    symlinkSync(
      resolve(import.meta.dirname, "../node_modules"),
      join(workDir, "node_modules"),
      "junction",
    );
    writeFileSync(
      join(workDir, "schema.ts"),
      'import { z } from "zod";\n\nexport const UserSchema = z.object({ id: z.string() });\n',
    );
    writeFileSync(
      join(workDir, "custom.config.mjs"),
      'export default { include: ["schema.ts"], suffix: "Schema" };\n',
    );
    process.chdir(workDir);

    await runCLI([], { config: "custom.config.mjs", outDir: workDir });

    const output = readFileSync(join(workDir, "schema.types.ts"), "utf-8");
    expect(output).toContain("export type UserInput");
  });

  it("excludes files matching the config's exclude patterns", async () => {
    workDir = mkdtempSync(join(tmpdir(), "zinfer-cli-runner-"));
    symlinkSync(
      resolve(import.meta.dirname, "../node_modules"),
      join(workDir, "node_modules"),
      "junction",
    );
    writeFileSync(
      join(workDir, "included.ts"),
      'import { z } from "zod";\n\nexport const IncludedSchema = z.object({ id: z.string() });\n',
    );
    writeFileSync(
      join(workDir, "excluded.ts"),
      'import { z } from "zod";\n\nexport const ExcludedSchema = z.object({ id: z.string() });\n',
    );
    process.chdir(workDir);

    await runCLI(["*.ts"], {
      outFile: join(workDir, "out.ts"),
      suffix: "Schema",
    });
    // Sanity check: without exclude, both schemas are picked up.
    const withoutExclude = readFileSync(join(workDir, "out.ts"), "utf-8");
    expect(withoutExclude).toContain("IncludedInput");
    expect(withoutExclude).toContain("ExcludedInput");

    writeFileSync(
      join(workDir, "zinfer.config.mjs"),
      'export default { include: ["*.ts"], exclude: ["excluded.ts"], suffix: "Schema" };\n',
    );

    await runCLI([], { outFile: join(workDir, "out2.ts") });

    const withExclude = readFileSync(join(workDir, "out2.ts"), "utf-8");
    expect(withExclude).toContain("IncludedInput");
    expect(withExclude).not.toContain("ExcludedInput");
  });

  it("propagates a load failure for an explicit --config path instead of silently continuing", async () => {
    workDir = mkdtempSync(join(tmpdir(), "zinfer-cli-runner-"));
    symlinkSync(
      resolve(import.meta.dirname, "../node_modules"),
      join(workDir, "node_modules"),
      "junction",
    );
    writeFileSync(join(workDir, "schema.ts"), 'import { z } from "zod";\n');
    writeFileSync(join(workDir, "bad.config.mjs"), 'throw new Error("boom");\n');
    process.chdir(workDir);

    await expect(runCLI([], { config: "bad.config.mjs", outDir: workDir })).rejects.toThrow("boom");
  });

  it("rejects --generate-tests combined with --declaration", async () => {
    workDir = mkdtempSync(join(tmpdir(), "zinfer-cli-runner-"));
    symlinkSync(
      resolve(import.meta.dirname, "../node_modules"),
      join(workDir, "node_modules"),
      "junction",
    );
    writeFileSync(
      join(workDir, "schema.ts"),
      'import { z } from "zod";\n\nexport const UserSchema = z.object({ id: z.string() });\n',
    );
    process.chdir(workDir);

    await expect(
      runCLI(["schema.ts"], { outDir: workDir, declaration: true, generateTests: true }),
    ).rejects.toThrow("--declaration");
  });

  describe("schemas imported from another generated file", () => {
    /**
     * Sets up a work dir with a recursive NodeSchema in src/node/schema.ts and
     * a TreeSchema in src/tree/schema.ts referencing it across files.
     */
    function writeCrossFileSchemas(dir: string): void {
      mkdirSync(join(dir, "src", "node"), { recursive: true });
      mkdirSync(join(dir, "src", "tree"), { recursive: true });
      writeFileSync(
        join(dir, "src", "node", "schema.ts"),
        'import { z } from "zod";\n\n' +
          "export const NodeSchema = z.object({\n" +
          "  name: z.string(),\n" +
          "  get children() {\n" +
          "    return z.record(z.string(), NodeSchema);\n" +
          "  },\n" +
          "});\n",
      );
      writeFileSync(
        join(dir, "src", "tree", "schema.ts"),
        'import { z } from "zod";\n' +
          'import { NodeSchema } from "../node/schema";\n\n' +
          "export const TreeSchema = z.object({\n" +
          "  root: NodeSchema,\n" +
          "  index: z.record(z.string(), NodeSchema),\n" +
          "});\n",
      );
    }

    it("imports the other file's generated types instead of inlining them", async () => {
      workDir = mkdtempSync(join(tmpdir(), "zinfer-cli-runner-"));
      symlinkSync(
        resolve(import.meta.dirname, "../node_modules"),
        join(workDir, "node_modules"),
        "junction",
      );
      writeCrossFileSchemas(workDir);
      process.chdir(workDir);

      await runCLI(["src/**/schema.ts"], {
        outDir: join(workDir, "out"),
        outPattern: "[dir].generated[ext]",
        suffix: "Schema",
      });

      const tree = readFileSync(join(workDir, "out", "tree.generated.ts"), "utf-8");

      expect(tree).toContain('from "./node.generated"');
      expect(tree).toContain("root: NodeInput");
      expect(tree).toContain("root: NodeOutput");
      expect(tree).toContain("[x: string]: NodeInput");
      expect(tree).toContain("[x: string]: NodeOutput");
      // Inlining the imported schema is what used to collapse its recursion.
      expect(tree).not.toContain("any");

      // The imported schema's own file is unaffected.
      const node = readFileSync(join(workDir, "out", "node.generated.ts"), "utf-8");
      expect(node).toContain("export type NodeInput");
      expect(node).not.toContain("import type");
    });

    it("references the schema directly without an import when everything lands in one file", async () => {
      workDir = mkdtempSync(join(tmpdir(), "zinfer-cli-runner-"));
      symlinkSync(
        resolve(import.meta.dirname, "../node_modules"),
        join(workDir, "node_modules"),
        "junction",
      );
      writeCrossFileSchemas(workDir);
      process.chdir(workDir);

      await runCLI(["src/**/schema.ts"], {
        outFile: join(workDir, "out.ts"),
        suffix: "Schema",
      });

      const output = readFileSync(join(workDir, "out.ts"), "utf-8");

      // Both schemas are declared here, so there is nothing to import.
      expect(output).not.toContain("import type {");
      expect(output).toContain("export type NodeInput");
      expect(output).toContain("root: NodeInput");
      expect(output).toContain("root: NodeOutput");
      expect(output).not.toContain("any");
    });

    it("merges a cross-file referenced schema correctly under --merge-same in --outFile mode", async () => {
      // Regression test for a duplicate-entry hazard: in --outFile mode,
      // address/schema.ts contributes AddressSchema's real (resolved,
      // exported) result, but person/schema.ts also contributes an
      // unresolved import placeholder for the same "AddressSchema" name.
      // Glob order processes address/schema.ts first, so the placeholder is
      // appended later - if the real result isn't preferred when both share
      // a name, the merge pass would decide AddressSchema's merge status
      // from the placeholder's unresolved expansion instead, and (before the
      // fix) both entries would resolve to the same result and print the
      // declaration twice.
      //
      // Uses non-recursive schemas (unlike writeCrossFileSchemas' NodeSchema)
      // so mergeSame's `input === output` check can actually merge them -
      // a self-referencing recursive schema's input/output text always
      // differs by its own recursive Input/Output placeholder, regardless of
      // this bug, which would make a false negative here indistinguishable
      // from that unrelated, pre-existing limitation.
      workDir = mkdtempSync(join(tmpdir(), "zinfer-cli-runner-"));
      symlinkSync(
        resolve(import.meta.dirname, "../node_modules"),
        join(workDir, "node_modules"),
        "junction",
      );
      mkdirSync(join(workDir, "src", "address"), { recursive: true });
      mkdirSync(join(workDir, "src", "person"), { recursive: true });
      writeFileSync(
        join(workDir, "src", "address", "schema.ts"),
        'import { z } from "zod";\n\n' +
          "export const AddressSchema = z.object({\n" +
          "  street: z.string(),\n" +
          "  city: z.string(),\n" +
          "});\n",
      );
      writeFileSync(
        join(workDir, "src", "person", "schema.ts"),
        'import { z } from "zod";\n' +
          'import { AddressSchema } from "../address/schema";\n\n' +
          "export const PersonSchema = z.object({\n" +
          "  name: z.string(),\n" +
          "  address: AddressSchema,\n" +
          "});\n",
      );
      process.chdir(workDir);

      await runCLI(["src/**/schema.ts"], {
        outFile: join(workDir, "out.ts"),
        suffix: "Schema",
        mergeSame: true,
      });

      const output = readFileSync(join(workDir, "out.ts"), "utf-8");

      expect(output).toContain("export type Address = {");
      expect(output).toContain("export type AddressInput = Address;");
      expect(output).toContain("export type AddressOutput = Address;");
      expect(output).toContain("address: Address");
      // The declaration must be printed exactly once, not once per position
      // the duplicate (real + placeholder) entries used to occupy.
      expect(output.match(/export type Address = \{/g)).toHaveLength(1);
    });

    it("inlines the imported schema when its file is not part of the run", async () => {
      workDir = mkdtempSync(join(tmpdir(), "zinfer-cli-runner-"));
      symlinkSync(
        resolve(import.meta.dirname, "../node_modules"),
        join(workDir, "node_modules"),
        "junction",
      );
      writeCrossFileSchemas(workDir);
      process.chdir(workDir);

      await runCLI(["src/tree/schema.ts"], {
        outDir: join(workDir, "out"),
        outPattern: "[dir].generated[ext]",
        suffix: "Schema",
      });

      const tree = readFileSync(join(workDir, "out", "tree.generated.ts"), "utf-8");

      // Nothing generates node.generated.ts, so there is no type to import.
      expect(tree).not.toContain("import type {");
      expect(tree).toContain("name: string");
    });
  });

  it("does not write a companion test file when a schema file has no exported schemas", async () => {
    workDir = mkdtempSync(join(tmpdir(), "zinfer-cli-runner-"));
    symlinkSync(
      resolve(import.meta.dirname, "../node_modules"),
      join(workDir, "node_modules"),
      "junction",
    );
    writeFileSync(
      join(workDir, "schema.ts"),
      'import { z } from "zod";\n\nconst InternalSchema = z.object({ id: z.string() });\n',
    );
    process.chdir(workDir);

    await runCLI(["schema.ts"], { outDir: workDir, suffix: "Schema", generateTests: true });

    expect(() => readFileSync(join(workDir, "schema.test.ts"), "utf-8")).toThrow();
  });
});
