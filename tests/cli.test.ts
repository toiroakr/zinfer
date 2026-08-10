import { describe, it, expect, afterEach } from "vitest";
import { execFileSync } from "child_process";
import { resolve, join } from "pathe";
import { readFileSync, mkdtempSync, symlinkSync, writeFileSync, rmSync } from "fs";
import { tmpdir } from "os";
import { runCLI } from "../src/cli-runner.js";

const cliPath = resolve(import.meta.dirname, "../src/cli.ts");
const jitiPath = resolve(import.meta.dirname, "../node_modules/.bin/jiti");
const packageJsonPath = resolve(import.meta.dirname, "../package.json");

describe("cli --version", () => {
  it("should report the version from package.json instead of a hardcoded value", () => {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));

    const output = execFileSync(jitiPath, [cliPath, "--version"], {
      encoding: "utf-8",
    }).trim();

    expect(output).toBe(packageJson.version);
  });
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
    symlinkSync(resolve(import.meta.dirname, "../node_modules"), join(workDir, "node_modules"));
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
});
