---
"zinfer": patch
"vinfer": patch
---

Move zinfer and vinfer into a single pnpm monorepo (toiroakr/zinfer, at
packages/zinfer and packages/vinfer). No runtime or CLI behavior changes.
`repository.url`/`repository.directory` in package.json are updated to point
at the new monorepo location, which `publishConfig.provenance` validates
against on publish.
