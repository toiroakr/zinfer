/**
 * Base error class for zinfer errors.
 */
export class ZinferError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly hint?: string,
  ) {
    super(message);
    this.name = "ZinferError";
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
export class NoSchemasFoundError extends ZinferError {
  constructor(filePaths: string[], requestedSchemas?: string[]) {
    const files = filePaths.length === 1 ? filePaths[0] : `${filePaths.length} files`;

    if (requestedSchemas?.length) {
      super(
        `Requested schemas not found: ${requestedSchemas.join(", ")}`,
        "NO_SCHEMAS_FOUND",
        `These schemas were not found in ${files}. Check schema names are correct.`,
      );
    } else {
      super(
        `No Zod schemas found in ${files}`,
        "NO_SCHEMAS_FOUND",
        "Ensure schemas are exported and use Zod syntax (z.object, z.string, etc.)",
      );
    }
    this.name = "NoSchemasFoundError";
  }
}

/**
 * Error when files don't match the pattern.
 */
export class NoFilesMatchedError extends ZinferError {
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
export class InvalidOptionError extends ZinferError {
  constructor(optionName: string, reason: string, hint?: string) {
    super(`Invalid option "${optionName}": ${reason}`, "INVALID_OPTION", hint);
    this.name = "InvalidOptionError";
  }
}

/**
 * Formats any error for CLI output.
 */
export function formatError(error: unknown): string {
  if (error instanceof ZinferError) {
    return error.format();
  }

  if (error instanceof Error) {
    return `Error: ${error.message}`;
  }

  return `Error: ${String(error)}`;
}
