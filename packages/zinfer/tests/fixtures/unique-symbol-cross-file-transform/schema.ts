import { z } from "zod";
import type { Named } from "./types";

// `Named` is only reached through a `.transform()` return-type assertion,
// nested inside a larger object type - not a top-level `z.ZodType<T>`
// annotation. TypeScript prints it as a bare identifier (see types.ts for
// why), valid only because `Named` is in scope via this file's own
// `import type`. zinfer must promote that to a self-contained reference
// wherever the resolved type is embedded, not leave it as a dangling name.
export const FooSchema = z
  .object({ id: z.string() })
  .transform((x) => x as unknown as { value: Named });
