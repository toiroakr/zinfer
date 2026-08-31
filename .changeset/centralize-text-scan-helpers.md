---
"zinfer": patch
"vinfer": patch
---

Fix the same-file/cross-file explicit-annotation self-reference rewrite (used by `z.lazy()`/`v.lazy()` recursive schemas) to correctly judge whether an identifier followed by `<...>` is a generic method signature's own name (`name<T>(): T`, which must not be rewritten) when the type-parameter list contains a quoted literal type argument with a bare `<`/`>` inside it, e.g. `name<'>'>(): T`.

- **vinfer**: the method-name guard counted every `<`/`>` character toward the type-parameter list's balance, including ones that only appear inside a quoted literal like `'>'`. A literal such as `'>'` closed the scan one character early and made the guard misjudge whether `(` actually follows, so it could conclude the identifier is _not_ a method name. `replaceBareTypeName` would then substitute the schema's own generated type name into what is actually a method signature, corrupting it in the generated declaration. This guard had no quote-awareness at all before this fix.
- **zinfer**: the guard already skipped quoted content, but its "is this quote closed" check only looked at the single character immediately before the closing quote (`text[i - 1] !== "\\"`), not backslash parity. A literal type argument whose printed text ends in an escaped backslash right before the closing quote (e.g. the printed form of the single-character string `a\`, `'a\\'`) was wrongly read as still inside the string, for the same reason `isEscaped()` exists elsewhere in this codebase. This is a narrow edge case, unlikely to be hit in practice.

The same `isGenericMethodName` guard is also shared by the bare-type-reference promotion scan (the `--inline-type-references` expansion path), not just the `v.lazy()`/`z.lazy()` self-reference rewrite described above - so both fixes apply there too, for the same reason.

Both packages' `isGenericMethodName`/`replaceBareTypeName` were duplicated, independently-written copies that had drifted out of sync (#509). They are now a single, quote-aware, backslash-parity-aware implementation shared from `packages/core`, along with the already-identical `escapeRegExp`/`isEscaped` helpers.
