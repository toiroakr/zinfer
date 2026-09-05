import { z } from "zod";

// Covers the zod v4 builders that only became detectable once
// ZOD_SCHEMA_BUILDERS caught up with zod's export surface. Each one is
// written as a *bare* call, since that is the shape that used to be dropped
// silently - anything with a chained `.describe()`/`.optional()` was already
// picked up by the method-chain fallback and never reproduced the bug.
//
// Exotic exports (z.clone, z.fromJSONSchema, z._default, z._function) are
// listed in ZOD_SCHEMA_BUILDERS but left out here: they take arguments no
// real schema file would write by hand. tests/schema-builders.test.ts is
// what keeps them covered.

const BaseSchema = z.object({ id: z.string(), count: z.number() });

/**
 * String formats. Each is its own schema builder in v4, not a check on
 * z.string(), so each one needs to be recognised on its own.
 */
export const EmailSchema = z.email();

export const UrlSchema = z.url();

export const UuidSchema = z.uuid();

export const Uuidv4Schema = z.uuidv4();

export const GuidSchema = z.guid();

export const NanoidSchema = z.nanoid();

export const Cuid2Schema = z.cuid2();

export const UlidSchema = z.ulid();

export const Ipv4Schema = z.ipv4();

export const Cidrv4Schema = z.cidrv4();

export const MacSchema = z.mac();

export const Base64Schema = z.base64();

export const JwtSchema = z.jwt();

export const EmojiSchema = z.emoji();

export const HostnameSchema = z.hostname();

export const HexSchema = z.hex();

export const E164Schema = z.e164();

export const HttpUrlSchema = z.httpUrl();

export const StringFormatSchema = z.stringFormat("slug", /^[a-z-]+$/);

/**
 * The z.iso.* group reaches the detector as the `iso` namespace, since that
 * is what follows the `z.` prefix.
 */
export const IsoDateSchema = z.iso.date();

export const IsoDateTimeSchema = z.iso.datetime();

/**
 * Number formats.
 */
export const IntSchema = z.int();

export const Int32Schema = z.int32();

export const Uint32Schema = z.uint32();

export const Float64Schema = z.float64();

export const Int64Schema = z.int64();

export const NanSchema = z.nan();

/**
 * z.stringbool() is the clearest input/output split of the group: it accepts
 * a string and produces a boolean.
 */
export const StringBoolSchema = z.stringbool();

/**
 * Collections and object operations whose schema is an argument rather than
 * a method receiver.
 */
export const KeyofSchema = z.keyof(BaseSchema);

export const PartialRecordSchema = z.partialRecord(z.enum(["a", "b"]), z.string());

export const LooseRecordSchema = z.looseRecord(z.string(), z.number());

export const XorSchema = z.xor([z.object({ a: z.string() }), z.object({ b: z.number() })]);

/**
 * Wrappers.
 */
export const ReadonlySchema = z.readonly(BaseSchema);

export const NullishSchema = z.nullish(z.string());

export const NonOptionalSchema = z.nonoptional(z.optional(z.string()));

export const SuccessSchema = z.success(z.string());

export const ExactOptionalSchema = z.object({
  maybe: z.exactOptional(z.string()),
});

/**
 * Value-attaching wrappers, where input and output diverge.
 */
export const CatchSchema = z.catch(z.number(), 0);

export const PrefaultSchema = z.prefault(z.string(), "unknown");

/**
 * Composition.
 */
export const PipeSchema = z.pipe(z.string(), z.coerce.number());

export const CodecSchema = z.codec(z.string(), z.number(), {
  decode: (value) => value.length,
  encode: (value) => String(value),
});

export const TransformSchema = z.transform((value: string) => value.length);

export const InvertCodecSchema = z.invertCodec(
  z.codec(z.string(), z.number(), {
    decode: (value) => value.length,
    encode: (value) => String(value),
  }),
);

// z.file() is deliberately absent. It is listed in ZOD_SCHEMA_BUILDERS and
// covered by the detector test, but its printed type expands to the whole
// structural File interface, whose member types depend on which lib
// resolves `Blob`/`ReadableStream` - the DOM ones under the test project,
// node:buffer's under the CLI. That makes it environment-dependent output,
// which has no business in a committed snapshot.
