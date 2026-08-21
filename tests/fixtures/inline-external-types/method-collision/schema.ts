import { z } from "zod";
import type { Wrapper } from "./wrapper";

export const MethodCollisionSchema: z.ZodType<Wrapper, Wrapper> = z.any();
