import { z } from "zod";

export const Email = z.email();
export const CreditCard = z.creditCard();
export const IBAN = z.iban();
export const ISO = z.iso.datetime();
export const Coerced = z.coerce.number();
export const Integer = z.int();
export const BigInteger = z.int64();
export const File = z.file();
export const Template = z.templateLiteral(["id-", z.number()]);
export const Xor = z.xor([z.string(), z.number()]);
export const PartialRecord = z.partialRecord(z.enum(["a", "b"]), z.number());
export const LooseRecord = z.looseRecord(z.string(), z.number());
export const Codec = z.codec(z.string(), z.number(), {
  decode: Number,
  encode: String,
});
export const Inverted = z.invertCodec(Codec);
export const Input = z.input(Codec);
export const Output = z.output(Codec);
export const Compiled = z.compile(z.object({ name: z.string() }));
export const Parser = z.withParser(z.string(), (value) =>
  typeof value === "string" ? value : z.INVALID,
);
export const Cloned = z.clone(z.string());
export const DeepPartial = z.deepPartial(z.object({ nested: z.object({ name: z.string() }) }));
export const PartialTuple = z.tuple([z.string(), z.number()]).partial();
export const Typed = z.toZod<{ name: string }>()(z.object({ name: z.string() }));
export const Selected = z.getDiscriminatedOption(
  z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("a"), a: z.string() }),
    z.object({ kind: z.literal("b"), b: z.number() }),
  ]),
  "a",
);
export const Properties = z.properties({ name: z.string() });
export const Applied = z.string().apply((schema) => schema.optional());
export const JSON = z.json();
export const FromJSON = z.fromJSONSchema({ type: "string" });
export const ExactOptional = z.exactOptional(z.string());
export const Success = z.success(z.string());
export const StringBool = z.stringbool();
export const Default = z._default(z.string(), "x");
export const Prefault = z.prefault(z.string(), "x");
export const Catch = z.catch(z.string(), "x");
export const Readonly = z.readonly(z.array(z.string()));
export const Nonoptional = z.nonoptional(z.optional(z.string()));
export const Transform = z.transform((value: string) => value.length);
export const Fn = z.function({ input: [z.string()], output: z.number() });

// Utilities and factory functions are not schema declarations.
export const Factory = z.toZod<string>();
export const AppliedValue = z.string().apply(() => 42);
export const Validation = z.safeParse(z.string(), "x");
export const Check = z.check<string>(() => {});

export const NestedJSON = z.object({ payload: z.json() });
export const TAG = Symbol("tag");
export const SymbolKey = z.object({ [TAG]: z.number(), name: z.string() });
export const ExplicitSymbolKey: z.ZodType<{ [TAG]: number; name: string }> = SymbolKey;
export const ExplicitTransformedSymbolKey: z.ZodType<
  { [TAG]: number; name: string },
  { [TAG]: string; name: string }
> = z.object({ [TAG]: z.string().transform(Number), name: z.string() });
export const ExplicitSymbolFromString: z.ZodType<{ [TAG]: number; name: string }, string> = z
  .string()
  .transform((name) => ({ [TAG]: name.length, name }));
type SymbolRecord = { [TAG]: number; name: string };
export const NamedExplicitSymbolKey: z.ZodType<SymbolRecord, SymbolRecord> = SymbolKey;
export const ExplicitSymbolToString: z.ZodType<string, SymbolRecord> = SymbolKey.transform(
  (value) => value.name,
);

type __NormalizeJSON = "user-json";
type __NormalizeValue = { user: string };
export const UserJSONName = z.custom<__NormalizeJSON>();
export const UserValueName = z.custom<__NormalizeValue>();
export const ExactPartial = Compiled.exactPartial();
