import { type ErrorMessages } from "@zinfer-monorepo/core";

export { InvalidOptionError, formatError } from "@zinfer-monorepo/core";

export const zinferMiniErrorMessages: ErrorMessages = {
  toolName: "zinfer-mini",
  schemaLibraryName: "zod/mini",
  schemaSyntaxExample: "z.object, z.string, etc.",
};
