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

  /**
   * Writes a schema whose type annotation references a type declared in a
   * *different* directory than the schema itself. TypeScript's type printer
   * keeps that reference as `import("../shared/kind").Kind` - a specifier
   * relative to the schema file, which does not resolve from the output
   * directory unless zinfer rebases it.
   */
  function writeCrossDirectorySchema(dir: string): void {
    mkdirSync(join(dir, "src/shared"), { recursive: true });
    mkdirSync(join(dir, "src/schemas"), { recursive: true });
    writeFileSync(join(dir, "src/shared/kind.ts"), 'export type Kind = "a" | "b" | "c";\n');
    writeFileSync(
      join(dir, "src/shared/model.ts"),
      'import type { Kind } from "./kind";\n\nexport type Model = { kind: Kind; name: string };\n',
    );
    writeFileSync(
      join(dir, "src/schemas/schema.ts"),
      'import { z } from "zod";\n' +
        'import type { Model } from "../shared/model";\n\n' +
        "export const ModelSchema: z.ZodType<Model> = z.object({\n" +
        '  kind: z.enum(["a", "b", "c"]),\n' +
        "  name: z.string(),\n" +
        "});\n",
    );
  }

  it("rebases source-relative import() paths onto the output directory (outDir)", async () => {
    workDir = mkdtempSync(join(tmpdir(), "zinfer-cli-runner-"));
    symlinkSync(
      resolve(import.meta.dirname, "../node_modules"),
      join(workDir, "node_modules"),
      "junction",
    );
    writeCrossDirectorySchema(workDir);
    process.chdir(workDir);

    await runCLI(["src/schemas/schema.ts"], { outDir: join(workDir, "out"), suffix: "Schema" });

    const output = readFileSync(join(workDir, "out/schema.types.ts"), "utf-8");
    // "../shared/kind" resolves from src/schemas/, not from out/.
    expect(output).not.toContain('import("../shared/kind")');
    expect(output).toContain('import("../src/shared/kind").Kind');
  });

  it("rebases source-relative import() paths onto the output file (outFile)", async () => {
    workDir = mkdtempSync(join(tmpdir(), "zinfer-cli-runner-"));
    symlinkSync(
      resolve(import.meta.dirname, "../node_modules"),
      join(workDir, "node_modules"),
      "junction",
    );
    writeCrossDirectorySchema(workDir);
    process.chdir(workDir);

    await runCLI(["src/schemas/schema.ts"], {
      outFile: join(workDir, "out/types.generated.ts"),
      suffix: "Schema",
    });

    const output = readFileSync(join(workDir, "out/types.generated.ts"), "utf-8");
    expect(output).not.toContain('import("../shared/kind")');
    expect(output).toContain('import("../src/shared/kind").Kind');
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
