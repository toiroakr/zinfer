import { describe, it, expect } from "vitest";
import { NoSchemasFoundError } from "@zinfer-monorepo/core";
import { zinferErrorMessages } from "../src/core/errors.js";

describe("zinferErrorMessages", () => {
  it("wires Zod wording into NoSchemasFoundError", () => {
    const error = new NoSchemasFoundError(["/src/user.ts"], undefined, zinferErrorMessages);
    expect(error.message).toBe("No Zod schemas found in /src/user.ts");
    expect(error.hint).toContain("z.object");
  });
});
