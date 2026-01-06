import { pathToFileURL } from "url";
import { resolve } from "path";

/**
 * Field description information.
 */
export interface FieldDescription {
  /** Field path (e.g., "user.name" for nested fields) */
  path: string;
  /** Description text from .describe() */
  description: string;
}

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
    schemaNames: string[]
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
        (error as Error).message
      );
    }

    return result;
  }

  /**
   * Extracts descriptions from a Zod schema.
   */
  private extractFromSchema(
    schema: unknown,
    schemaName: string
  ): SchemaDescription {
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
    fields: FieldDescription[]
  ): void {
    if (!schema || typeof schema !== "object") {
      return;
    }

    const zodSchema = schema as Record<string, unknown>;

    // Handle ZodObject - extract from shape
    if (this.isZodObject(zodSchema)) {
      const shape = zodSchema.shape as Record<string, unknown>;
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
   */
  private getDescription(schema: unknown): string | undefined {
    if (!schema || typeof schema !== "object") {
      return undefined;
    }

    const zodSchema = schema as Record<string, unknown>;

    // Zod stores description in _def.description
    const def = zodSchema._def as Record<string, unknown> | undefined;
    if (def && typeof def.description === "string") {
      return def.description;
    }

    return undefined;
  }

  /**
   * Checks if a schema is a ZodObject.
   */
  private isZodObject(schema: unknown): boolean {
    if (!schema || typeof schema !== "object") {
      return false;
    }

    const zodSchema = schema as Record<string, unknown>;
    const def = zodSchema._def as Record<string, unknown> | undefined;

    return def?.typeName === "ZodObject" || "shape" in zodSchema;
  }

  /**
   * Unwraps optional/nullable/default wrappers to get the inner schema.
   */
  private unwrapSchema(schema: unknown): unknown {
    if (!schema || typeof schema !== "object") {
      return schema;
    }

    const zodSchema = schema as Record<string, unknown>;
    const def = zodSchema._def as Record<string, unknown> | undefined;

    if (!def) {
      return schema;
    }

    // Handle ZodOptional, ZodNullable, ZodDefault
    if (
      def.typeName === "ZodOptional" ||
      def.typeName === "ZodNullable" ||
      def.typeName === "ZodDefault"
    ) {
      return this.unwrapSchema(def.innerType);
    }

    return schema;
  }
}

/**
 * Creates a new DescriptionExtractor instance.
 */
export function createDescriptionExtractor(): DescriptionExtractor {
  return new DescriptionExtractor();
}
