import { readFileSync } from "fs";
import { resolve } from "pathe";
import { createJiti, type Jiti } from "jiti";
import { logDebugError, logVerbose } from "./logger.js";
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
 * Options for the DescriptionExtractor.
 */
export interface DescriptionExtractorOptions {
  /** Path to tsconfig.json for resolving path aliases */
  tsconfigPath?: string;
}

/**
 * Extracts descriptions from Zod schemas by dynamically importing the module.
 * Uses jiti for TypeScript-aware module resolution (extensionless imports, path aliases).
 */
export class DescriptionExtractor {
  private jiti: Jiti;

  constructor(options?: DescriptionExtractorOptions) {
    this.jiti = createJiti(import.meta.url, {
      ...(options?.tsconfigPath ? { alias: this.loadPathAliases(options.tsconfigPath) } : {}),
      interopDefault: false,
    });
  }

  /**
   * Loads path aliases from tsconfig.json for module resolution.
   */
  private loadPathAliases(tsconfigPath: string): Record<string, string> {
    try {
      const tsconfig = JSON.parse(readFileSync(tsconfigPath, "utf-8"));
      const paths = tsconfig?.compilerOptions?.paths;
      const baseUrl = tsconfig?.compilerOptions?.baseUrl || ".";
      const basePath = resolve(tsconfigPath, "..", baseUrl);

      if (!paths) return {};

      const aliases: Record<string, string> = {};
      for (const [key, values] of Object.entries(paths)) {
        const targetValues = values as string[];
        if (targetValues.length > 0) {
          // Convert "key/*" → "key" and "value/*" → "basePath/value"
          const aliasKey = key.replace(/\/\*$/, "");
          const aliasValue = resolve(basePath, targetValues[0].replace(/\/\*$/, ""));
          aliases[aliasKey] = aliasValue;
        }
      }

      logVerbose(`Loaded path aliases from ${tsconfigPath}: ${JSON.stringify(aliases)}`);
      return aliases;
    } catch (error) {
      logDebugError(`Failed to load tsconfig paths from ${tsconfigPath}`, error);
      return {};
    }
  }

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
      const absolutePath = resolve(filePath);

      // Use jiti for TypeScript-aware module resolution
      const module = await this.jiti.import(absolutePath);

      const moduleObj = module as Record<string, unknown>;

      for (const schemaName of schemaNames) {
        const schema = moduleObj[schemaName];
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

    // Get schema-level description (unwrap through effects/transforms)
    const schemaDesc = this.getDescriptionDeep(schema);

    // Extract field descriptions recursively (unwrap through effects/transforms first)
    const innerSchema = this.unwrapToInnerSchema(schema);
    this.extractFieldDescriptions(innerSchema, "", fields);

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

          // Get description for this field (check through effects/transforms)
          const desc = this.getDescriptionDeep(fieldSchema);
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
   * Gets the description from a Zod schema, looking through effects/transforms.
   * First checks the outer schema, then unwraps through ZodEffects to find descriptions.
   */
  private getDescriptionDeep(schema: unknown): string | undefined {
    // First try direct description
    const directDesc = this.getDescription(schema);
    if (directDesc) return directDesc;

    // Try unwrapping through effects (transform/refine/preprocess)
    if (!schema || typeof schema !== "object") return undefined;

    const zodSchema = schema as Record<string, unknown>;
    const _def = zodSchema._def as Record<string, unknown> | undefined;

    // Zod v3: ZodEffects wraps the inner schema in _def.schema
    if (_def?.typeName === "ZodEffects" && _def.schema) {
      return this.getDescriptionDeep(_def.schema);
    }

    // Zod v4: effects/pipe type
    const type = zodSchema.type as string | undefined;
    const def = zodSchema.def as Record<string, unknown> | undefined;
    if ((type === "effects" || type === "pipe") && def?.in) {
      return this.getDescriptionDeep(def.in);
    }

    return undefined;
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
      } catch (error) {
        logDebugError("meta() call failed", error);
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
   * Unwraps effects/transform wrappers to get the inner schema for field extraction.
   * This handles ZodEffects (from .transform(), .refine(), .preprocess()).
   */
  private unwrapToInnerSchema(schema: unknown): unknown {
    if (!schema || typeof schema !== "object") {
      return schema;
    }

    const zodSchema = schema as Record<string, unknown>;
    const _def = zodSchema._def as Record<string, unknown> | undefined;

    // Zod v3: ZodEffects wraps the inner schema in _def.schema
    if (_def?.typeName === "ZodEffects" && _def.schema) {
      return this.unwrapToInnerSchema(_def.schema);
    }

    // Zod v4: effects/pipe type
    const type = zodSchema.type as string | undefined;
    const def = zodSchema.def as Record<string, unknown> | undefined;
    if ((type === "effects" || type === "pipe") && def?.in) {
      return this.unwrapToInnerSchema(def.in);
    }

    return schema;
  }

  /**
   * Unwraps optional/nullable/default/effects wrappers to get the inner schema.
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

    // Zod v4: effects/pipe type
    if ((type === "effects" || type === "pipe") && def?.in) {
      return this.unwrapSchema(def.in);
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

      // Zod v3: ZodEffects wraps the inner schema in _def.schema
      if (_def.typeName === "ZodEffects" && _def.schema) {
        return this.unwrapSchema(_def.schema);
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
