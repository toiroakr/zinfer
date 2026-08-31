import type { Foo } from "some-lib";

// some-lib is a real package under this fixture's own node_modules (see
// node_modules/some-lib/index.d.ts) - a bare package specifier, not a
// relative or absolute path, exactly like package-specifier/holder.ts's
// ambient "virtual-lib". Unlike that one, this resolves to a real file, so
// `all` scope (unlike `project`) expands it.
export type Holder = { foo: Foo };
