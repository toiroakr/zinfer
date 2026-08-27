import { z } from "zod";

// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
export const functionSchema: z.ZodType<Function, Function> = z.custom<Function>(
  (value) => typeof value === "function",
);
