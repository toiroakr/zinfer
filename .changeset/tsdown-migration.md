---
"zinfer": patch
"vinfer": patch
"zinfer-mini": patch
---

Switch the build tool from tsup + dts-bundle-generator to tsdown. No public API change; published file names and extensions (`dist/index.js`, `dist/index.d.ts`, `dist/cli.js`) are unchanged, though internal chunk hashes and one internally re-exported type name differ slightly due to the different bundler.
