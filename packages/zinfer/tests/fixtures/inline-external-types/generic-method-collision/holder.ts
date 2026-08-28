import type { Box } from "./box";

// Box<T>(): T is a generic method signature, not a type reference - even
// though its name collides with the imported type Box. Substituting the
// method name with Box's expanded structure would corrupt the method
// signature into invalid syntax (`{ value: string }<T>(): T`). Only
// reached through bare-reference promotion (see wrapper.ts): TypeScript's
// own top-level synthesis never produces this ambiguity, since it always
// prefixes with `import("...").`.
export type Holder = { Box<T>(): T; value: Box };
