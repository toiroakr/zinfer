---
"zinfer": patch
"vinfer": patch
"zinfer-mini": patch
---

Speed up generation on the native TypeScript compiler. Adding and removing the temporary types used to read each schema's type no longer rebuilds the whole native program every time; the program is updated in place, which makes generation for a project like `tailor-platform/sdk`'s `packages/sdk` about 3x cheaper in CPU time.
