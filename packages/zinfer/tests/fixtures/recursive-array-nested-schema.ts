import { z } from "zod";

export const AttributeSchema = z.strictObject({
  name: z.string(),
  get subAttributes() {
    return z.array(AttributeSchema).nullable().optional();
  },
});

const SchemaSchema = z.strictObject({
  attributes: z.array(AttributeSchema).describe("Schema attributes"),
});

export const ResourceSchema = z.strictObject({
  coreSchema: SchemaSchema.describe("Core schema"),
});

export const ScimSchema = z.strictObject({
  resources: z.array(ResourceSchema),
});

const ConfigBaseSchema = z.strictObject({
  scim: ScimSchema.optional(),
});

export const ConfigSchema = z.xor([
  ConfigBaseSchema.extend({ a: z.string().optional() }),
  ConfigBaseSchema.extend({ b: z.string().optional() }),
]);
