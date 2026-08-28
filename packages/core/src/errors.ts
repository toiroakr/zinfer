/**
 * Base error class for the shared core's errors.
 */
export class InferError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly hint?: string,
  ) {
    super(message);
    this.name = "InferError";
  }

  /**
   * Formats the error for display.
   */
  format(): string {
    const lines = [`Error: ${this.message}`];
    if (this.hint) {
      lines.push(`Hint: ${this.hint}`);
    }
    return lines.join("\n");
  }
}

/**
 * Error when no schemas are found in files.
 */
export class NoSchemasFoundError extends InferError {
  constructor(
    filePaths: string[],
    requestedSchemas: string[] | undefined,
    messages: ErrorMessages,
  ) {
    const files = filePaths.length === 1 ? filePaths[0] : `${filePaths.length} files`;

    if (requestedSchemas?.length) {
      super(
        `Requested schemas not found: ${requestedSchemas.join(", ")}`,
        "NO_SCHEMAS_FOUND",
        `These schemas were not found in ${files}. Check schema names are correct.`,
      );
    } else {
      super(
        `No ${messages.schemaLibraryName} schemas found in ${files}`,
        "NO_SCHEMAS_FOUND",
        `Ensure schemas are exported and use ${messages.schemaLibraryName} syntax (${messages.schemaSyntaxExample})`,
      );
    }
    this.name = "NoSchemasFoundError";
  }
}

/**
 * Error when files don't match the pattern.
 */
export class NoFilesMatchedError extends InferError {
  constructor(patterns: string[]) {
    super(
      `No files matched the pattern(s): ${patterns.join(", ")}`,
      "NO_FILES_MATCHED",
      "Check that the file paths or glob patterns are correct",
    );
    this.name = "NoFilesMatchedError";
  }
}

/**
 * Error when CLI options are invalid.
 */
export class InvalidOptionError extends InferError {
  constructor(optionName: string, reason: string, hint?: string) {
    super(`Invalid option "${optionName}": ${reason}`, "INVALID_OPTION", hint);
    this.name = "InvalidOptionError";
  }
}

/**
 * Tool identity and schema-library wording plugged into error messages, so
 * the shared error classes and `formatError` read as "zinfer"/"Zod" or
 * "vinfer"/"Valibot" without hardcoding either.
 */
export interface ErrorMessages {
  /** CLI/tool name, e.g. "zinfer" or "vinfer" */
  toolName: string;
  /** Schema library display name, e.g. "Zod" or "Valibot" */
  schemaLibraryName: string;
  /** Example schema-builder syntax, e.g. "z.object, z.string, etc." */
  schemaSyntaxExample: string;
}

/**
 * Formats any error for CLI output.
 */
export function formatError(error: unknown, messages: ErrorMessages): string {
  if (error instanceof InferError) {
    return error.format();
  }

  if (error instanceof Error) {
    // Clean up common ts-morph errors
    const message = error.message;

    if (message.includes("Manipulation error")) {
      return formatTsMorphError(message, messages);
    }

    return `Error: ${message}`;
  }

  return `Error: ${String(error)}`;
}

/**
 * Formats ts-morph manipulation errors.
 */
function formatTsMorphError(message: string, messages: ErrorMessages): string {
  const lines: string[] = [];

  // Extract the first line (main error)
  const firstLine = message.split("\n")[0];
  if (firstLine.includes("syntax error")) {
    lines.push("Error: Syntax error in source file");
  } else {
    lines.push("Error: Failed to process TypeScript file");
  }

  // Extract TypeScript error codes (TS1005, etc.)
  const tsErrors = message.match(/TS\d+/g);
  if (tsErrors?.length) {
    lines.push("");
    lines.push("TypeScript reported errors in the file.");
    lines.push(`Please fix any syntax errors before running ${messages.toolName}.`);
  }

  return lines.join("\n");
}
