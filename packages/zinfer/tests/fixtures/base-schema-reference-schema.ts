import { z } from "zod";
import { ImportedBaseSchema } from "./base-schema-reference-common";

export const KindSchema = z.enum(["a", "b"]);

const BaseShapeSchema = z.strictObject({ kind: KindSchema, name: z.string() });

export const RefinedBaseSchema = BaseShapeSchema.superRefine(() => {});

export const ExtendedBaseSchema = BaseShapeSchema.extend({ extra: KindSchema });

export const OverriddenBaseSchema = BaseShapeSchema.safeExtend({ kind: z.literal("a") });

export const ExportedBaseSchema = z
  .strictObject({ kind: KindSchema, name: z.string() })
  .superRefine(() => {});

export const ShapeSpreadSchema = z.strictObject({ ...ExportedBaseSchema.shape, extra: z.string() });

export const InlineExtendedSchema = z
  .strictObject({ name: z.string(), extra: KindSchema })
  .extend({ kind: KindSchema, extra: z.string() });

const SatisfiedBaseSchema = z.strictObject({ kind: KindSchema }) satisfies z.ZodType;

export const RefinedSatisfiedSchema = SatisfiedBaseSchema.superRefine(() => {});

export const AnnotatedBaseSchema = BaseShapeSchema.meta({ a: 1 })
  .check(() => {})
  .describe("x");

export const DoubleExtendedSchema = BaseShapeSchema.extend({ extra: KindSchema })
  .describe("x")
  .extend({ extra: z.boolean() });

export const PartialBaseSchema = BaseShapeSchema.partial();

export const OmittedBaseSchema = BaseShapeSchema.omit({ name: true });

export const RefinedImportedSchema = ImportedBaseSchema.superRefine(() => {});
