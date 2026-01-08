import { z } from "zod";
import { SharedSchema } from "./index.js";

// Uses a schema imported through re-exports
export const ReExportConsumerSchema = z.object({
  shared: SharedSchema,
  timestamp: z.date(),
});
