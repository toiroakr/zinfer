import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readPeerDependencies = (packageDir: string): Record<string, string> => {
  const manifest = JSON.parse(
    readFileSync(new URL(`../../${packageDir}/package.json`, import.meta.url), "utf8"),
  );
  return manifest.peerDependencies ?? {};
};

describe("peerDependencies", () => {
  it.each(["zinfer", "vinfer", "zinfer-mini"])(
    "%s does not require the consumer's typescript, which pnpm lockfile.format v13 cannot write next to the typescript-native alias",
    (packageDir) => {
      expect(readPeerDependencies(packageDir)).not.toHaveProperty("typescript");
    },
  );
});
