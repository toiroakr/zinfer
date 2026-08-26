---
"zinfer": patch
---

Add `--brand-strategy` (config `brandStrategy`) to control how a `.brand()` marker is represented in the generated output. The default, `"zod-import"`, keeps the existing behavior: `BRAND<"Tag">` with `import type { BRAND } from "zod"`. `"local-symbol"` instead emits a self-contained `unique symbol` marker (`export declare const __brand: unique symbol;`, reused across every branded type in the file) and prints `{ readonly [__brand]: "Tag" }` in place of `BRAND<"Tag">`, so the generated output never imports zod - useful when generated files are re-exported through a public package API that must never require zod in consumers' own type-check graph.

- The `__brand` symbol is declared once per file, exported, and shared by every brand it contains; nominal distinctness comes from each brand's own tag literal, the same way zod's own `BRAND` marker works - not from the symbol's identity.
- `--brand-strategy local-symbol` also works with `--generate-tests`. Since a local-symbol marker is intentionally a different shape from zod's own `BRAND<Tag>` (and is `readonly` where zod's is not), a branded schema's generated output test uses a canonicalizing comparison instead of plain `toEqualTypeOf<z.output<>>()` - it normalizes both sides' brand-marker property (whichever unique symbol keys it, however the tag is encoded, regardless of the `readonly` mismatch) down to a common shape before comparing, recursively, so a brand nested at any depth - including inside a self-referential schema - is still verified against the real inferred type.
