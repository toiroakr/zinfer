import { describe, it, expect } from "vitest";
import { execFileSync } from "child_process";
import { resolve } from "pathe";
import { readFileSync } from "fs";

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
