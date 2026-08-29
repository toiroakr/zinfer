import { describe, it, expect } from "vitest";
import { disambiguateOptionalValueFlag } from "../src/cli-runner.js";

describe("disambiguateOptionalValueFlag", () => {
  const flag = "--inline-type-references";
  const values = ["project", "all"];

  it("moves a bare flag followed by an unrecognized token (e.g. a file) to the end of argv", () => {
    const argv = ["node", "cli.js", "--dry-run", flag, "schema.ts"];
    expect(disambiguateOptionalValueFlag(argv, flag, values)).toEqual([
      "node",
      "cli.js",
      "--dry-run",
      "schema.ts",
      flag,
    ]);
  });

  it("rewrites a bare flag followed by a recognized value into the --flag=value form", () => {
    const argv = ["node", "cli.js", flag, "all", "schema.ts"];
    expect(disambiguateOptionalValueFlag(argv, flag, values)).toEqual([
      "node",
      "cli.js",
      `${flag}=all`,
      "schema.ts",
    ]);
  });

  it("leaves an already --flag=value form untouched", () => {
    const argv = ["node", "cli.js", `${flag}=all`, "schema.ts"];
    expect(disambiguateOptionalValueFlag(argv, flag, values)).toEqual(argv);
  });

  it("moves a bare flag with nothing following it to the end (no-op)", () => {
    const argv = ["node", "cli.js", "schema.ts", flag];
    expect(disambiguateOptionalValueFlag(argv, flag, values)).toEqual(argv);
  });

  it("moves a bare flag followed by another option to the end, keeping the other option's own value adjacent to it", () => {
    const argv = ["node", "cli.js", flag, "--outDir", "types", "schema.ts"];
    expect(disambiguateOptionalValueFlag(argv, flag, values)).toEqual([
      "node",
      "cli.js",
      "--outDir",
      "types",
      "schema.ts",
      flag,
    ]);
  });

  it("leaves argv without the flag untouched", () => {
    const argv = ["node", "cli.js", "schema.ts", "--dry-run"];
    expect(disambiguateOptionalValueFlag(argv, flag, values)).toEqual(argv);
  });

  it("reinserts a deferred bare flag before a `--` end-of-options separator instead of after it", () => {
    // Commander treats everything past `--` as positional unconditionally
    // - a flag moved past it (e.g. appended to the very end of argv) would
    // silently stop being recognized as an option at all.
    const argv = ["node", "cli.js", flag, "--", "schema.ts"];
    expect(disambiguateOptionalValueFlag(argv, flag, values)).toEqual([
      "node",
      "cli.js",
      flag,
      "--",
      "schema.ts",
    ]);
  });

  it("leaves the flag untouched when it appears after `--` (the user wrote it as a literal positional)", () => {
    const argv = ["node", "cli.js", "--", flag, "schema.ts"];
    expect(disambiguateOptionalValueFlag(argv, flag, values)).toEqual(argv);
  });

  it("still rewrites a bare flag before `--` into the --flag=value form when a recognized value follows", () => {
    const argv = ["node", "cli.js", flag, "all", "--", "schema.ts"];
    expect(disambiguateOptionalValueFlag(argv, flag, values)).toEqual([
      "node",
      "cli.js",
      `${flag}=all`,
      "--",
      "schema.ts",
    ]);
  });
});
