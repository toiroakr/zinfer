// Hidden isn't exported, so nothing can `import(...)` it - a cycle through
// it (its own self-reference below) has no resolvable fallback at all,
// unlike node-a.ts/node-b.ts's mutual cycle. This is the same limitation
// nonexported-explicit-type-schema.ts documents for a local explicit
// annotation: reaching it is left as the bare, unresolved identifier.
type Hidden = { self?: Hidden };

export type Middle = { hidden: Hidden };
