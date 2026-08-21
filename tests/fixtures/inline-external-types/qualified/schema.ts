import { z } from "zod";
import type { Wrapper } from "./wrapper";

export const QualifiedSchema: z.ZodType<Wrapper, Wrapper> = z.any();
