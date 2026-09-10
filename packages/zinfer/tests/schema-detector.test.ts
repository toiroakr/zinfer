import { describe, it, expect } from "vitest";
import { resolve } from "path";
import { Project } from "ts-morph";
import { SchemaDetector } from "../src/core/schema-detector.js";

const fixturesDir = resolve(import.meta.dirname, "fixtures");

describe("SchemaDetector", () => {
  const detector = new SchemaDetector();

  function getSourceFile(filename: string) {
    const project = new Project();
    return project.addSourceFileAtPath(resolve(fixturesDir, filename));
  }

  it("detects current Zod schema builders", () => {
    const project = new Project();
    const sourceFile = project.createSourceFile(
      "current-api.ts",
      `
      import { z } from "zod";
      export const Email = z.email();
      export const Compiled = z.compile(z.object({ name: z.string() }));
      export const Input = z.input(z.stringbool());
      export const Output = z.output(z.stringbool());
      export const DeepPartial = z.deepPartial(z.object({ name: z.string() }));
      export const IBAN = z.iban();
      export const Properties = z.properties({ name: z.string() });
    `,
    );
    expect(detector.getSchemaNames(sourceFile)).toEqual([
      "Email",
      "Compiled",
      "Input",
      "Output",
      "DeepPartial",
      "IBAN",
      "Properties",
    ]);
  });

  it("does not detect ordinary clone, pipe, or catch calls as schemas", () => {
    const project = new Project();
    const source = project.createSourceFile(
      "plain-values.ts",
      `
      const config = { clone: () => ({ ok: true }), pipe: () => "text" };
      export const Snapshot = config.clone();
      export const Text = config.pipe();
      export const Caught = Promise.resolve(1).catch(() => 0);
    `,
    );
    expect(detector.getSchemaNames(source)).toEqual([]);
  });

  it("distinguishes Zod method chains from ordinary APIs with the same method names", () => {
    const project = new Project();
    const source = project.createSourceFile(
      resolve(fixturesDir, "method-results.ts"),
      `
      import { z } from "zod";
      const Base = z.string();
      export const Length = Base.transform((value) => value.length);
      export const Optional = Base.optional();
      const ordinary = { transform: () => 1, optional: () => "text" };
      export const Count = ordinary.transform();
      export const Text = ordinary.optional();
    `,
    );
    expect(detector.getSchemaNames(source)).toEqual(["Base", "Length", "Optional"]);
  });

  it("excludes parsed values while preserving schema-returning method chains", () => {
    const project = new Project();
    const source = project.createSourceFile(
      resolve(fixturesDir, "parsed-values.ts"),
      `
      import { z } from "zod";
      export const String = z.string().optional();
      export const Object = z.object({ name: z.string() }).partial();
      export const Recursive = z.lazy(() => z.string()).optional();
      export const Parsed = z.string().parse("x");
      export const Safe = z.string().safeParse("x");
      export const Async = z.string().parseAsync("x");
      export const SafeAsync = z.string().safeParseAsync("x");
      export const Alias = z.string().spa("x");
      export const Any = z.any().parse("x");
      export const Unknown = z.unknown().parse("x");
      export const Optional = z.string().isOptional();
      export const Nullable = z.string().isNullable();
      export const Bracket = z.string()["parse"]("x");
      export const ParsedCallable = z.object({
        _input: z.string(), _def: z.string(), parse: z.custom<() => string>()
      }).parse({ _input: "x", _def: "y", parse: () => "data" });
      export const ParsedDef = z.object({ _input: z.string(), _def: z.string() })
        .parse({ _input: "x", _def: "y" });
      export const ParsedZod = z.object({ _input: z.string(), _zod: z.string() })
        .parse({ _input: "x", _zod: "y" });
      `,
    );
    expect(detector.getSchemaNames(source)).toEqual(["String", "Object", "Recursive"]);
  });

  describe("detectExportedSchemas", () => {
    it("should detect schemas from basic-schema.ts", () => {
      const sourceFile = getSourceFile("basic-schema.ts");
      const schemas = detector.detectExportedSchemas(sourceFile);
      expect(schemas).toMatchSnapshot();
    });

    it("should detect schemas from multi-schema.ts", () => {
      const sourceFile = getSourceFile("multi-schema.ts");
      const schemas = detector.detectExportedSchemas(sourceFile);
      expect(schemas).toMatchSnapshot();
    });

    it("should detect schemas from utility-types-schema.ts", () => {
      const sourceFile = getSourceFile("utility-types-schema.ts");
      const schemas = detector.detectExportedSchemas(sourceFile);
      expect(schemas).toMatchSnapshot();
    });

    it("should detect schemas from union-schema.ts", () => {
      const sourceFile = getSourceFile("union-schema.ts");
      const schemas = detector.detectExportedSchemas(sourceFile);
      expect(schemas).toMatchSnapshot();
    });

    it("should detect schemas from mixed-export-schema.ts", () => {
      const sourceFile = getSourceFile("mixed-export-schema.ts");
      const schemas = detector.detectExportedSchemas(sourceFile);
      expect(schemas).toMatchSnapshot();
    });

    it("should detect schemas whose builder chain is formatted across multiple lines", () => {
      // Inline source keeps the line breaks that formatters like prettier
      // insert between "z" and the builder method, which fixtures on disk
      // would lose to this repository's own formatter.
      const project = new Project();
      const sourceFile = project.createSourceFile(
        "multiline-schema.ts",
        [
          'import { z } from "zod";',
          "export const MultilineUnionSchema = z",
          '  .union([z.literal("active"), z.literal("inactive")])',
          '  .describe("status of the entity");',
          "export const MultilineStringSchema = z",
          "  .string()",
          "  .min(1)",
          '  .describe("non-empty string");',
          "export const MultilineLazySchema = z",
          "  .lazy(() => z.object({ name: z.string() }));",
        ].join("\n"),
      );
      const names = detector.detectExportedSchemas(sourceFile).map((s) => s.name);
      expect(names).toEqual([
        "MultilineUnionSchema",
        "MultilineStringSchema",
        "MultilineLazySchema",
      ]);
    });
  });

  describe("getSchemaNames", () => {
    it("should return schema names from basic-schema.ts", () => {
      const sourceFile = getSourceFile("basic-schema.ts");
      const names = detector.getSchemaNames(sourceFile);
      expect(names).toMatchSnapshot();
    });

    it("should return schema names from multi-schema.ts", () => {
      const sourceFile = getSourceFile("multi-schema.ts");
      const names = detector.getSchemaNames(sourceFile);
      expect(names).toMatchSnapshot();
    });
  });
});
