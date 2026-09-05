---
"zinfer-mini": patch
---

Stop dropping schemas built with a zod/mini builder zinfer-mini doesn't recognise.

`SchemaDetector` decided whether a declaration held a schema from a hardcoded list of zod/mini export names. A name missing from that list meant the schema was skipped _silently_ - no type generated, no warning, the schema simply absent from the output. Eleven schema-producing exports hit that path, among them `z.instanceof()`, `z.json()`, `z.exactPartial()`, `z.transform()` and `z.creditCard()`.

Only a _bare_ call was affected - anything with `.check()`, `.brand()` or another real chain method on it was still picked up by the method-chain fallback.

Three changes, in order of what actually protects you:

- **A schema is now identified by its type, not only by its name.** A call that resolves to a zod/mini export whose name is unknown is re-checked against the declaration's resolved type, and treated as a schema when it carries zod's internals plus a `def`. A zod newer than the installed zinfer-mini therefore keeps working instead of quietly losing schemas.
- **The known-name list is complete again**, so the common case still settles without asking the type checker.
- **A contract test keeps the list honest.** It asks the type checker which of zod/mini's own exports return a schema and fails when one is missing from the list, so a zod upgrade that adds a builder is caught in CI rather than by a user noticing an absent type.

The checks that are meant to be handed to a schema rather than used as one (`z.refine()`, `z.minLength()`, `z.property()`) are still correctly excluded.
