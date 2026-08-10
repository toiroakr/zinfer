import { z } from "zod";

// Non-exported helper schema with a branded field - never printed as its
// own declaration, since generateDeclarationFile only emits exported schemas.
const InternalBrandedSchema = z.object({
  id: z.string().brand<"InternalId">(),
});

export const PublicPlainSchema = z.object({
  name: z.string(),
});
