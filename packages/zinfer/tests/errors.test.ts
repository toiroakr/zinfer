import { describe, it, expect } from "vitest";
import { NoSchemasFoundError, formatError as sharedFormatError } from "@zinfer-monorepo/core";
import { zinferErrorMessages, formatError } from "../src/core/errors.js";

describe("zinferErrorMessages", () => {
  it("wires Zod wording into NoSchemasFoundError", () => {
    const error = new NoSchemasFoundError(["/src/user.ts"], undefined, zinferErrorMessages);
    expect(error.message).toBe("No Zod schemas found in /src/user.ts");
    expect(error.hint).toContain("z.object");
  });

  it("wires the zinfer tool name into formatError's ts-morph summary", () => {
    const output = formatError(new Error("Manipulation error: syntax error\nTS1005: expected"));
    expect(output).toContain("Please fix any syntax errors before running zinfer.");
  });

  it("matches sharedFormatError bound to the same messages", () => {
    const error = new Error("boom");
    expect(formatError(error)).toBe(sharedFormatError(error, zinferErrorMessages));
  });
});
