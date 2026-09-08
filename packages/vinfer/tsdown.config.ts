import { defineConfig } from "tsdown";

export default defineConfig({
  entry: ["src/index.ts", "src/cli.ts"],
  format: ["esm"],
  target: "es2022",
  dts: true,
  sourcemap: true,
  clean: true,
  // Keep the published .js/.d.ts extensions (package.json already declares
  // "type": "module", so plain .js is unambiguous ESM) instead of tsdown's
  // node-platform default of always emitting .mjs/.d.mts.
  fixedExtension: false,
  // "@zinfer-monorepo/core" is a private, unpublished workspace package: its
  // source must be inlined into this package's dist so a published vinfer
  // never has a runtime dependency on a package that doesn't exist on npm.
  deps: {
    alwaysBundle: ["@zinfer-monorepo/core"],
    neverBundle: ["commander", "glob", "jiti", "pathe", "ts-morph", "typescript", "valibot"],
  },
});
