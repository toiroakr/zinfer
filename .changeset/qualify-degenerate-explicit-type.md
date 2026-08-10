---
"zinfer": patch
---

Fix generated declarations printing an unimported bare identifier when a schema's explicit type annotation resolves to exactly a locally declared class, interface, or type alias (e.g. `z.ZodType<LocalClass, LocalClass>`). The reference is now qualified through an inline `import("...")` type instead, using whatever name the module actually exports the declaration under (a named export, a default export's `.default`, or a renamed export), so the generated file type-checks on its own for any exported local type. This also avoids name collisions across source files combined via `--outFile`, since each reference carries its own module path. Non-exported local types are unaffected and keep the existing bare-identifier fallback.
