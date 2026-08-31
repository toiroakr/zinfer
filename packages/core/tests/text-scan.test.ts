import { describe, it, expect } from "vitest";
import {
  escapeRegExp,
  isEscaped,
  isGenericMethodName,
  replaceBareTypeName,
} from "../src/text-scan.js";

describe("escapeRegExp", () => {
  it("should escape RegExp special characters", () => {
    expect(escapeRegExp("a.b*c?d")).toBe("a\\.b\\*c\\?d");
    expect(escapeRegExp("[foo](bar)")).toBe("\\[foo\\]\\(bar\\)");
  });

  it("should leave a string with no special characters untouched", () => {
    expect(escapeRegExp("PlainName")).toBe("PlainName");
  });
});

describe("isEscaped", () => {
  it("should return false when there is no preceding backslash", () => {
    expect(isEscaped('"foo"', 4)).toBe(false);
  });

  it("should return true for a single preceding backslash", () => {
    expect(isEscaped('\\"', 1)).toBe(true);
  });

  it("should return false for an escaped backslash followed by the character", () => {
    // `\\"` - the backslash is itself escaped, so the quote at index 2 is not escaped.
    expect(isEscaped('\\\\"', 2)).toBe(false);
  });
});

describe("isGenericMethodName", () => {
  it("should return false when the position is not a `<`", () => {
    expect(isGenericMethodName("foo(): T", 3)).toBe(false);
  });

  it("should return true for a generic method signature (`<T>(`)", () => {
    const text = "foo<T>(): T";
    expect(isGenericMethodName(text, 3)).toBe(true);
  });

  it("should return false for a generic type instantiation with no method call following", () => {
    const text = "foo<Args>";
    expect(isGenericMethodName(text, 3)).toBe(false);
  });

  it("should not miscount an arrow-type constraint's own `=>` as closing the type-parameter list", () => {
    const text = "foo<T extends (x: string) => void>(): T";
    expect(isGenericMethodName(text, 3)).toBe(true);
  });

  it("should not miscount a `<`/`>` that only appears inside a quoted literal type argument", () => {
    // The type-parameter list's real close is the second `>` (followed by
    // `(`); the first `>` is inside the `'>'` string literal default and
    // must not be treated as the list's close.
    const text = "foo<'>'>(): T";
    expect(isGenericMethodName(text, 3)).toBe(true);
  });

  it("should not treat a quoted `<` inside a literal type argument as opening a nested list", () => {
    const text = "foo<'<'>(): T";
    expect(isGenericMethodName(text, 3)).toBe(true);
  });

  it("should close a quoted literal ending in an escaped backslash, not stay stuck inside it", () => {
    // The printed form of the single-character string literal type `a\` is
    // `'a\\'` - the backslash right before the closing quote is itself
    // escaped (a literal backslash character), so it must not be read as
    // escaping the quote that follows it.
    const text = "foo<'a\\\\'>(): T";
    expect(isGenericMethodName(text, 3)).toBe(true);
  });
});

describe("replaceBareTypeName", () => {
  it("should replace a bare occurrence of the type name", () => {
    expect(replaceBareTypeName("Foo | null", "Foo", "FooInput")).toBe("FooInput | null");
  });

  it("should not replace an occurrence inside a quoted string literal", () => {
    expect(replaceBareTypeName('{ kind: "Foo" }', "Foo", "FooInput")).toBe('{ kind: "Foo" }');
  });

  it("should not replace a property key", () => {
    expect(replaceBareTypeName("{ Foo: string }", "Foo", "FooInput")).toBe("{ Foo: string }");
    expect(replaceBareTypeName("{ Foo?: string }", "Foo", "FooInput")).toBe("{ Foo?: string }");
  });

  it("should not replace a method signature's own name", () => {
    expect(replaceBareTypeName("{ Foo(): void }", "Foo", "FooInput")).toBe("{ Foo(): void }");
  });

  it("should not replace a generic method signature's own name", () => {
    expect(replaceBareTypeName("{ Foo<T>(): T }", "Foo", "FooInput")).toBe("{ Foo<T>(): T }");
  });

  it("should not replace a dot-qualified occurrence", () => {
    expect(replaceBareTypeName('import("./x").Foo', "Foo", "FooInput")).toBe('import("./x").Foo');
    expect(replaceBareTypeName("Namespace.Foo", "Foo", "FooInput")).toBe("Namespace.Foo");
  });

  it("should still replace a generic type instantiation (not a method signature)", () => {
    expect(replaceBareTypeName("Foo<Args>", "Foo", "FooInput")).toBe("FooInput<Args>");
  });
});
