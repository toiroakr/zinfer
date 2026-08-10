---
"zinfer": patch
---

Fix generated declarations printing an unimported bare identifier when a schema's explicit type annotation resolves to exactly a locally declared class, interface, or type alias (e.g. `z.ZodType<LocalClass, LocalClass>`). The reference is now qualified through an inline `import("...").TypeName` type instead, so the generated file type-checks on its own. This also avoids name collisions across source files combined via `--outFile`, since each reference carries its own module path.
