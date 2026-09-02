import * as z from "zod/mini";

export const BaseSchema = z.object({
  id: z.string(),
  name: z.string(),
  age: z.number(),
});

export const PickedSchema = z.pick(BaseSchema, { id: true, name: true });
export const OmittedSchema = z.omit(BaseSchema, { age: true });
export const PartialSchema = z.partial(BaseSchema);
export const RequiredSchema = z.required(PartialSchema);
export const ExtendedSchema = z.extend(BaseSchema, { active: z.boolean() });

export const TupleSchema = z.tuple([z.string(), z.number(), z.boolean()]);
export const RecordSchema = z.record(z.string(), z.number());
export const MapSchema = z.map(z.string(), z.number());
export const SetSchema = z.set(z.string());
export const IntersectionSchema = z.intersection(
  z.object({ a: z.string() }),
  z.object({ b: z.number() }),
);
export const LiteralUnionSchema = z.literal(["a", "b", "c"]);
export const TemplateLiteralSchema = z.templateLiteral(["prefix-", z.string()]);

export const DefaultedSchema = z.object({
  count: z._default(z.number(), 0),
});
export const PrefaultedSchema = z.object({
  label: z.prefault(z.string(), "unknown"),
});
export const CaughtSchema = z.object({
  value: z.catch(z.number(), 0),
});

export const CustomSchema = z.custom<`${string}@${string}`>(
  (val) => typeof val === "string" && val.includes("@"),
);

export const RefinedSchema = z.string().check(z.refine((val) => val.length > 0));
export const SuperRefinedSchema = z
  .object({
    a: z.number(),
    b: z.number(),
  })
  .check(
    z.superRefine((val, ctx) => {
      if (val.a > val.b) {
        ctx.addIssue({ code: "custom", message: "a must be <= b" });
      }
    }),
  );

export const ReadonlySchema = z.readonly(z.object({ locked: z.boolean() }));
export const PromiseSchema = z.promise(z.string());
export const ExactOptionalSchema = z.object({
  maybe: z.exactOptional(z.string()),
});
export const NonOptionalSchema = z.nonoptional(z.optional(z.string()));
export const NullishSchema = z.object({
  value: z.nullish(z.string()),
});
