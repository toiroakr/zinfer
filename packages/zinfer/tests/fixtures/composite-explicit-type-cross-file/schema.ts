import { z } from "zod";
import type { Named } from "./types";

// The explicit annotation is a *composite* type (an object literal, not a
// single identifier) that merely references `Named` at a nested position -
// unlike degenerate-explicit-type-cross-file/schema.ts, where the whole
// annotation resolves to exactly one imported identifier.
// rewriteExplicitTypeSelfReference only ever runs for that degenerate,
// single-identifier shape, so this composite annotation's `Named` reference
// gets no self-reference protection - it must still be promoted to a
// resolvable `import("...")` reference instead of being left as a dangling
// bare identifier.
export const FooSchema: z.ZodType<{ id: string; value: Named }> = z.any();
