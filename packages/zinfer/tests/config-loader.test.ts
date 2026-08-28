import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "fs";
import { join } from "pathe";
import { tmpdir } from "os";
import { ConfigLoader } from "../src/core/config-loader.js";

describe("ConfigLoader.loadFrom", () => {
  let workDir: string | undefined;

  afterEach(() => {
    if (workDir) {
      rmSync(workDir, { recursive: true, force: true });
      workDir = undefined;
    }
  });

  it("propagates a load failure for an explicit --config path pointing at an unparseable package.json", async () => {
    workDir = mkdtempSync(join(tmpdir(), "zinfer-config-loader-"));
    const packageJsonPath = join(workDir, "package.json");
    writeFileSync(packageJsonPath, "{ not valid json");

    await expect(new ConfigLoader().loadFrom(packageJsonPath)).rejects.toThrow();
  });

  it("does not fail auto-discovery when package.json is unparseable (config remains optional)", async () => {
    workDir = mkdtempSync(join(tmpdir(), "zinfer-config-loader-"));
    writeFileSync(join(workDir, "package.json"), "{ not valid json");

    const result = await new ConfigLoader().load(workDir);
    expect(result.config).toEqual({});
  });
});
