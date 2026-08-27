import { z } from "zod";

// Regular arrays should NOT have readonly modifier
export const ListSchema = z.object({
  items: z.array(z.string()),
  nested: z.array(z.array(z.number())),
});
