import { describe, it, expect } from "vitest";
import { NoSchemasFoundError } from "@zinfer-monorepo/core";
import { vinferErrorMessages } from "../src/core/errors.js";

describe("vinferErrorMessages", () => {
  it("wires Valibot wording into NoSchemasFoundError", () => {
    const error = new NoSchemasFoundError(["/src/user.ts"], undefined, vinferErrorMessages);
    expect(error.message).toBe("No Valibot schemas found in /src/user.ts");
    expect(error.hint).toContain("v.object");
  });
});
