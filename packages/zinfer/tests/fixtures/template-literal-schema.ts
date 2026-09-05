import { z } from "zod";

/**
 * A named enum reused as a template literal part.
 */
export const LevelSchema = z.enum(["debug", "info"]);

enum Locale {
  En = "en",
  Ja = "ja",
}

/**
 * An unconstrained z.string() part keeps the type open-ended.
 */
export const GreetingSchema = z.templateLiteral(["hello, ", z.string(), "!"]);

/**
 * An inline z.enum() part expands to one literal per member.
 */
export const VersionSchema = z.templateLiteral(["v", z.enum(["1", "2"])]);

/**
 * An enum declared elsewhere resolves through the reference.
 */
export const LogLineSchema = z.templateLiteral(["log:", LevelSchema]);

/**
 * z.nativeEnum() members expand the same way z.enum()'s do.
 */
export const LocalePathSchema = z.templateLiteral(["/", z.nativeEnum(Locale)]);

/**
 * Two enum parts multiply out into every combination.
 */
export const SlugSchema = z.templateLiteral([z.enum(["a", "b"]), "-", z.enum(["x", "y"])]);

/**
 * Non-string parts stringify rather than expand.
 */
export const PortSchema = z.templateLiteral(["port:", z.number()]);

export const FlagSchema = z.templateLiteral(["flag=", z.boolean()]);

export const BigIntSchema = z.templateLiteral(["big:", z.bigint()]);

/**
 * A z.literal() part collapses to a single concrete string.
 */
export const FixedSchema = z.templateLiteral(["id_", z.literal("x")]);

/**
 * Template literals nest: one is itself a valid part of another.
 */
export const NestedSchema = z.templateLiteral(["outer-", LogLineSchema]);

/**
 * Wrappers around a template literal keep the expanded union.
 */
export const OptionalSchema = z.templateLiteral(["opt-", z.enum(["a", "b"])]).optional();

export const BrandedSchema = z.templateLiteral(["u_", z.string()]).brand<"UserId">();

/**
 * .transform() makes input and output diverge.
 */
export const LengthSchema = z.templateLiteral(["t", z.enum(["a", "b"])]).transform((s) => s.length);

/**
 * Template literals used inside larger schemas.
 */
export const RouteSchema = z.object({
  path: z.templateLiteral(["/", z.enum(["users", "posts"]), "/", z.number()]),
  tags: z.array(z.templateLiteral(["tag:", z.enum(["a", "b"])])),
});

export const CountsSchema = z.record(z.templateLiteral(["k", z.enum(["a", "b"])]), z.number());

export const MixedSchema = z.union([z.templateLiteral(["p", z.enum(["a"])]), z.literal("plain")]);

/**
 * A literal part containing a double quote must survive printing.
 */
export const QuotedSchema = z.templateLiteral(['say "', z.enum(["hi"]), '"']);
