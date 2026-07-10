import { z } from "zod";
import { functionSchema } from "./mixed-union-reference-common";

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export const JsonValueSchema: z.ZodType<JsonValue, JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
  ]),
);

export const MixedValueSchema = z
  .union([JsonValueSchema, functionSchema])
  .describe("A JSON value or a function");

const referencedValueShape = {
  kind: z.literal("reference"),
  value: MixedValueSchema.optional(),
};

const ValueByReferenceSchema = z
  .object({
    ...referencedValueShape,
    reference: z.object({ name: z.string() }),
  })
  .transform(({ reference, ...entry }) => ({
    ...entry,
    referenceName: reference.name,
  }));

const ValueByNameSchema = z.object({
  ...referencedValueShape,
  referenceName: z.string(),
});

export const ReferencedValueSchema = z.union([ValueByReferenceSchema, ValueByNameSchema]);

export const CallableValueSchema = z.object({
  kind: z.literal("callable"),
  value: functionSchema,
});

export const ValueSchema = z.union([CallableValueSchema, ReferencedValueSchema]);

export const EnvelopeSchema = z.object({
  value: ValueSchema.describe("Value to store"),
});

const referencedValueOverrideShape = {
  value: MixedValueSchema.optional(),
};

const overriddenValueShape = {
  value: z.record(z.string(), z.unknown()).optional(),
};

const satisfiedOverrideValueShape = {
  value: z.record(z.string(), z.unknown()).optional(),
} satisfies z.ZodRawShape;

export const SpreadOverrideSchema = z.object({
  ...referencedValueOverrideShape,
  ...overriddenValueShape,
});

export const SatisfiedSpreadOverrideSchema = z.object({
  ...referencedValueOverrideShape,
  ...satisfiedOverrideValueShape,
});

type InternalNode = {
  children: InternalNode[];
};

const InternalNodeSchema: z.ZodType<InternalNode, InternalNode> = z.lazy(() =>
  z.object({ children: z.array(InternalNodeSchema) }),
);

export const RecursiveLeafSchema = z.object({
  value: z.string(),
});

export const RecursiveUnionSchema = z.union([InternalNodeSchema, RecursiveLeafSchema]);

const InternalPlainSchema = z.object({
  internal: z.string(),
});

export const PublicPlainSchema = z.object({
  public: z.string(),
});

export const MixedPlainUnionSchema = z.union([InternalPlainSchema, PublicPlainSchema]);

export const InlineImportedUnionSchema = z.union([z.string(), functionSchema]);
