import { describe, it, expect } from "vitest";
import { Project } from "ts-morph";
import { resolve } from "pathe";
import { SchemaDetector } from "../src/core/schema-detector.js";
import { ZOD_MINI_SCHEMA_BUILDERS } from "../src/core/zod-mini-bindings.js";

// The builder-name list can only ever describe the zod/mini that
// zinfer-mini was written against. These cover the backstop that keeps a
// *newer* zod's builders from silently vanishing from the output: when the
// name is unknown, the declaration's resolved type decides.
describe("SchemaDetector - unknown zod/mini builders", () => {
  function detectFrom(lines: string[]) {
    // A real Project (with zod/mini's types resolvable) is required here -
    // the fallback asks the type checker, not the source text.
    const project = new Project({
      tsConfigFilePath: resolve(import.meta.dirname, "../tsconfig.json"),
    });
    const sourceFile = project.createSourceFile("unknown-builder.ts", lines.join("\n"), {
      overwrite: true,
    });
    return new SchemaDetector().detectExportedSchemas(sourceFile).map((s) => s.name);
  }

  it("detects a builder that is not in the known-name list", () => {
    // z.deepPartial() is a real zod/mini export that returns a real schema,
    // yet schema-builders.test.ts cannot classify it (its generic signature
    // does not reduce to $ZodType through ReturnType), so it is legitimately
    // absent from the fast-path list. That makes it the live stand-in for
    // "a builder this list has never heard of" - and a demonstration of why
    // the fallback has to exist: the contract test alone cannot keep the
    // list exhaustive.
    expect(
      ZOD_MINI_SCHEMA_BUILDERS.has("deepPartial"),
      "deepPartial is now on the fast path, so this test no longer exercises the fallback - " +
        "pick another export the list does not cover",
    ).toBe(false);

    expect(
      detectFrom([
        `import * as z from "zod/mini";`,
        "const Base = z.object({ a: z.string(), b: z.number() });",
        "export const DeepPartialSchema = z.deepPartial(Base);",
      ]),
    ).toEqual(["Base", "DeepPartialSchema"]);
  });

  it("does not mistake a zod/mini check for a schema", () => {
    // z.refine()/z.minLength()/z.property() return checks, meant to be
    // handed to a schema's .check() rather than used as one. They carry
    // zod's `_zod` marker but no `def`, which is what the fallback keys on.
    expect(
      detectFrom([
        `import * as z from "zod/mini";`,
        "export const NotASchema = z.refine((value: string) => value.length > 0);",
        "export const AlsoNotASchema = z.minLength(3);",
        'export const NorThis = z.property("a", z.string());',
      ]),
    ).toEqual([]);
  });

  it("does not mistake a non-schema zod/mini helper for a schema", () => {
    expect(
      detectFrom([
        `import * as z from "zod/mini";`,
        "export const jsonSchema = z.toJSONSchema(z.string());",
        'export const parsed = z.safeParse(z.string(), "x");',
      ]),
    ).toEqual([]);
  });

  it("leaves declarations that are not rooted at zod/mini alone", () => {
    // The fallback only runs for calls that resolve to a zod/mini export,
    // so an unrelated library's value is never pulled in just for having a
    // similarly shaped `def`.
    expect(
      detectFrom([
        "declare const other: { build(): { _zod: unknown; def: { type: string } } };",
        "export const NotZod = other.build();",
      ]),
    ).toEqual([]);
  });
});
