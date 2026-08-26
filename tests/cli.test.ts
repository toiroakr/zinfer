import { describe, it, expect, afterEach } from "vitest";
import { z } from "zod";
import { execFileSync } from "child_process";
import { execPath } from "process";
import { resolve, join } from "pathe";
import {
  readFileSync,
  mkdirSync,
  mkdtempSync,
  symlinkSync,
  writeFileSync,
  rmSync,
  realpathSync,
} from "fs";
import { tmpdir } from "os";
import { runCLI } from "../src/cli-runner.js";

// zod v3's getter-based recursion infers differently than v4's (see
// extractor.test.ts's lazy-schema.ts comment), independent of anything
// zinfer does - a recursive+branded schema is only exercised end-to-end
// under v4.
const isZodV4 = typeof z.looseObject === "function";

const cliPath = resolve(import.meta.dirname, "../src/cli.ts");
// The .bin/jiti entry is a POSIX shell script (a .cmd shim on Windows) that
// execFileSync cannot run directly without a shell; run its real JS entry
// point through the Node executable instead, which works on every platform.
const jitiCliPath = resolve(import.meta.dirname, "../node_modules/jiti/lib/jiti-cli.mjs");
const packageJsonPath = resolve(import.meta.dirname, "../package.json");
// tsgo's node_modules/.bin entry is a POSIX shell script (a .cmd shim on
// Windows) that execFileSync cannot run directly without a shell; run its
// real JS entry point through the Node executable instead.
const tsgoPath = resolve(
  import.meta.dirname,
  "../node_modules/@typescript/native-preview/bin/tsgo",
);

describe("cli --version", () => {
  it("should report the version from package.json instead of a hardcoded value", () => {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf-8"));

    const output = execFileSync(execPath, [jitiCliPath, cliPath, "--version"], {
      encoding: "utf-8",
      timeout: 60_000,
    }).trim();

    expect(output).toBe(packageJson.version);
  }, 60_000);
});

describe("runCLI", () => {
  let workDir: string | undefined;
  const originalCwd = process.cwd();

  afterEach(() => {
    process.chdir(originalCwd);
    if (workDir) {
      rmSync(workDir, { recursive: true, force: true });
      workDir = undefined;
    }
  });

  it("writes generated types to outDir when called programmatically", async () => {
    workDir = mkdtempSync(join(tmpdir(), "zinfer-cli-runner-"));
    symlinkSync(
      resolve(import.meta.dirname, "../node_modules"),
      join(workDir, "node_modules"),
      "junction",
    );
    writeFileSync(
      join(workDir, "schema.ts"),
      'import { z } from "zod";\n\nexport const UserSchema = z.object({ id: z.string() });\n',
    );
    process.chdir(workDir);

    await runCLI(["schema.ts"], { outDir: workDir, suffix: "Schema" });

    const output = readFileSync(join(workDir, "schema.types.ts"), "utf-8");
    expect(output).toContain("export type UserInput");
    expect(output).toContain("id: string");
  });

  it("rebases import() paths when outDir is an absolute path through a symlinked directory", async () => {
    const realBase = mkdtempSync(join(tmpdir(), "zinfer-real-"));
    const linkPath = mkdtempSync(join(tmpdir(), "zinfer-link-"));
    rmSync(linkPath, { recursive: true, force: true });
    symlinkSync(realBase, linkPath, "junction");

    try {
      symlinkSync(
        resolve(import.meta.dirname, "../node_modules"),
        join(realBase, "node_modules"),
        "junction",
      );
      mkdirSync(join(realBase, "src/shared"), { recursive: true });
      mkdirSync(join(realBase, "src/schemas"), { recursive: true });
      writeFileSync(join(realBase, "src/shared/kind.ts"), 'export type Kind = "a" | "b" | "c";\n');
      writeFileSync(
        join(realBase, "src/shared/model.ts"),
        'import type { Kind } from "./kind";\n\nexport type Model = { kind: Kind; name: string };\n',
      );
      writeFileSync(
        join(realBase, "src/schemas/schema.ts"),
        'import { z } from "zod";\n' +
          'import type { Model } from "../shared/model";\n\n' +
          "export const ModelSchema: z.ZodType<Model> = z.object({\n" +
          '  kind: z.enum(["a", "b", "c"]),\n' +
          "  name: z.string(),\n" +
          "});\n",
      );
      process.chdir(linkPath);

      // outDir is given as an absolute path built from the symlink entry
      // point, not derived from process.cwd() (which Node always reports
      // fully resolved) - this is what a caller does when it stores a
      // directory path before any chdir happens.
      await runCLI(["src/schemas/schema.ts"], {
        outDir: join(linkPath, "out"),
        suffix: "Schema",
      });

      const output = readFileSync(join(realBase, "out/schema.types.ts"), "utf-8");
      expect(output).toContain('import("../src/shared/kind").Kind');
    } finally {
      process.chdir(originalCwd);
      rmSync(linkPath, { recursive: true, force: true });
      rmSync(realBase, { recursive: true, force: true });
    }
  });

  it("loads config from an explicit --config path, not just well-known filenames", async () => {
    workDir = mkdtempSync(join(tmpdir(), "zinfer-cli-runner-"));
    symlinkSync(
      resolve(import.meta.dirname, "../node_modules"),
      join(workDir, "node_modules"),
      "junction",
    );
    writeFileSync(
      join(workDir, "schema.ts"),
      'import { z } from "zod";\n\nexport const UserSchema = z.object({ id: z.string() });\n',
    );
    writeFileSync(
      join(workDir, "custom.config.mjs"),
      'export default { include: ["schema.ts"], suffix: "Schema" };\n',
    );
    process.chdir(workDir);

    await runCLI([], { config: "custom.config.mjs", outDir: workDir });

    const output = readFileSync(join(workDir, "schema.types.ts"), "utf-8");
    expect(output).toContain("export type UserInput");
  });

  it("excludes files matching the config's exclude patterns", async () => {
    workDir = mkdtempSync(join(tmpdir(), "zinfer-cli-runner-"));
    symlinkSync(
      resolve(import.meta.dirname, "../node_modules"),
      join(workDir, "node_modules"),
      "junction",
    );
    writeFileSync(
      join(workDir, "included.ts"),
      'import { z } from "zod";\n\nexport const IncludedSchema = z.object({ id: z.string() });\n',
    );
    writeFileSync(
      join(workDir, "excluded.ts"),
      'import { z } from "zod";\n\nexport const ExcludedSchema = z.object({ id: z.string() });\n',
    );
    process.chdir(workDir);

    await runCLI(["*.ts"], {
      outFile: join(workDir, "out.ts"),
      suffix: "Schema",
    });
    // Sanity check: without exclude, both schemas are picked up.
    const withoutExclude = readFileSync(join(workDir, "out.ts"), "utf-8");
    expect(withoutExclude).toContain("IncludedInput");
    expect(withoutExclude).toContain("ExcludedInput");

    writeFileSync(
      join(workDir, "zinfer.config.mjs"),
      'export default { include: ["*.ts"], exclude: ["excluded.ts"], suffix: "Schema" };\n',
    );

    await runCLI([], { outFile: join(workDir, "out2.ts") });

    const withExclude = readFileSync(join(workDir, "out2.ts"), "utf-8");
    expect(withExclude).toContain("IncludedInput");
    expect(withExclude).not.toContain("ExcludedInput");
  });

  it("propagates a load failure for an explicit --config path instead of silently continuing", async () => {
    workDir = mkdtempSync(join(tmpdir(), "zinfer-cli-runner-"));
    symlinkSync(
      resolve(import.meta.dirname, "../node_modules"),
      join(workDir, "node_modules"),
      "junction",
    );
    writeFileSync(join(workDir, "schema.ts"), 'import { z } from "zod";\n');
    writeFileSync(join(workDir, "bad.config.mjs"), 'throw new Error("boom");\n');
    process.chdir(workDir);

    await expect(runCLI([], { config: "bad.config.mjs", outDir: workDir })).rejects.toThrow("boom");
  });

  it("rejects --generate-tests combined with --declaration", async () => {
    workDir = mkdtempSync(join(tmpdir(), "zinfer-cli-runner-"));
    symlinkSync(
      resolve(import.meta.dirname, "../node_modules"),
      join(workDir, "node_modules"),
      "junction",
    );
    writeFileSync(
      join(workDir, "schema.ts"),
      'import { z } from "zod";\n\nexport const UserSchema = z.object({ id: z.string() });\n',
    );
    process.chdir(workDir);

    await expect(
      runCLI(["schema.ts"], { outDir: workDir, declaration: true, generateTests: true }),
    ).rejects.toThrow("--declaration");
  });

  it("generates a companion test that actually type-checks for --generate-tests with --brand-strategy local-symbol", async () => {
    // realpath'd immediately: the companion-test import path (unlike the main
    // generated types file's, which goes through relativizeImportPaths) isn't
    // normalized against the macOS /tmp -> /private/tmp symlink, so a raw
    // tmpdir() path here can produce a spurious "Cannot find module" below -
    // a pre-existing gap unrelated to brandStrategy, sidestepped rather than
    // fixed here.
    workDir = realpathSync(mkdtempSync(join(tmpdir(), "zinfer-cli-runner-")));
    symlinkSync(
      resolve(import.meta.dirname, "../node_modules"),
      join(workDir, "node_modules"),
      "junction",
    );
    // Exercises a root-level primitive brand and a whole-object brand
    // combined with a brand nested inside an array field - the shapes
    // __ZinferCanonBrand has to walk correctly. A recursive (self-referential)
    // branded schema is covered separately (zod v3's getter-based recursion
    // infers differently than v4's, independent of brandStrategy).
    writeFileSync(
      join(workDir, "schema.ts"),
      `import { z } from "zod";

export const UserIdSchema = z.string().brand<"UserId">();

export const WrapperSchema = z
  .object({ tags: z.array(z.string().brand<"Tag">()) })
  .brand<"Wrapper">();
`,
    );
    process.chdir(workDir);

    await runCLI(["schema.ts"], {
      outDir: workDir,
      generateTests: true,
      brandStrategy: "local-symbol",
    });

    const testContent = readFileSync(join(workDir, "schema.types.test.ts"), "utf-8");
    expect(testContent).toContain("__ZinferCanonBrand");
    expect(testContent).toContain("__ZinferZodBrandKey");

    execFileSync(execPath, [tsgoPath, "--noEmit", "schema.types.test.ts"], {
      cwd: workDir,
      stdio: "pipe",
      encoding: "utf-8",
    });

    // Non-vacuousness check: the canonicalizing assertion above must still
    // be capable of failing. Corrupt one brand's tag in the already-verified
    // generated output and confirm the same companion test now fails to
    // type-check - proof the comparison isn't silently accepting anything.
    const typesContent = readFileSync(join(workDir, "schema.types.ts"), "utf-8");
    writeFileSync(join(workDir, "schema.types.ts"), typesContent.replace('"UserId"', '"WrongTag"'));

    expect(() =>
      execFileSync(execPath, [tsgoPath, "--noEmit", "schema.types.test.ts"], {
        cwd: workDir,
        stdio: "pipe",
        encoding: "utf-8",
      }),
    ).toThrow();
  });

  it.skipIf(!isZodV4)(
    "type-checks a companion test for a brand nested inside a recursive (self-referential) schema",
    async () => {
      workDir = realpathSync(mkdtempSync(join(tmpdir(), "zinfer-cli-runner-")));
      symlinkSync(
        resolve(import.meta.dirname, "../node_modules"),
        join(workDir, "node_modules"),
        "junction",
      );
      writeFileSync(
        join(workDir, "schema.ts"),
        `import { z } from "zod";

export const TreeNodeSchema = z.object({
  value: z.string().brand<"NodeId">(),
  get children() {
    return z.array(TreeNodeSchema).optional();
  },
});
`,
      );
      process.chdir(workDir);

      await runCLI(["schema.ts"], {
        outDir: workDir,
        generateTests: true,
        brandStrategy: "local-symbol",
      });

      execFileSync(execPath, [tsgoPath, "--noEmit", "schema.types.test.ts"], {
        cwd: workDir,
        stdio: "pipe",
        encoding: "utf-8",
      });
    },
  );

  it("type-checks a companion test combining two branded source files via --outFile local-symbol", async () => {
    // Two source files' branded schemas land in one combined types file, so
    // the companion test imports __brand from that one module twice, each
    // under a different file-scoped alias - confirm that compiles.
    workDir = realpathSync(mkdtempSync(join(tmpdir(), "zinfer-cli-runner-")));
    symlinkSync(
      resolve(import.meta.dirname, "../node_modules"),
      join(workDir, "node_modules"),
      "junction",
    );
    writeFileSync(
      join(workDir, "a.ts"),
      'import { z } from "zod";\n\nexport const AIdSchema = z.string().brand<"AId">();\n',
    );
    writeFileSync(
      join(workDir, "b.ts"),
      'import { z } from "zod";\n\nexport const BIdSchema = z.string().brand<"BId">();\n',
    );
    process.chdir(workDir);

    await runCLI(["a.ts", "b.ts"], {
      outFile: join(workDir, "all.ts"),
      generateTests: true,
      brandStrategy: "local-symbol",
    });

    execFileSync(execPath, [tsgoPath, "--noEmit", "all.test.ts"], {
      cwd: workDir,
      stdio: "pipe",
      encoding: "utf-8",
    });
  });

  it("rejects a brandStrategy value that isn't zod-import or local-symbol (e.g. set via a config file)", async () => {
    workDir = mkdtempSync(join(tmpdir(), "zinfer-cli-runner-"));
    symlinkSync(
      resolve(import.meta.dirname, "../node_modules"),
      join(workDir, "node_modules"),
      "junction",
    );
    writeFileSync(
      join(workDir, "schema.ts"),
      'import { z } from "zod";\n\nexport const UserSchema = z.object({ id: z.string() });\n',
    );
    writeFileSync(
      join(workDir, "zinfer.config.mjs"),
      'export default { include: ["schema.ts"], outDir: ".", brandStrategy: "loclasymbol" };\n',
    );
    process.chdir(workDir);

    await expect(runCLI([], {})).rejects.toThrow("--brand-strategy");
  });

  it("emits a self-contained unique symbol marker instead of importing zod when --brand-strategy local-symbol is set", async () => {
    workDir = mkdtempSync(join(tmpdir(), "zinfer-cli-runner-"));
    symlinkSync(
      resolve(import.meta.dirname, "../node_modules"),
      join(workDir, "node_modules"),
      "junction",
    );
    writeFileSync(
      join(workDir, "schema.ts"),
      'import { z } from "zod";\n\nexport const UserIdSchema = z.string().brand<"UserId">();\n',
    );
    process.chdir(workDir);

    await runCLI(["schema.ts"], {
      outDir: workDir,
      suffix: "Schema",
      brandStrategy: "local-symbol",
    });

    const output = readFileSync(join(workDir, "schema.types.ts"), "utf-8");
    expect(output).not.toContain("zod");
    expect(output).toContain("export declare const __brand: unique symbol;");
    expect(output).toContain('string & { readonly [__brand]: "UserId" }');
  });

  it("honors brandStrategy set via a config file", async () => {
    workDir = mkdtempSync(join(tmpdir(), "zinfer-cli-runner-"));
    symlinkSync(
      resolve(import.meta.dirname, "../node_modules"),
      join(workDir, "node_modules"),
      "junction",
    );
    writeFileSync(
      join(workDir, "schema.ts"),
      'import { z } from "zod";\n\nexport const UserIdSchema = z.string().brand<"UserId">();\n',
    );
    writeFileSync(
      join(workDir, "zinfer.config.mjs"),
      'export default { include: ["schema.ts"], outDir: ".", brandStrategy: "local-symbol" };\n',
    );
    process.chdir(workDir);

    await runCLI([], {});

    const output = readFileSync(join(workDir, "schema.types.ts"), "utf-8");
    expect(output).not.toContain("zod");
    expect(output).toContain("export declare const __brand: unique symbol;");
  });

  /**
   * Writes a schema whose type annotation references a type declared in a
   * *different* directory than the schema itself. TypeScript's type printer
   * keeps that reference as `import("../shared/kind").Kind` - a specifier
   * relative to the schema file, which does not resolve from the output
   * directory unless zinfer rebases it.
   */
  function writeCrossDirectorySchema(dir: string): void {
    mkdirSync(join(dir, "src/shared"), { recursive: true });
    mkdirSync(join(dir, "src/schemas"), { recursive: true });
    writeFileSync(join(dir, "src/shared/kind.ts"), 'export type Kind = "a" | "b" | "c";\n');
    writeFileSync(
      join(dir, "src/shared/model.ts"),
      'import type { Kind } from "./kind";\n\nexport type Model = { kind: Kind; name: string };\n',
    );
    writeFileSync(
      join(dir, "src/schemas/schema.ts"),
      'import { z } from "zod";\n' +
        'import type { Model } from "../shared/model";\n\n' +
        "export const ModelSchema: z.ZodType<Model> = z.object({\n" +
        '  kind: z.enum(["a", "b", "c"]),\n' +
        "  name: z.string(),\n" +
        "});\n",
    );
  }

  it("rebases source-relative import() paths onto the output directory (outDir)", async () => {
    workDir = mkdtempSync(join(tmpdir(), "zinfer-cli-runner-"));
    symlinkSync(
      resolve(import.meta.dirname, "../node_modules"),
      join(workDir, "node_modules"),
      "junction",
    );
    writeCrossDirectorySchema(workDir);
    process.chdir(workDir);

    await runCLI(["src/schemas/schema.ts"], { outDir: join(workDir, "out"), suffix: "Schema" });

    const output = readFileSync(join(workDir, "out/schema.types.ts"), "utf-8");
    // "../shared/kind" resolves from src/schemas/, not from out/.
    expect(output).not.toContain('import("../shared/kind")');
    expect(output).toContain('import("../src/shared/kind").Kind');
  });

  it("rebases source-relative import() paths onto the output file (outFile)", async () => {
    workDir = mkdtempSync(join(tmpdir(), "zinfer-cli-runner-"));
    symlinkSync(
      resolve(import.meta.dirname, "../node_modules"),
      join(workDir, "node_modules"),
      "junction",
    );
    writeCrossDirectorySchema(workDir);
    process.chdir(workDir);

    await runCLI(["src/schemas/schema.ts"], {
      outFile: join(workDir, "out/types.generated.ts"),
      suffix: "Schema",
    });

    const output = readFileSync(join(workDir, "out/types.generated.ts"), "utf-8");
    expect(output).not.toContain('import("../shared/kind")');
    expect(output).toContain('import("../src/shared/kind").Kind');
  });

  describe("recursive schemas across output files", () => {
    /**
     * Copies the cross-file recursive fixtures into the work directory, each in
     * its own subdirectory so the generated names come from `[dir]`.
     */
    function copyCrossFileFixtures(dir: string) {
      const source = resolve(import.meta.dirname, "fixtures/cross-file-recursive");
      mkdirSync(join(dir, "schemas/node"), { recursive: true });
      mkdirSync(join(dir, "schemas/tree"), { recursive: true });
      writeFileSync(
        join(dir, "schemas/node/schema.ts"),
        readFileSync(join(source, "node-schema.ts"), "utf-8"),
      );
      writeFileSync(
        join(dir, "schemas/tree/schema.ts"),
        readFileSync(join(source, "tree-schema.ts"), "utf-8").replace(
          './node-schema"',
          '../node/schema"',
        ),
      );
    }

    /**
     * Creates a work directory with the fixtures in place, and enters it.
     */
    function setUpCrossFileWorkDir(): string {
      const dir = mkdtempSync(join(tmpdir(), "zinfer-cli-runner-"));
      symlinkSync(
        resolve(import.meta.dirname, "../node_modules"),
        join(dir, "node_modules"),
        "junction",
      );
      copyCrossFileFixtures(dir);
      process.chdir(dir);
      return dir;
    }

    it("imports a recursive schema from the file that generates it", async () => {
      workDir = setUpCrossFileWorkDir();

      await runCLI(["schemas/**/schema.ts"], {
        outDir: "types",
        outPattern: "[dir].generated[ext]",
        suffix: "Schema",
        outputSuffix: "",
        mergeSame: true,
        withDescriptions: true,
      });

      const node = readFileSync(join(workDir, "types/node.generated.ts"), "utf-8");
      // The recursion points straight at the type, with no inlined copy in
      // between - and every level keeps its description.
      expect(node).toContain(
        [
          "export type CrossFileNode = {",
          "  /** The node name */",
          "  name: string;",
          "  children: {",
          "    [x: string]: CrossFileNode;",
          "  };",
          "};",
        ].join("\n"),
      );
      expect(node).toContain("export type CrossFileNodeInput = CrossFileNode;");

      const tree = readFileSync(join(workDir, "types/tree.generated.ts"), "utf-8");
      expect(tree).toContain('import type { CrossFileNode } from "./node.generated";');
      expect(tree).toContain(
        [
          "export type CrossFileTree = {",
          "  /** Root node */",
          "  root: CrossFileNode;",
          "  index: {",
          "    [x: string]: CrossFileNode;",
          "  };",
          "};",
        ].join("\n"),
      );
      expect(tree).not.toContain("any");
    });

    it("declares both directions when a recursive schema's input and output differ", async () => {
      workDir = setUpCrossFileWorkDir();

      await runCLI(["schemas/**/schema.ts"], {
        outDir: "types",
        outPattern: "[dir].generated[ext]",
        suffix: "Schema",
      });

      const tree = readFileSync(join(workDir, "types/tree.generated.ts"), "utf-8");
      expect(tree).toContain(
        'import type { CrossFileNodeInput, CrossFileNodeOutput } from "./node.generated";',
      );
      expect(tree).toContain("root: CrossFileNodeInput;");
      expect(tree).toContain("root: CrossFileNodeOutput;");
    });

    it("inlines instead of importing when two inputs share one output path", async () => {
      workDir = setUpCrossFileWorkDir();
      // Both schema files now land in the same directory, so `[dir]` maps them
      // onto one output path and the second write replaces the first. A
      // declaration that may not survive must not be referenced by name.
      mkdirSync(join(workDir, "flat"), { recursive: true });
      writeFileSync(
        join(workDir, "flat/node.ts"),
        readFileSync(join(workDir, "schemas/node/schema.ts"), "utf-8"),
      );
      writeFileSync(
        join(workDir, "flat/tree.ts"),
        readFileSync(join(workDir, "schemas/tree/schema.ts"), "utf-8").replace(
          '../node/schema"',
          './node"',
        ),
      );

      await runCLI(["flat/*.ts"], {
        outDir: "types",
        outPattern: "[dir].generated[ext]",
        suffix: "Schema",
      });

      const generated = readFileSync(join(workDir, "types/flat.generated.ts"), "utf-8");
      expect(generated).not.toContain("import type {");
      // The recursion point still keeps the shape the getter describes.
      expect(generated).toContain("[x: string]: any;");
    });

    it("keeps a single output file self-contained, with no import to itself", async () => {
      workDir = setUpCrossFileWorkDir();

      await runCLI(["schemas/**/schema.ts"], { outFile: "types/all.ts", suffix: "Schema" });

      const generated = readFileSync(join(workDir, "types/all.ts"), "utf-8");
      expect(generated).not.toContain("import type {");
      expect(generated).toContain("export type CrossFileNodeInput = {");
      expect(generated).toContain("root: CrossFileNodeInput;");
    });

    it("still declares a schema another file imports when mergeSame collapses it", async () => {
      workDir = setUpCrossFileWorkDir();

      await runCLI(["schemas/**/schema.ts"], {
        outFile: "types/all.ts",
        suffix: "Schema",
        outputSuffix: "",
        mergeSame: true,
      });

      const generated = readFileSync(join(workDir, "types/all.ts"), "utf-8");
      // The schema appears twice in the results - once declared here, once as
      // the copy the importing file carries - and the declaration must survive.
      expect(generated).toContain("export type CrossFileNode = {");
      expect(generated).toContain("export type CrossFileNodeInput = CrossFileNode;");
      expect(generated).toContain("root: CrossFileNode;");
    });

    it("keeps referencing by name when --schemas includes the referenced schema", async () => {
      workDir = setUpCrossFileWorkDir();

      // A `--schemas` filter must not disable cross-file referencing outright
      // - only for a schema it excludes, whose own declaration wouldn't be
      // generated either. Both schemas here are included, so referencing must
      // work exactly as without the filter.
      await runCLI(["schemas/**/schema.ts"], {
        outDir: "types",
        outPattern: "[dir].generated[ext]",
        suffix: "Schema",
        schemas: "CrossFileNodeSchema,CrossFileTreeSchema",
      });

      const tree = readFileSync(join(workDir, "types/tree.generated.ts"), "utf-8");
      expect(tree).toContain("import type { CrossFileNodeInput, CrossFileNodeOutput }");
      expect(tree).toContain("root: CrossFileNodeInput;");
      expect(tree).not.toContain("any");
    });

    it("references an aliased cross-file import by the declaring file's own export name", async () => {
      workDir = setUpCrossFileWorkDir();
      // Re-import the same recursive schema under a local alias - the
      // declaring file has no generated type named after that alias, only
      // after its own export, which is what referencing it must use instead.
      writeFileSync(
        join(workDir, "schemas/tree/schema.ts"),
        readFileSync(
          resolve(import.meta.dirname, "fixtures/cross-file-recursive/aliased-tree-schema.ts"),
          "utf-8",
        ).replace('./node-schema"', '../node/schema"'),
      );

      await runCLI(["schemas/**/schema.ts"], {
        outDir: "types",
        outPattern: "[dir].generated[ext]",
        suffix: "Schema",
      });

      const tree = readFileSync(join(workDir, "types/tree.generated.ts"), "utf-8");
      expect(tree).toContain(
        'import type { CrossFileNodeInput, CrossFileNodeOutput } from "./node.generated";',
      );
      expect(tree).toContain("root: CrossFileNodeInput;");
      expect(tree).toContain("list: CrossFileNodeInput[];");
      expect(tree).not.toContain("RenamedNodeSchema");
      expect(tree).not.toContain("any");
    });
  });

  describe("--outFile with a schema one file declares and another imports", () => {
    /**
     * Writes a schema file and a second file importing it, and enters the work
     * directory. The imported schema shows up twice in a single output file's
     * results: once as its own declaration, once as the importing file's copy.
     * The declaring file is named so that it is processed first, putting its
     * own (exported) entry ahead of the importing file's copy.
     */
    function setUpSharedSchemaWorkDir(): string {
      const dir = mkdtempSync(join(tmpdir(), "zinfer-cli-runner-"));
      symlinkSync(
        resolve(import.meta.dirname, "../node_modules"),
        join(dir, "node_modules"),
        "junction",
      );
      mkdirSync(join(dir, "schemas"), { recursive: true });
      writeFileSync(
        join(dir, "schemas/a-leaf.ts"),
        'import { z } from "zod";\n\nexport const LeafSchema = z.object({ id: z.string() });\n',
      );
      writeFileSync(
        join(dir, "schemas/b-branch.ts"),
        'import { z } from "zod";\nimport { LeafSchema } from "./a-leaf";\n\n' +
          "export const BranchSchema = z.object({ leaf: LeafSchema });\n",
      );
      process.chdir(dir);
      return dir;
    }

    it("keeps the declaration with mergeSame enabled", async () => {
      workDir = setUpSharedSchemaWorkDir();

      await runCLI(["schemas/*.ts"], {
        outFile: "types/all.ts",
        suffix: "Schema",
        outputSuffix: "",
        mergeSame: true,
      });

      const generated = readFileSync(join(workDir, "types/all.ts"), "utf-8");
      expect(generated).toContain("export type Leaf = {");
      expect(generated).toContain("export type LeafInput = Leaf;");
    });

    it("keeps the declaration with mergeSame disabled", async () => {
      workDir = setUpSharedSchemaWorkDir();

      await runCLI(["schemas/*.ts"], { outFile: "types/all.ts", suffix: "Schema" });

      const generated = readFileSync(join(workDir, "types/all.ts"), "utf-8");
      expect(generated).toContain("export type LeafInput = {");
      expect(generated).toContain("export type LeafOutput = {");
    });
  });

  it("does not write a companion test file when a schema file has no exported schemas", async () => {
    workDir = mkdtempSync(join(tmpdir(), "zinfer-cli-runner-"));
    symlinkSync(
      resolve(import.meta.dirname, "../node_modules"),
      join(workDir, "node_modules"),
      "junction",
    );
    writeFileSync(
      join(workDir, "schema.ts"),
      'import { z } from "zod";\n\nconst InternalSchema = z.object({ id: z.string() });\n',
    );
    process.chdir(workDir);

    await runCLI(["schema.ts"], { outDir: workDir, suffix: "Schema", generateTests: true });

    expect(() => readFileSync(join(workDir, "schema.test.ts"), "utf-8")).toThrow();
  });
});
