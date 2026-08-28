import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts", "src/cli.ts"],
  format: ["esm"],
  target: "es2022",
  // tsup's built-in dts bundling (rollup-plugin-dts) crashes against this
  // workspace's pinned typescript@7.x native-preview package (it reads
  // `ts.sys`, which that package doesn't implement). dts-bundle-generator
  // does the same job as a separate build step instead - see package.json's
  // "build" script.
  dts: false,
  sourcemap: true,
  clean: true,
  // "@zinfer-monorepo/core" is a private, unpublished workspace package: its
  // source must be inlined into this package's dist so a published vinfer
  // never has a runtime dependency on a package that doesn't exist on npm.
  noExternal: ["@zinfer-monorepo/core"],
  external: ["commander", "glob", "jiti", "pathe", "ts-morph", "typescript", "valibot"],
});
