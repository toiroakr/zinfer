import { z } from "zod";

export const AttributeSchema = z.strictObject({
  name: z.string(),
  meta: z.strictObject({ subAttributes: z.string() }).optional(),
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

// Same fields as AttributeSchema's recursion point, but a deliberate any[]:
// nothing here is recursive, so it must stay as written.
export const LooseAttributeSchema = z.strictObject({
  name: z.string(),
  meta: z.strictObject({ subAttributes: z.string() }).optional(),
  subAttributes: z.array(z.any()).nullable().optional(),
});

// A sibling printed in exactly the same shape as the recursive schema, next to
// the field that really holds it.
const SiblingBaseSchema = z.strictObject({
  attribute: AttributeSchema,
  loose: z.strictObject({
    name: z.string(),
    meta: z.strictObject({ subAttributes: z.string() }).optional(),
    subAttributes: z.array(z.any()).nullable().optional(),
  }),
});

export const SiblingSchema = z.xor([
  SiblingBaseSchema.extend({ x: z.string() }),
  SiblingBaseSchema.extend({ y: z.string() }),
]);
