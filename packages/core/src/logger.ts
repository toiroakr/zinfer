/**
 * Simple logger with verbose mode support.
 */

let verboseEnabled = false;

/**
 * Enables or disables verbose logging.
 */
export function setVerbose(enabled: boolean): void {
  verboseEnabled = enabled;
}

/**
 * Logs a verbose message (only when verbose mode is enabled).
 */
export function logVerbose(message: string, ...args: unknown[]): void {
  if (verboseEnabled) {
    console.log(`[verbose] ${message}`, ...args);
  }
}

/**
 * Safely extracts a message from a caught value of unknown shape.
 * `throw` can raise anything (a string, null, a plain object, ...), not just
 * an `Error`, so callers must not assume `.message` exists.
 */
export function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Logs a debug message about a non-critical error (only when verbose mode is enabled).
 */
export function logDebugError(context: string, error: unknown): void {
  if (verboseEnabled) {
    console.log(`[verbose] ${context}: ${getErrorMessage(error)}`);
  }
}

/**
 * Logs progress information (only when verbose mode is enabled).
 */
export function logProgress(current: number, total: number, message: string): void {
  if (verboseEnabled) {
    console.log(`[${current}/${total}] ${message}`);
  }
}
