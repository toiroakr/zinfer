import { z } from "zod";

export const RestTupleSchema = z.object({
  entry: z.tuple([z.string()]).rest(z.number()),
});
