import { z } from "zod";

// A plain (unbranded) literal whose value happens to contain the literal
// text "BRAND<" - brandStrategy: local-symbol's textual rewrite must not
// mistake this for a real .brand() marker.
export const LookalikeSchema = z.object({
  kind: z.literal("BRAND<Fake>"),
});
