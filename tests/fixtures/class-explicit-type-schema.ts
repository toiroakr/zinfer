import { z } from "zod";

export class LocalClass {
  value: string = "";
}

export const FooSchema: z.ZodType<LocalClass, LocalClass> = z.any();
