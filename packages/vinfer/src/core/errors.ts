import { formatError as sharedFormatError, type ErrorMessages } from "@zinfer-monorepo/core";

export const vinferErrorMessages: ErrorMessages = {
  toolName: "vinfer",
  schemaLibraryName: "Valibot",
  schemaSyntaxExample: "v.object, v.string, etc.",
};

/**
 * Formats any error for CLI output.
 */
export function formatError(error: unknown): string {
  return sharedFormatError(error, vinferErrorMessages);
}
