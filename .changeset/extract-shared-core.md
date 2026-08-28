---
"zinfer": patch
"vinfer": patch
---

Extract the schema-library-agnostic parts of zinfer and vinfer (CLI
orchestration, config loading, error formatting, file/name/import resolution,
and the type-normalization template - the AST-based schema extraction itself
stays in each package) into an internal, unpublished `packages/core` package,
so the two tools no longer duplicate this logic and drift out of sync with
each other. `zinfer` and `vinfer` remain independently installable packages
with unchanged public APIs; `packages/core`'s code is bundled into each
package's published `dist/` at build time and is never a runtime dependency
consumers need to install.

As part of unifying the previously-duplicated CLI orchestration onto a single
implementation, vinfer picks up four small behavior fixes that bring it in
line with zinfer (previously only zinfer had these):

- `--generate-tests` combined with `-d`/`--declaration` is now rejected with a
  clear error, instead of silently generating a broken test file.
- Cross-file type references now account for output-path collisions (two
  input files that resolve to the same output path) instead of always
  trusting every resolved file, avoiding a reference to a declaration that
  might not actually exist in the generated output.
- Validation and "no schemas found" errors are now formatted consistently
  through `InvalidOptionError`/`NoSchemasFoundError` (matching zinfer), so CLI
  error output is uniform between the two tools.
- An explicitly requested config file (`--config <path>`) that fails to load
  or parse now throws instead of silently falling back to an empty
  configuration and continuing - matching zinfer's behavior for a path the
  user named explicitly. Auto-discovered config files (no `--config` flag)
  are unaffected: a missing or broken one still just warns and proceeds with
  no configuration, for both tools.
