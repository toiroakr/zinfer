import { z } from "zod";

/**
 * Multiple exported schemas in a single file.
 * Used to test schema detection and multi-schema extraction.
 */

export const UserSchema = z.object({
  id: z.string(),
  name: z.string(),
  email: z.string().email(),
});

export const PostSchema = z.object({
  id: z.string(),
  title: z.string(),
  content: z.string(),
  authorId: z.string(),
  publishedAt: z.date().optional(),
});

export const CommentSchema = z.object({
  id: z.string(),
  content: z.string(),
  postId: z.string(),
  authorId: z.string(),
  createdAt: z.date(),
});

/**
 * Non-exported schema - should NOT be detected
 */
const InternalHelperSchema = z.object({
  internal: z.boolean(),
});

/**
 * Schema with transform - input and output types differ
 */
export const DateStringSchema = z.object({
  date: z.string().transform((s) => new Date(s)),
});

// Re-export for testing (should still be detected only once)
export { InternalHelperSchema as AliasedSchema };
