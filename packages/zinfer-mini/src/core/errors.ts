import { formatError as sharedFormatError, type ErrorMessages } from "@zinfer-monorepo/core";

export { InvalidOptionError } from "@zinfer-monorepo/core";

export const zinferMiniErrorMessages: ErrorMessages = {
  toolName: "zinfer-mini",
  schemaLibraryName: "zod/mini",
  schemaSyntaxExample: "z.object, z.string, etc.",
};

/**
 * Formats any error for CLI output.
 */
export function formatError(error: unknown): string {
  return sharedFormatError(error, zinferMiniErrorMessages);
}
