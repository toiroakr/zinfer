import { z } from "zod";
import type { Wrapper } from "./wrapper";

export const TypeofQuerySchema: z.ZodType<Wrapper, Wrapper> = z.any();
