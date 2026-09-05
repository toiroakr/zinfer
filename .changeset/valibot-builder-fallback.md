---
"vinfer": patch
---

Add a type-based fallback so a valibot builder vinfer doesn't recognise can no longer disappear from the output.

`SchemaDetector` decided whether a declaration held a schema purely from a hardcoded list of valibot export names. Unlike the zod packages, that list turned out to be complete - valibot separates schemas from actions cleanly, so nothing is currently missing - but the failure mode was the same waiting to happen: a builder added by a newer valibot would have been skipped _silently_, with no type generated and no warning.

A call that resolves to a valibot export whose name is unknown is now re-checked against the declaration's resolved type, and treated as a schema when valibot tags it `kind: "schema"`. Actions (`v.email()`, `v.minLength()`, `v.description()`) are tagged `"validation"` / `"transformation"` / `"metadata"` and stay excluded, and the fallback only runs for calls that already resolve to valibot, so an unrelated package's value is never pulled in.

A contract test now also asks the type checker which of valibot's own exports return a schema and fails when one is missing from the list, so a valibot upgrade that adds a builder is caught in CI rather than by a user noticing an absent type.
