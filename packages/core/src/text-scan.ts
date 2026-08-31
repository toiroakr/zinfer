/**
 * Escapes special characters in a string for use in a RegExp.
 */
export function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Checks whether the character at `index` is escaped by a preceding
 * backslash - one that itself is not escaped, so `\\"` (an escaped
 * backslash followed by an unescaped quote) does not count.
 */
export function isEscaped(str: string, index: number): boolean {
  let backslashes = 0;
  for (let i = index - 1; i >= 0 && str[i] === "\\"; i--) {
    backslashes++;
  }
  return backslashes % 2 === 1;
}

/**
 * Whether `text[afterIdentifier]` begins a generic method signature's own
 * type parameter list (`<T>(`), not a generic type instantiation (`<Args>`
 * with no method call following). Scans a balanced `<...>` run and checks
 * whether `(` immediately follows the close.
 *
 * A type parameter's constraint or default can itself carry an arrow
 * function type (`<T extends (x: string) => void>`) - that `=>`'s `>` never
 * opened a matching `<`, so it must not be counted as a close, the same
 * `=>` exclusion `needsParensBeforeSuffix` applies for the same reason.
 * Miscounting it would close the scan early, at the arrow's own `>`, and
 * misjudge whatever follows. A quote inside the type-parameter list (e.g.
 * a literal type argument like `<'a<b>'>`) doesn't confuse the scan either -
 * depth-counting a `<`/`>` that only appears inside a string literal would
 * otherwise misjudge the balance the same way.
 */
export function isGenericMethodName(text: string, afterIdentifier: number): boolean {
  if (text[afterIdentifier] !== "<") return false;

  let depth = 0;
  let quote: string | undefined;

  for (let i = afterIdentifier; i < text.length; i++) {
    const char = text[i];

    if (quote) {
      if (char === quote && !isEscaped(text, i)) quote = undefined;
      continue;
    }

    if (char === '"' || char === "'" || char === "`") {
      quote = char;
    } else if (char === "<") {
      depth++;
    } else if (char === ">") {
      if (text[i - 1] === "=") continue;
      depth--;
      if (depth === 0) return text[i + 1] === "(";
    }
  }

  return false;
}

/**
 * Rewrites every bare occurrence of `typeName` in `text` to `replacement` -
 * "bare" meaning a plain type reference, not text that merely happens to
 * spell the same characters. Skips a quoted string literal (e.g. a
 * discriminant or literal property value that happens to match the type's
 * own name), a property key (`name:`/`name?:`), a method signature's own
 * name (`name(): T`, or a generic method's own `name<T>(): T`), and a
 * dot-qualified name (`import("...").typeName` or `Namespace.typeName`,
 * where substituting only `typeName` would strand the qualifier against
 * the replacement instead of the declaration it names) - a naive
 * word-boundary substitution would otherwise corrupt them instead of
 * rewriting a reference.
 */
export function replaceBareTypeName(text: string, typeName: string, replacement: string): string {
  let result = "";
  let quote: string | undefined;
  let i = 0;

  while (i < text.length) {
    const char = text[i];

    if (quote) {
      result += char;
      if (char === quote && !isEscaped(text, i)) quote = undefined;
      i++;
      continue;
    }

    if (char === '"' || char === "'" || char === "`") {
      quote = char;
      result += char;
      i++;
      continue;
    }

    if (/[A-Za-z_$]/.test(char)) {
      let end = i + 1;
      while (end < text.length && /[A-Za-z0-9_$]/.test(text[end])) end++;
      const word = text.slice(i, end);

      const precededByDot = i > 0 && text[i - 1] === ".";
      const nextChar = text[end];
      const isPropertyKey = nextChar === ":" || (nextChar === "?" && text[end + 1] === ":");
      const isMethodName = nextChar === "(" || isGenericMethodName(text, end);

      result +=
        word === typeName && !precededByDot && !isPropertyKey && !isMethodName ? replacement : word;
      i = end;
      continue;
    }

    result += char;
    i++;
  }

  return result;
}
