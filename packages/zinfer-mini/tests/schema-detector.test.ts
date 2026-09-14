import { expect, it } from "vitest";
import { Project } from "ts-morph";
import { SchemaDetector } from "../src/core/schema-detector.js";

it("detects current Mini schema builders and nested namespaces", () => {
  const project = new Project();
  const file = project.createSourceFile(
    "current-mini.ts",
    `
    import * as z from "zod/mini";
    export const ISO = z.iso.datetime();
    export const Coerced = z.coerce.number();
    export const Compiled = z.compile(z.string());
    export const Input = z.input(z.stringbool());
    export const Output = z.output(z.stringbool());
    export const DeepPartial = z.deepPartial(z.object({ name: z.string() }));
    export const IBAN = z.iban();
    export const CurrencyCode = z.currencyCode();
    export const JSON = z.json();
    export const Fn = z.function({ input: [z.string()], output: z.number() });
    export const Transform = z.transform((value: string) => value.length);
  `,
  );
  expect(new SchemaDetector().getSchemaNames(file)).toEqual([
    "ISO",
    "Coerced",
    "Compiled",
    "Input",
    "Output",
    "DeepPartial",
    "IBAN",
    "CurrencyCode",
    "JSON",
    "Fn",
    "Transform",
  ]);
});

it("does not detect a standalone z.properties() call as a schema", () => {
  const project = new Project();
  const file = project.createSourceFile(
    "standalone-mini-properties.ts",
    `
    import * as z from "zod/mini";
    export const Properties = z.properties({ name: z.string() });
  `,
  );
  expect(new SchemaDetector().getSchemaNames(file)).toEqual([]);
});
