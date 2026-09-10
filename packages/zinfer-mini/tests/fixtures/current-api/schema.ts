import * as z from "zod/mini";
import { iso, coerce, compile as compileSchema, toZod as typedSchema } from "zod/mini";

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
export const PartialTuple = z.partial(z.tuple([z.string(), z.number()]));
export const Typed = z.toZod<{ name: string }>()(z.object({ name: z.string() }));
export const Selected = z.getDiscriminatedOption(
  z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("a"), a: z.string() }),
    z.object({ kind: z.literal("b"), b: z.number() }),
  ]),
  "a",
);
export const Properties = z.properties({ name: z.string() });
export const Applied = z.string().apply((schema) => z.optional(schema));
export const JSON = z.json();
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
export const AppliedFn = z
  .function({ input: [z.string()], output: z.number() })
  .apply((fn) => fn.output(z.string()));
export const AppliedFnInput = Fn.apply((fn) => fn.input([z.number()]));

// Utilities and factory functions are not schema declarations.
export const Factory = z.toZod<string>();
export const AppliedValue = z.string().apply(() => 42);
export const Validation = z.safeParse(z.string(), "x");
export const Check = z.check<string>(() => {});

export const NamedISO = iso.date();
export const NamedCoerced = coerce.boolean();
export const NamedCompiled = compileSchema(z.number());
export const NamedTyped = typedSchema<string>()(z.string());
export const Instance = z.instanceof(Date);

export const NestedJSON = z.object({ payload: z.json() });
export const TAG = Symbol("tag");
export const SymbolKey = z.object({ [TAG]: z.number(), name: z.string() });

type __NormalizeJSON = "user-json";
type __NormalizeValue = { user: string };
export const UserJSONName = z.custom<__NormalizeJSON>();
export const UserValueName = z.custom<__NormalizeValue>();
export const ExactPartial = z.exactPartial(z.object({ name: z.string() }));
import { exactPartial as exactPartialSchema } from "zod/mini";
export const NamedExactPartial = exactPartialSchema(z.object({ name: z.string() }));

import { z as classic } from "zod";
export const ClassicApplied = classic.string().apply((schema) => schema);

export const ClassicAppliedFn = Fn.apply(() =>
  classic.function({ input: [classic.string()], output: classic.number() }),
);
export const AppliedFnValue = Fn.apply((fn) => fn.implement((value) => value.length));
