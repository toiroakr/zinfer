import { z } from "zod";

/**
 * z.json() is recursive, and zinfer unrolls it to the printer's expansion
 * depth instead of emitting a named self-referential type - so the printed
 * union is long and bottoms out in `any`, where zod's own inference names a
 * single recursive `JSONType`.
 *
 * Kept in a fixture of its own so that documenting the divergence in
 * KNOWN_TYPE_DIFFERENCES (which is keyed per generated test file) covers
 * only this one schema, and leaves v4-builders-schema.test.ts strict about
 * every other builder.
 */
export const JsonSchema = z.json();
