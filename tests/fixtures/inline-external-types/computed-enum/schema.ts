import { z } from "zod";
import { Kind } from "./kind";

export const ComputedEnumSchema: z.ZodType<Kind, Kind> = z.any();
