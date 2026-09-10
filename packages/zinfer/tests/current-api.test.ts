import * as schemaLibrary from "zod";
import { expect, it } from "vitest";
import { dirname, resolve } from "pathe";
import { Project, ts } from "ts-morph";
import { ZodTypeExtractor } from "../src/core/extractor.js";
import { createNameMapper } from "../src/core/name-mapper.js";
import { generateDeclarationFile } from "../src/core/type-printer.js";

it.skipIf(!("iban" in schemaLibrary))(
  "extracts current Zod APIs with the same input and output types as Zod",
  () => {
    const fixture = resolve(import.meta.dirname, "fixtures/current-api/schema.ts");
    const project = new Project({
      compilerOptions: {
        strict: true,
        skipLibCheck: true,
        target: ts.ScriptTarget.ESNext,
        module: ts.ModuleKind.ESNext,
        moduleResolution: ts.ModuleResolutionKind.Bundler,
      },
    });
    const source = project.addSourceFileAtPath(fixture);
    const expected = source
      .getVariableDeclarations()
      .map((declaration) => declaration.getName())
      .filter(
        (name) =>
          ![
            "Factory",
            "AppliedValue",
            "Validation",
            "Validated",
            "ValidatedAsync",
            "Decoded",
            "Encoded",
            "SafeDecoded",
            "SafeEncoded",
            "DecodedAsync",
            "EncodedAsync",
            "SafeDecodedAsync",
            "SafeEncodedAsync",
            "Metadata",
            "JSONSchema",
            "Check",
            "TAG",
          ].includes(name),
      );
    expect(project.formatDiagnosticsWithColorAndContext(project.getPreEmitDiagnostics())).toBe("");
    const results = new ZodTypeExtractor().extractAll(fixture);
    expect(
      results.filter((result) => result.isExported).map((result) => result.schemaName),
    ).toEqual(expected);
    project.createSourceFile(
      resolve(dirname(fixture), "generated.ts"),
      [
        generateDeclarationFile(results, createNameMapper()),
        'import type { z } from "zod";',
        'import type * as schemas from "./schema.js";',
        "type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;",
        "type Assert<T extends true> = T;",
        ...expected.flatMap((name) => [
          `type ${name}InputCheck = Assert<Equal<${name}Input, z.input<typeof schemas.${name}>>>;`,
          `type ${name}OutputCheck = Assert<Equal<${name}Output, z.output<typeof schemas.${name}>>>;`,
        ]),
      ].join("\n"),
    );
    expect(project.formatDiagnosticsWithColorAndContext(project.getPreEmitDiagnostics())).toBe("");
  },
);
