---
"zinfer": patch
---

Fix two gaps in cross-file recursive schema referencing.

- A schema imported under a local alias (`import { X as Y } from "..."`) is
  referenced by the declaring file's own export name instead of falling back to
  an inlined approximation. The declaring file has no generated type named
  after the local alias, only after its own export, so that is what the
  printed reference and the `import type` now use.
- A `--schemas` filter no longer disables cross-file referencing outright. It
  only drops referencing a schema the filter itself excludes, since that
  schema's own declaration wouldn't be generated either; a schema the filter
  does include keeps referencing by name as if no filter were set.
