import { describe, it, expect } from "vitest";
import { NoSchemasFoundError, formatError as sharedFormatError } from "@zinfer-monorepo/core";
import { vinferErrorMessages, formatError } from "../src/core/errors.js";

describe("vinferErrorMessages", () => {
  it("wires Valibot wording into NoSchemasFoundError", () => {
    const error = new NoSchemasFoundError(["/src/user.ts"], undefined, vinferErrorMessages);
    expect(error.message).toBe("No Valibot schemas found in /src/user.ts");
    expect(error.hint).toContain("v.object");
  });

  it("wires the vinfer tool name into formatError's ts-morph summary", () => {
    const output = formatError(new Error("Manipulation error: syntax error\nTS1005: expected"));
    expect(output).toContain("Please fix any syntax errors before running vinfer.");
  });

  it("matches sharedFormatError bound to the same messages", () => {
    const error = new Error("boom");
    expect(formatError(error)).toBe(sharedFormatError(error, vinferErrorMessages));
  });
});
