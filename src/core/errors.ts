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
 * Error when a schema is not found in a file.
 */
export class SchemaNotFoundError extends ZinferError {
  constructor(schemaName: string, filePath: string, availableSchemas?: string[]) {
    const hint = availableSchemas?.length
      ? `Available schemas: ${availableSchemas.join(", ")}`
      : "Make sure the schema is exported and uses Zod (z.object, z.string, etc.)";

    super(`Schema "${schemaName}" not found in ${filePath}`, "SCHEMA_NOT_FOUND", hint);
    this.name = "SchemaNotFoundError";
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
 * Error when TypeScript compilation fails.
 */
export class TypeScriptError extends ZinferError {
  constructor(
    message: string,
    public readonly filePath?: string,
    public readonly diagnostics?: string[],
  ) {
    super(message, "TYPESCRIPT_ERROR", "Fix the TypeScript errors in your source file");
    this.name = "TypeScriptError";
  }

  format(): string {
    const lines = [`Error: ${this.message}`];
    if (this.filePath) {
      lines.push(`File: ${this.filePath}`);
    }
    if (this.diagnostics?.length) {
      lines.push("");
      lines.push("TypeScript Errors:");
      for (const diag of this.diagnostics.slice(0, 5)) {
        lines.push(`  ${diag}`);
      }
      if (this.diagnostics.length > 5) {
        lines.push(`  ... and ${this.diagnostics.length - 5} more errors`);
      }
    }
    if (this.hint) {
      lines.push("");
      lines.push(`Hint: ${this.hint}`);
    }
    return lines.join("\n");
  }
}

/**
 * Error when type extraction fails.
 */
export class ExtractionError extends ZinferError {
  constructor(schemaName: string, filePath: string, originalError?: Error) {
    const originalMessage = originalError?.message || "Unknown error";
    super(
      `Failed to extract types from "${schemaName}" in ${filePath}: ${originalMessage}`,
      "EXTRACTION_ERROR",
      "This may be due to syntax errors or unsupported schema patterns",
    );
    this.name = "ExtractionError";
  }
}

/**
 * Error when a type alias cannot be resolved.
 */
export class TypeResolutionError extends ZinferError {
  constructor(typeName: string, context?: string) {
    const message = context
      ? `Failed to resolve type "${typeName}" in ${context}`
      : `Failed to resolve type "${typeName}"`;
    super(
      message,
      "TYPE_RESOLUTION_ERROR",
      "This may indicate an internal error or unsupported type pattern",
    );
    this.name = "TypeResolutionError";
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
    // Clean up common ts-morph errors
    const message = error.message;

    if (message.includes("Manipulation error")) {
      return formatTsMorphError(message);
    }

    return `Error: ${message}`;
  }

  return `Error: ${String(error)}`;
}

/**
 * Formats ts-morph manipulation errors.
 */
function formatTsMorphError(message: string): string {
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
    lines.push("Please fix any syntax errors before running zinfer.");
  }

  return lines.join("\n");
}
