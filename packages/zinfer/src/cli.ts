#!/usr/bin/env node
import { Command, Option } from "commander";
import { resolve, dirname } from "pathe";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";
import { formatError, disambiguateOptionalValueFlag } from "./core/index.js";
import { runCLI, type CLIOptions } from "./cli-runner.js";

function readPackageVersion(): string {
  try {
    const packageJsonPath = resolve(dirname(fileURLToPath(import.meta.url)), "..", "package.json");
    return JSON.parse(readFileSync(packageJsonPath, "utf-8")).version ?? "0.0.0";
  } catch {
    return "0.0.0";
  }
}

const program = new Command();

program
  .name("zinfer")
  .description("Extract input/output types from Zod schemas")
  .version(readPackageVersion());

program
  .argument("[files...]", "File paths or glob patterns")
  .option("-c, --config <path>", "Path to config file")
  .option("-p, --project <path>", "Path to tsconfig.json")
  .option("--schemas <names>", "Comma-separated schema names to extract")
  .option("--input-only", "Output only input types")
  .option("--output-only", "Output only output types")
  .option("--merge-same", "Single type if input===output")
  .option("--suffix <suffix>", "Remove suffix from schema names (e.g., 'Schema')")
  .option("--input-suffix <suffix>", "Suffix for input type names (default: 'Input')")
  .option("--output-suffix <suffix>", "Suffix for output type names (default: 'Output')")
  .option("--map <mappings>", "Custom name mappings (e.g., 'UserSchema:User')")
  .option("--outDir <dir>", "Output directory for generated files")
  .option("--outFile <file>", "Single output file for all types")
  .option("--outPattern <pattern>", "Output file naming pattern (e.g., '[name].types.ts')")
  .option("-d, --declaration", "Generate .d.ts files")
  .option("--dry-run", "Preview without writing files")
  .option("--with-descriptions", "Include Zod .describe() as TSDoc comments")
  .option("--generate-tests", "Generate vitest type equality tests alongside type files")
  .addOption(
    new Option(
      "--inline-type-references [scope]",
      'Inline a plain type an explicit z.ZodType<T> annotation reaches, instead of referencing it: "project" (default when the flag is set) follows a reference within this project, "all" also follows one into a dependency package',
    ).choices(["project", "all"]),
  )
  .addOption(
    new Option(
      "--brand-strategy <strategy>",
      "How to represent a .brand() marker in the generated output (default: zod-import)",
    ).choices(["zod-import", "local-symbol"]),
  )
  .option("-v, --verbose", "Enable verbose output")
  .action(async (files: string[], options: CLIOptions) => {
    try {
      await runCLI(files, options);
    } catch (error) {
      console.error(formatError(error));
      process.exit(1);
    }
  });

// A bare `--inline-type-references` before a positional file argument
// (e.g. `zinfer --inline-type-references schema.ts`) would otherwise have
// commander consume `schema.ts` as the flag's optional value instead of
// treating it as an input file - see disambiguateOptionalValueFlag's doc.
program.parse(
  disambiguateOptionalValueFlag(process.argv, "--inline-type-references", ["project", "all"]),
);
