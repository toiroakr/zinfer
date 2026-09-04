// A single-element tuple (`[string]`) and an indexed-access type
// (`Pair[0]`) - both printed with bracket syntax that superficially
// resembles a `unique symbol` computed property key (`{ [brand]: ... }`),
// but neither is one. See bracket-syntax-cross-file-transform/schema.ts.
export type Pair = [string, number];

export type Named = {
  tag: [string];
  first: Pair[0];
};
