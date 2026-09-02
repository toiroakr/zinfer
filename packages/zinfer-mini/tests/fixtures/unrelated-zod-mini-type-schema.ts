import * as z from "zod/mini";

// Regression test for isZodMiniTypeAnnotation: a same-named `ZodMiniType`
// that has nothing to do with zod/mini (here, declared locally; in practice
// it could equally be `import type { ZodMiniType } from "other-package"`)
// must not be mistaken for zod/mini's own type just because the annotation's
// text ends in `ZodMiniType<...>`. NotASchema's initializer isn't a zod/mini
// schema at all, so it must not be detected as one.
interface ZodMiniType<T> {
  __unrelated: T;
}

export const NotASchema: ZodMiniType<string> = { __unrelated: "x" };

export const RealSchema = z.object({
  id: z.string(),
});
