import { z } from "zod";

// Non-exported helper schema with a branded field - never printed as its
// own declaration, since generateDeclarationFile only emits exported schemas.
// Nothing refers to it on purpose: the point is that a branded schema which is
// never emitted must not pull in the BRAND import.
// oxlint-disable-next-line no-unused-vars
const InternalBrandedSchema = z.object({
  id: z.string().brand<"InternalId">(),
});

export const PublicPlainSchema = z.object({
  name: z.string(),
});
