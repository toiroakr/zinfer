---
"zinfer": patch
---

Fix a recursive schema reached only through a non-exported intermediate schema in the same file collapsing to `any` instead of referencing the recursive schema's own generated type.

A non-exported schema gets no generated type of its own, so a reference to it was always left as the compiler's raw inlined structure - including whatever recursion the compiler itself couldn't resolve at that point, which printed as a bare `any`. The intermediate's own references are now resolved first, so an inlined copy of it keeps pointing at generated types (no import needed, since both live in the same file) instead of the compiler's unresolved structural expansion. This is the same-file counterpart of the cross-file fix in a previous release.
