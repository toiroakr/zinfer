---
"zinfer": patch
---

Stop dropping schemas built with a zod builder zinfer doesn't recognise, and catch up with zod v4's export surface.

`SchemaDetector` decided whether a declaration held a schema from a hardcoded list of `z.<builder>()` names. A name missing from that list meant the schema was skipped _silently_ - no type generated, no warning, the schema simply absent from the output as if the file never declared it. The list had not kept up with zod v4, so 58 builders hit that path, among them ones as ordinary as `z.email()`, `z.uuid()`, `z.url()`, `z.int()`, `z.iso.date()`, `z.file()`, `z.stringbool()`, `z.readonly()`, `z.nullish()`, `z.catch()`, `z.pipe()` and `z.codec()`.

As with `z.templateLiteral()`, only a _bare_ call was affected - anything with a method chained onto it (`.describe(...)`, `.optional()`, ...) was still picked up by the method-chain fallback.

Three changes, in order of what actually protects you:

- **A schema is now identified by its type, not only by its name.** A `z.<name>(...)` call whose builder name is unknown is re-checked against the declaration's resolved type, and treated as a schema when it carries zod's `_def`. A zod newer than the installed zinfer therefore keeps working instead of quietly losing schemas.
- **The known-name list is complete again for zod v4**, so the common case still settles without asking the type checker. Names zod v3 exported and v4 dropped (`pipeline`, `effect`, `transformer`) stay listed for the peerDependencies floor.
- **A contract test keeps the list honest.** It asks the type checker which of zod's own exports return a schema and fails when one is missing from the list, so a zod upgrade that adds a builder is caught in CI rather than by a user noticing an absent type.

Also fixes a false positive in the other direction: a top-level `z.refine(...)` or `z.minLength(...)` was counted as a schema merely because its source text contained `.refine(`. Those are checks, meant to be handed to a schema rather than used as one, and are no longer mistaken for schemas.

One known limitation is now visible rather than hidden: `z.json()` is recursive, and the printer unrolls it to its expansion depth instead of naming a self-referential type, so the emitted union is long and bottoms out in `any`. That is still an improvement on the schema producing no output at all, and it is pinned by a test so it cannot regress unnoticed.
