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
});
