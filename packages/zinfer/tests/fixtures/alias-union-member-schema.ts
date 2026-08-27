import { z } from "zod";

const InternalA = z.object({ kind: z.literal("a"), a: z.string() });

export { InternalA as AliasedA };

export const BSchema = z.object({ kind: z.literal("b"), b: z.number() });

export const UnionSchema = z.union([InternalA, BSchema]);
