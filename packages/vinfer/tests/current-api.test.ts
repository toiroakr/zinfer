import * as schemaLibrary from "valibot";
import { expect, it } from "vitest";
import { resolve } from "pathe";
import { Project, ts } from "ts-morph";
import { ValibotTypeExtractor } from "../src/core/extractor.js";
import { createNameMapper } from "../src/core/name-mapper.js";
import { generateDeclarationFile } from "../src/core/type-printer.js";

it.skipIf(!("ksuid" in schemaLibrary))(
  "extracts current Valibot APIs with the same input and output types as Valibot",
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
    const expected = source.getVariableDeclarations().map((declaration) => declaration.getName());
    expect(project.formatDiagnosticsWithColorAndContext(project.getPreEmitDiagnostics())).toBe("");
    const results = new ValibotTypeExtractor().extractAll(fixture);
    expect(
      results.filter((result) => result.isExported).map((result) => result.schemaName),
    ).toEqual(expected);
    project.createSourceFile(
      resolve(fixture, "../generated.ts"),
      [
        generateDeclarationFile(results, createNameMapper()),
        'import type * as v from "valibot";',
        'import type * as schemas from "./schema.js";',
        "type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;",
        "type Assert<T extends true> = T;",
        ...expected.flatMap((name) => [
          `type ${name}InputCheck = Assert<Equal<${name}Input, v.InferInput<typeof schemas.${name}>>>;`,
          `type ${name}OutputCheck = Assert<Equal<${name}Output, v.InferOutput<typeof schemas.${name}>>>;`,
        ]),
      ].join("\n"),
    );
    expect(project.formatDiagnosticsWithColorAndContext(project.getPreEmitDiagnostics())).toBe("");
  },
);
