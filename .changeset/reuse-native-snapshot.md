---
"zinfer": patch
"vinfer": patch
"zinfer-mini": patch
---

Speed up generation on the native TypeScript compiler. Adding and removing the temporary types used to read each schema's type, and loading a file the program had already read, no longer rebuild the whole native program; the program is updated in place instead. Generating the 14 schema files of `tailor-platform/sdk`'s `packages/sdk` now takes about 2.2s of wall time and 4.8s of CPU time, against about 4.2s and 6.9s with zinfer 0.4.7 and about 8-12s and 29s with 0.5.0.
