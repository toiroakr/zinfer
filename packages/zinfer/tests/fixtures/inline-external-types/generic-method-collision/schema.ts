import { z } from "zod";
import type { Wrapper } from "./wrapper";

export const GenericMethodCollisionSchema: z.ZodType<Wrapper, Wrapper> = z.any();
