---
"vinfer": patch
---

Fix a same-file explicit type annotation that resolves to exactly a locally declared class, interface, or type alias (e.g. `v.GenericSchema<LocalClass, LocalClass>`) generating a circular type alias like `type FooInput = FooInput`, which failed to type-check. The reference is now qualified through an inline `import("...")` type instead, using whatever name the module actually exports the declaration under (a named export, a default export's `.default`, or a renamed export) - the same fix zinfer already had (#420). Non-exported local types are unaffected and keep the existing bare-identifier fallback.

Fixes #506
