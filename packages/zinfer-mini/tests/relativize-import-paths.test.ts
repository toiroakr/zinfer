import { describe, it, expect } from "vitest";
import { relativizeImportPaths } from "../src/core/type-printer.js";

describe("relativizeImportPaths", () => {
  it("should convert absolute import paths to relative paths", () => {
    const content = `export type Foo = import("/Users/dev/project/src/types/bar").Bar;`;
    const outputPath = "/Users/dev/project/src/types/foo.generated.ts";

    const result = relativizeImportPaths(content, outputPath);

    expect(result).toBe(`export type Foo = import("./bar").Bar;`);
  });

  it("should return content unchanged when no import() paths exist", () => {
    const content = `export type Foo = { bar: string };`;
    const outputPath = "/Users/dev/project/src/types/foo.generated.ts";

    const result = relativizeImportPaths(content, outputPath);

    expect(result).toBe(content);
  });

  it("should collapse a qualified reference to this very output file into a bare one (#519)", () => {
    // TypeScript's printer can synthesize import("<this file>").Sibling for a
    // type that will end up declared in this very output file - e.g. a
    // recursive schema typed against a type imported from the tool's own
    // prior output, whose fields name sibling schemas the same run also
    // declares here. The qualifier is pointless once resolved: there is
    // nothing to import from a file that will declare the name itself.
    const content = `export type Foo = { sibling: import("/Users/dev/project/src/types/foo.generated").Sibling };`;
    const outputPath = "/Users/dev/project/src/types/foo.generated.ts";

    const result = relativizeImportPaths(content, outputPath);

    expect(result).toBe(`export type Foo = { sibling: Sibling };`);
  });

  it("does not collapse a self-referencing import() that is not a qualified access (Copilot review on #524)", () => {
    // A bare `import("...")` with nothing after it (e.g. `typeof import("...")`)
    // denotes the whole module's namespace type, not a named member - dropping
    // it the same way a qualified `import("...").Sibling` is dropped would
    // leave a dangling `typeof ` with no operand, which is invalid TypeScript.
    const content = `export type Foo = { self: typeof import("/Users/dev/project/src/types/foo.generated") };`;
    const outputPath = "/Users/dev/project/src/types/foo.generated.ts";

    const result = relativizeImportPaths(content, outputPath);

    expect(result).toBe(`export type Foo = { self: typeof import("./foo.generated") };`);
  });
});
