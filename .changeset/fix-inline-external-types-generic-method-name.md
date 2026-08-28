---
"zinfer": patch
---

Fix `--inline-external-types` corrupting a generic method's own name when it collides with an in-scope type reference. `promoteBareTypeReferences()`'s method-name guard only recognized a non-generic `Name(): T` signature (checking for `(` immediately after the name); a generic method's own `Name<T>(): T` fell through to the qualified/generic-reference branch instead, so its name could be rewritten into an invalid `import("...").Name<T>(): T`.
