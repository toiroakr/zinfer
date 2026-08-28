import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "pathe";
import { ConfigLoader, defineConfig } from "../src/config-loader.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "core-config-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("ConfigLoader.load", () => {
  const loader = new ConfigLoader({ toolName: "testtool" });

  it("returns an empty config when nothing is found", async () => {
    expect(await loader.load(dir)).toEqual({ config: {} });
  });

  it("loads testtool.config.js", async () => {
    writeFileSync(
      join(dir, "testtool.config.js"),
      'export default { outDir: "./types", suffix: "Schema" };',
    );

    const { config, configPath } = await loader.load(dir);
    expect(config).toEqual({ outDir: "./types", suffix: "Schema" });
    expect(configPath).toBe(join(dir, "testtool.config.js"));
  });

  it("loads testtool.config.mjs", async () => {
    writeFileSync(join(dir, "testtool.config.mjs"), "export default { mergeSame: true };");

    const { config } = await loader.load(dir);
    expect(config).toEqual({ mergeSame: true });
  });

  it("prefers a config file over package.json", async () => {
    writeFileSync(join(dir, "testtool.config.mjs"), 'export default { suffix: "FromFile" };');
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ testtool: { suffix: "FromPackage" } }),
    );

    const { config } = await loader.load(dir);
    expect(config.suffix).toBe("FromFile");
  });

  it("loads the tool-name field from package.json", async () => {
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ name: "app", testtool: { include: ["src/**/*.ts"] } }),
    );

    const { config, configPath } = await loader.load(dir);
    expect(config).toEqual({ include: ["src/**/*.ts"] });
    expect(configPath).toBe(join(dir, "package.json"));
  });

  it("ignores a package.json without the tool-name field", async () => {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "app" }));
    expect(await loader.load(dir)).toEqual({ config: {} });
  });

  it("ignores an unparsable package.json (config remains optional for auto-discovery)", async () => {
    writeFileSync(join(dir, "package.json"), "{ not json");
    expect(await loader.load(dir)).toEqual({ config: {} });
  });

  it("falls back to an empty config when a config file throws", async () => {
    writeFileSync(join(dir, "testtool.config.mjs"), "throw new Error('boom');");
    const { config } = await loader.load(dir);
    expect(config).toEqual({});
  });
});

describe("ConfigLoader.loadFrom", () => {
  const loader = new ConfigLoader({ toolName: "testtool" });

  it("loads an explicitly requested config file", async () => {
    const configPath = join(dir, "custom.config.mjs");
    writeFileSync(configPath, 'export default { outFile: "./types.ts" };');

    const result = await loader.loadFrom(configPath);
    expect(result.config).toEqual({ outFile: "./types.ts" });
    expect(result.configPath).toBe(configPath);
  });

  it("reads the tool-name field when pointed at a package.json", async () => {
    const configPath = join(dir, "package.json");
    writeFileSync(configPath, JSON.stringify({ testtool: { declaration: true } }));

    const result = await loader.loadFrom(configPath);
    expect(result.config).toEqual({ declaration: true });
  });

  it("throws when the file does not exist", async () => {
    await expect(loader.loadFrom(join(dir, "missing.config.ts"))).rejects.toThrow(
      /Config file not found/,
    );
  });

  it("propagates a load failure for an explicit path pointing at an unparseable package.json", async () => {
    const packageJsonPath = join(dir, "package.json");
    writeFileSync(packageJsonPath, "{ not valid json");

    await expect(loader.loadFrom(packageJsonPath)).rejects.toThrow(/Failed to parse/);
  });

  it("propagates a load failure for an explicit path pointing at a config file that throws", async () => {
    const configPath = join(dir, "custom.config.mjs");
    writeFileSync(configPath, "throw new Error('boom');");

    await expect(loader.loadFrom(configPath)).rejects.toThrow(/boom/);
  });
});

describe("defineConfig", () => {
  it("returns the config unchanged", () => {
    const config = { include: ["src/**/*.ts"], mergeSame: true };
    expect(defineConfig(config)).toEqual(config);
  });
});
