---
"zinfer": patch
---

Fix recursive schema generation.

- A recursive getter now prints its self-reference straight away. When the getter
  carries an explicit return type, TypeScript unfolds one whole copy of the
  schema before it reaches the recursion; that copy is collapsed away, so
  `children: Record<string, Self>` prints as `children: { [x: string]: Self; }`
  instead of an extra level of the same shape.
- The input side of an annotated getter is rebuilt too. `z.ZodType<Output>`
  leaves its `Input` parameter at `unknown`, and that placeholder was left as-is,
  losing both the shape and the recursion.
- `.describe()` now reaches fields behind an index signature. A record's value
  schema is described at the path of the field holding the record, so the index
  signature no longer counts as a path segment of its own and inlined levels keep
  their TSDoc.
- A recursive schema imported from another generated file is referenced by name
  and `import type`d from that file, instead of being inlined into an
  approximation that lost its recursion point. When no generated file declares
  it, the recursion point keeps the index signature or array the getter
  describes rather than collapsing to a bare `any`.
- `mergeSame` now merges recursive schemas: the two directions of a schema that
  names itself are compared with those self-references unified, so a recursive
  schema whose input and output agree emits a single type plus `type XInput = X`.
  A schema declared in one file and imported by another is also no longer dropped
  from a merged single-file output.
- A reference to a recursive schema is named wherever it occurs. `z.array(Node)`
  printed as `any[]` when TypeScript had given up on `Node`, and only shapes it
  managed to print were rewritten to the type name; the field is known to hold
  that schema either way, so it is now named there too.

`FieldDescription` is exported from the package root, so `ExtractResult`'s
`fieldDescriptions` can be named by consumers.
