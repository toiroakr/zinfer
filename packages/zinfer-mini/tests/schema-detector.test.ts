import { expect, it } from "vitest";
import { Project, ts } from "ts-morph";
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

it("detects a standalone z.properties() call as a schema on legacy Zod Mini (pre-4.6.3)", () => {
  // The real installed zod/mini is 4.6.3+, where properties() returns a
  // check. This stubs zod/mini's module shape as it was on 4.6.0-4.6.2,
  // where properties() returned a schema (exposing .parse()), to keep this
  // branch covered without pinning a second zod version for the whole suite.
  const project = new Project({
    useInMemoryFileSystem: true,
    compilerOptions: { moduleResolution: ts.ModuleResolutionKind.Bundler },
  });
  project.createSourceFile(
    "/node_modules/zod/package.json",
    JSON.stringify({ name: "zod", exports: { "./mini": { types: "./mini.d.ts" } } }),
  );
  project.createSourceFile(
    "/node_modules/zod/mini.d.ts",
    `
    export declare function string(): { parse(data: unknown): string; _zod: unknown };
    export declare function properties<S>(shape: S): { parse(data: unknown): unknown; _zod: unknown };
    `,
  );
  const file = project.createSourceFile(
    "/current-mini-legacy.ts",
    `
    import * as z from "zod/mini";
    export const Properties = z.properties({ name: z.string() });
  `,
  );
  expect(new SchemaDetector().getSchemaNames(file)).toEqual(["Properties"]);
});
