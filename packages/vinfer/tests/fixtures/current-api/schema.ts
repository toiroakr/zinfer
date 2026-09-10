import * as v from "valibot";

export const Promise = v.custom<Promise<string>>((value) => value instanceof globalThis.Promise);
export const Text = v.string();
export const Transformed = v.objectAsync({
  awaited: v.pipeAsync(Promise, v.awaitAsync()),
  lower: v.pipe(Text, v.toLowerCase()),
  upper: v.pipe(Text, v.toUpperCase()),
  camel: v.pipe(Text, v.toCamelCase()),
  kebab: v.pipe(Text, v.toKebabCase()),
  pascal: v.pipe(Text, v.toPascalCase()),
  snake: v.pipe(Text, v.toSnakeCase()),
  normalized: v.pipe(Text, v.normalize()),
  trimmed: v.pipe(Text, v.trim()),
  trimmedStart: v.pipe(Text, v.trimStart()),
  trimmedEnd: v.pipe(Text, v.trimEnd()),
});
export const CodePoints = v.pipe(v.string(), v.codePoints(3));
export const MinCodePoints = v.pipe(v.string(), v.minCodePoints(1));
export const MaxCodePoints = v.pipe(v.string(), v.maxCodePoints(10));
export const NotCodePoints = v.pipe(v.string(), v.notCodePoints(2));
export const KSUID = v.pipe(v.string(), v.ksuid());
export const Values = v.pipe(v.string(), v.values(["a", "b"]));
export const NotValues = v.pipe(v.string(), v.notValues(["a", "b"]));
export const Cached = v.cache(v.object({ value: v.string() }));
export const CachedAsync = v.cacheAsync(v.objectAsync({ value: v.string() }));
export const ExactOptional = v.exactOptional(v.string());
export const Undefinedable = v.undefinedable(v.string());
export const Args = v.pipe(v.function(), v.args(v.tuple([v.string()])), v.returns(v.number()));
export const ParseBoolean = v.pipe(v.string(), v.parseBoolean());
export const ParseJSON = v.pipe(v.string(), v.parseJson());
export const StringifyJSON = v.pipe(v.unknown(), v.stringifyJson());
