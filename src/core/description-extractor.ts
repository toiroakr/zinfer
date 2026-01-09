import { pathToFileURL } from "url";
import { resolve } from "pathe";
import type { FieldDescription } from "./types.js";

/**
 * Schema description information.
 */
export interface SchemaDescription {
  /** Schema name */
  schemaName: string;
  /** Schema-level description if present */
  description?: string;
  /** Field descriptions */
  fields: FieldDescription[];
}

/**
 * Extracts descriptions from Zod schemas by dynamically importing the module.
 */
export class DescriptionExtractor {
  /**
   * Extracts descriptions from schemas in a file.
   *
   * @param filePath - Path to the TypeScript/JavaScript file
   * @param schemaNames - Names of schemas to extract descriptions from
   * @returns Map of schema name to description info
   */
  async extractDescriptions(
    filePath: string,
    schemaNames: string[],
  ): Promise<Map<string, SchemaDescription>> {
    const result = new Map<string, SchemaDescription>();

    try {
      // Convert to absolute path and file URL for dynamic import
      const absolutePath = resolve(filePath);
      const fileUrl = pathToFileURL(absolutePath).href;

      // Dynamically import the module
      const module = await import(fileUrl);

      for (const schemaName of schemaNames) {
        const schema = module[schemaName];
        if (!schema) {
          continue;
        }

        const descriptions = this.extractFromSchema(schema, schemaName);
        result.set(schemaName, descriptions);
      }
    } catch (error) {
      // If import fails, return empty descriptions (non-blocking)
      console.warn(
        `Warning: Could not import ${filePath} for description extraction:`,
        (error as Error).message,
      );
    }

    return result;
  }

  /**
   * Extracts descriptions from a Zod schema.
   */
  private extractFromSchema(schema: unknown, schemaName: string): SchemaDescription {
    const fields: FieldDescription[] = [];

    // Get schema-level description
    const schemaDesc = this.getDescription(schema);

    // Extract field descriptions recursively
    this.extractFieldDescriptions(schema, "", fields);

    return {
      schemaName,
      description: schemaDesc,
      fields,
    };
  }

  /**
   * Recursively extracts field descriptions from a Zod schema.
   */
  private extractFieldDescriptions(
    schema: unknown,
    prefix: string,
    fields: FieldDescription[],
  ): void {
    if (!schema || typeof schema !== "object") {
      return;
    }

    // Handle ZodObject - extract from shape
    if (this.isZodObject(schema)) {
      const shape = this.getShape(schema);
      if (shape && typeof shape === "object") {
        for (const [key, fieldSchema] of Object.entries(shape)) {
          const path = prefix ? `${prefix}.${key}` : key;

          // Get description for this field
          const desc = this.getDescription(fieldSchema);
          if (desc) {
            fields.push({ path, description: desc });
          }

          // Recurse into nested schemas
          const innerSchema = this.unwrapSchema(fieldSchema);
          if (this.isZodObject(innerSchema)) {
            this.extractFieldDescriptions(innerSchema, path, fields);
          }
        }
      }
    }
  }

  /**
   * Gets the description from a Zod schema.
   * Supports both Zod v3 (_def.description) and Zod v4 (meta().description).
   */
  private getDescription(schema: unknown): string | undefined {
    if (!schema || typeof schema !== "object") {
      return undefined;
    }

    const zodSchema = schema as Record<string, unknown>;

    // Zod v4: use meta() method to get description
    if (typeof zodSchema.meta === "function") {
      try {
        const meta = (zodSchema.meta as () => Record<string, unknown>)();
        if (meta && typeof meta.description === "string") {
          return meta.description;
        }
      } catch {
        // meta() may throw if not available
      }
    }

    // Zod v3 fallback: description in _def.description
    const def = zodSchema._def as Record<string, unknown> | undefined;
    if (def && typeof def.description === "string") {
      return def.description;
    }

    return undefined;
  }

  /**
   * Checks if a schema is a ZodObject.
   * Supports both Zod v3 and v4.
   */
  private isZodObject(schema: unknown): boolean {
    if (!schema || typeof schema !== "object") {
      return false;
    }

    const zodSchema = schema as Record<string, unknown>;

    // Zod v4: check type property
    if (zodSchema.type === "object") {
      return true;
    }

    // Zod v3 fallback: check _def.typeName
    const def = zodSchema._def as Record<string, unknown> | undefined;
    if (def?.typeName === "ZodObject") {
      return true;
    }

    // Also check for shape property existence
    return "shape" in zodSchema;
  }

  /**
   * Unwraps optional/nullable/default wrappers to get the inner schema.
   * Supports both Zod v3 and v4.
   */
  private unwrapSchema(schema: unknown): unknown {
    if (!schema || typeof schema !== "object") {
      return schema;
    }

    const zodSchema = schema as Record<string, unknown>;

    // Zod v4: check type property and use def.innerType
    const type = zodSchema.type as string | undefined;
    const def = zodSchema.def as Record<string, unknown> | undefined;

    if (type === "optional" || type === "nullable" || type === "default") {
      if (def?.innerType) {
        return this.unwrapSchema(def.innerType);
      }
    }

    // Zod v3 fallback: check _def.typeName
    const _def = zodSchema._def as Record<string, unknown> | undefined;
    if (_def) {
      if (
        _def.typeName === "ZodOptional" ||
        _def.typeName === "ZodNullable" ||
        _def.typeName === "ZodDefault"
      ) {
        if (_def.innerType) {
          return this.unwrapSchema(_def.innerType);
        }
      }
    }

    return schema;
  }

  /**
   * Gets the shape from a ZodObject schema.
   * Supports both Zod v3 and v4.
   */
  private getShape(schema: unknown): Record<string, unknown> | undefined {
    if (!schema || typeof schema !== "object") {
      return undefined;
    }

    const zodSchema = schema as Record<string, unknown>;

    // Zod v4: shape is in _def.shape (getter)
    const _def = zodSchema._def as Record<string, unknown> | undefined;
    if (_def?.shape && typeof _def.shape === "object") {
      return _def.shape as Record<string, unknown>;
    }

    // Direct shape property
    if (zodSchema.shape && typeof zodSchema.shape === "object") {
      return zodSchema.shape as Record<string, unknown>;
    }

    return undefined;
  }
}

/**
 * Creates a new DescriptionExtractor instance.
 */
export function createDescriptionExtractor(): DescriptionExtractor {
  return new DescriptionExtractor();
}
