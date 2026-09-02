import * as z from "zod/mini";

export const AddressSchema = z.object({
  city: z.string(),
  zip: z.string(),
});

export const TagSchema = z.object({
  slug: z.string(),
});

export const LabelSchema = z.object({
  text: z.string(),
});

export const UserSchema = z.object({
  id: z.string(),
  address: AddressSchema,
  previousAddresses: z.array(AddressSchema),
  billingAddress: z.optional(AddressSchema),
  // Regression: "tag" is a suffix of "petTag" - findReferenceOccurrence's
  // field-name regex must not match "tag: " *inside* "petTag: " and
  // substitute the wrong schema's reference into either field.
  tag: TagSchema,
  petTag: LabelSchema,
});

export const CatSchema = z.object({
  kind: z.literal("cat"),
  meow: z.boolean(),
});

export const DogSchema = z.object({
  kind: z.literal("dog"),
  bark: z.boolean(),
});

export const PetSchema = z.discriminatedUnion("kind", [CatSchema, DogSchema]);

export interface TreeNode {
  value: string;
  children: TreeNode[];
}

export const TreeSchema: z.ZodMiniType<TreeNode> = z.object({
  value: z.string(),
  get children() {
    return z.array(TreeSchema);
  },
});

export const UserIdSchema = z.string().brand("UserId");
