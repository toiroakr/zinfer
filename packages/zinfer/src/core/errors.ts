import { type ErrorMessages } from "@zinfer-monorepo/core";

export { InvalidOptionError, formatError } from "@zinfer-monorepo/core";

export const zinferErrorMessages: ErrorMessages = {
  toolName: "zinfer",
  schemaLibraryName: "Zod",
  schemaSyntaxExample: "z.object, z.string, etc.",
};
