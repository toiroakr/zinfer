---
"zinfer": minor
"vinfer": minor
---

**Breaking:** Renamed `--inline-external-types` (and its config/API key `inlineExternalTypes: boolean`) to `--inline-type-references` (`inlineTypeReferences?: "project" | "all"`), and made it a scope instead of a boolean.

"external" reads as node_modules-only (the opposite of what the flag does - `resolveModuleSourceFile()` never followed a bare package specifier), while the flag's actual subject is the `import("...").Name` reference TypeScript's printer synthesizes for a type invisible from the print location, whether that type lives in this project or a dependency.

Migration:

- CLI: replace `--inline-external-types` with `--inline-type-references` (bare, or `--inline-type-references=project`) for the same behavior as before.
- Config file / programmatic API: replace `inlineExternalTypes: true` with `inlineTypeReferences: "project"`. `inlineExternalTypes` is no longer read - it is silently ignored, not an error.

New: `--inline-type-references=all` additionally expands a reference into a plain `type`/`interface`/`enum` declared in a **dependency package**, resolved through TypeScript's own module resolution rather than filesystem probing (a `declare module "..."` ambient module with no backing file is still left as a reference, under either scope). This is what lets a type declared in a devDependency be inlined into the generated output, instead of leaving an `import("some-lib").Foo` reference that only resolves inside this project.
