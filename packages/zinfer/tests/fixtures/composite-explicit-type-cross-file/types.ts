declare const brand: unique symbol;

// Same shape as unique-symbol-cross-file-transform/types.ts: a `unique
// symbol` computed property key TypeScript can't expand outside this file.
export type Named = {
  [brand]: true;
  value: string;
};
