---
"zinfer": minor
---

Add `--brand-strategy` (config `brandStrategy`) to control how a `.brand()` marker is represented in the generated output. The default, `"zod-import"`, keeps the existing behavior: `BRAND<"Tag">` with `import type { BRAND } from "zod"`. `"local-symbol"` instead emits a self-contained `unique symbol` marker (`declare const __brand: unique symbol;`, reused across every branded type in the file) and prints `{ readonly [__brand]: "Tag" }` in place of `BRAND<"Tag">`, so the generated output never imports zod - useful when generated files are re-exported through a public package API that must never require zod in consumers' own type-check graph.

- The `__brand` symbol is declared once per file and shared by every brand it contains; nominal distinctness comes from each brand's own tag literal, the same way zod's own `BRAND` marker works - not from the symbol's identity.
- `--brand-strategy local-symbol` cannot be combined with `--generate-tests`: the generated companion test asserts full type equality against `z.output<>`/`z.input<>`, which always carries zod's own `BRAND<Tag>`, so that assertion could never hold for a local-symbol marker.
