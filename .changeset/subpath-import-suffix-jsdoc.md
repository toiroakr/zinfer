---
"zinfer": patch
---

Preserve JSDoc/TSDoc field descriptions for `#/*` subpath imports whose target
has a suffix after the wildcard, such as `"#/*": "./src/*.ts"` (the form
TypeScript requires to map a `#/` subpath import to `.ts` source under
`moduleResolution: bundler`/`nodenext`). The previous fix only stripped a
trailing `*`, so a suffix like `.ts` was left in the jiti alias as a literal
`*`, making the import unresolvable and dropping every description. The wildcard
and any suffix after it are now stripped, letting jiti resolve the extension.
