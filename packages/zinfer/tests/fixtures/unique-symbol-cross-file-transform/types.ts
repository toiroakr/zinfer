declare const brand: unique symbol;

// A `unique symbol` computed property key makes this type unexpressible from
// outside this file - TypeScript's own printer can't spell `[brand]` at any
// other print location, so it falls back to printing the bare name `Named`
// instead of expanding the structure inline. See unique-symbol-cross-file-transform/schema.ts.
export type Named = {
  [brand]: true;
  value: string;
};
