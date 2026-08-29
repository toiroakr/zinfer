import { Kind } from "./kind";

// Wrapping Kind in an object type is what gets it printed as an
// import("./kind").Kind reference at all. Annotating a schema with Kind
// directly makes the printer emit the bare identifier "Kind", which
// resolveType() only ever looks up as a *same-file* enum - so a schema file
// that merely imports Kind never expands it, and printEnumAsLiteralUnion is
// never reached (see computed-enum-schema.ts for the same-file shape that
// does reach it). As a field of Holder, the reference is left for
// --inline-type-references' own resolveExternalTypeReference to resolve,
// where the give-up path actually runs.
export type Holder = { kind: Kind };
