---
"zinfer": patch
---

Preserve JSDoc/TSDoc field descriptions for schemas imported via the bare `#/*`
subpath import form on Node < 26. Description extraction uses jiti, which
delegates subpath-imports resolution to the running Node; only Node 26+ resolves
the bare `#/` form natively, while older Node rejects it as an invalid internal
imports specifier, causing the whole module import — and thus every description —
to be dropped. The nearest `package.json` `imports` field is now read and
registered as jiti aliases (the same mechanism already used for tsconfig
`paths`), so `#/`, `#src/`, and exact subpath imports all keep their
descriptions regardless of the Node version.
