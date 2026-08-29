import type { Foo } from "some-lib";

// "some-lib" is a real package under node_modules (see
// node_modules/some-lib/), unlike package-specifier/ambient.d.ts's ambient
// module - this is the motivating case for the "all" scope: a type declared
// in an actual dependency, not just a bare specifier that happens to be
// ambient.
export type Holder = { foo: Foo };
