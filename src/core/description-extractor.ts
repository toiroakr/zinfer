import { existsSync, readFileSync } from "fs";
import { dirname, join, resolve } from "pathe";
import { createJiti, type Jiti } from "jiti";
import { getErrorMessage, logDebugError, logVerbose } from "./logger.js";
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
  private tsconfigAliases: Record<string, string>;
  /** jiti instances keyed by the nearest package.json path (so each module's subpath imports resolve correctly). */
  private jitiCache = new Map<string, Jiti>();

  constructor(options?: DescriptionExtractorOptions) {
    this.tsconfigAliases = options?.tsconfigPath ? this.loadPathAliases(options.tsconfigPath) : {};
  }

  /**
   * Returns a jiti instance configured to resolve the module at `filePath`.
   *
   * Node only resolves the bare "#/" subpath import form (e.g.
   * "#/schemas/user.js") natively from Node 26 onward; older Node rejects it as
   * an invalid internal imports specifier. jiti delegates subpath-imports
   * resolution to the running Node, so on Node < 26 it cannot import modules
   * that rely on a package.json `imports` `#/*` mapping. We bridge this by
   * reading the nearest package.json `imports` field and registering jiti
   * aliases for it (the same mechanism we already use for tsconfig `paths`),
   * which makes resolution work regardless of the Node version.
   */
  private getJiti(filePath: string): Jiti {
    const packageJsonPath = this.findNearestPackageJson(filePath);
    const cacheKey = packageJsonPath ?? "";

    const cached = this.jitiCache.get(cacheKey);
    if (cached) return cached;

    const importAliases = packageJsonPath ? this.loadSubpathImports(packageJsonPath) : {};
    const alias = { ...this.tsconfigAliases, ...importAliases };

    const jiti = createJiti(import.meta.url, {
      ...(Object.keys(alias).length ? { alias } : {}),
      interopDefault: false,
    });

    this.jitiCache.set(cacheKey, jiti);
    return jiti;
  }

  /**
   * Walks up from a file to find the nearest package.json.
   */
  private findNearestPackageJson(filePath: string): string | undefined {
    let dir = dirname(resolve(filePath));

    while (true) {
      const candidate = join(dir, "package.json");
      if (existsSync(candidate)) {
        return candidate;
      }
      const parent = dirname(dir);
      if (parent === dir) {
        return undefined;
      }
      dir = parent;
    }
  }

  /**
   * Loads subpath import aliases from a package.json `imports` field.
   *
   * Wildcard keys keep their trailing "/" (e.g. "#/*" -> "#/", "#src/*" ->
   * "#src/") so that prefix matching never collides with unrelated keys such as
   * an exact "#shared" import.
   */
  private loadSubpathImports(packageJsonPath: string): Record<string, string> {
    try {
      const pkg = JSON.parse(readFileSync(packageJsonPath, "utf-8"));
      const imports = pkg?.imports;
      if (!imports || typeof imports !== "object") return {};

      const packageDir = dirname(packageJsonPath);
      const aliases: Record<string, string> = {};

      for (const [key, value] of Object.entries(imports)) {
        const target = this.resolveImportTarget(value);
        if (!target) continue;

        if (key.endsWith("*")) {
          // Wildcard mapping: drop the trailing "*" but keep the "/" so the
          // alias matches "#/..." / "#src/..." without matching "#shared".
          const aliasKey = key.slice(0, -1);
          // Strip "*" and any suffix after it (e.g. "./src/*.ts" -> "./src/"):
          // jiti resolves the extension itself, so only the prefix directory
          // is needed. A bare trailing "*" ("./schemas/*") is handled too.
          let aliasValue = resolve(packageDir, target.replace(/\*.*$/, ""));
          if (aliasKey.endsWith("/") && !aliasValue.endsWith("/")) {
            aliasValue += "/";
          }
          aliases[aliasKey] = aliasValue;
        } else {
          aliases[key] = resolve(packageDir, target);
        }
      }

      logVerbose(`Loaded subpath imports from ${packageJsonPath}: ${JSON.stringify(aliases)}`);
      return aliases;
    } catch (error) {
      logDebugError(`Failed to load subpath imports from ${packageJsonPath}`, error);
      return {};
    }
  }

  /**
   * Resolves a package.json `imports` target to a file path string.
   * Targets may be a plain string or a conditional object.
   */
  private resolveImportTarget(value: unknown): string | undefined {
    if (typeof value === "string") return value;
    if (value && typeof value === "object") {
      const conditions = value as Record<string, unknown>;
      for (const condition of ["import", "node", "default", "require"]) {
        const resolved = this.resolveImportTarget(conditions[condition]);
        if (resolved) return resolved;
      }
    }
    return undefined;
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
      const module = await this.getJiti(absolutePath).import(absolutePath);

      const moduleObj = module as Record<string, unknown>;

      for (const schemaName of schemaNames) {
        const schema = moduleObj[schemaName];
        if (!schema) {
          continue;
        }

        try {
          const descriptions = this.extractFromSchema(schema, schemaName);
          result.set(schemaName, descriptions);
        } catch (error) {
          // A single schema's extraction (e.g. one hitting runaway recursion)
          // must not blank out descriptions already collected for other
          // schemas in the same file.
          console.warn(
            `Warning: Could not extract descriptions for schema "${schemaName}" in ${filePath}:`,
            getErrorMessage(error),
          );
        }
      }
    } catch (error) {
      // If import fails, return empty descriptions (non-blocking)
      console.warn(
        `Warning: Could not import ${filePath} for description extraction:`,
        getErrorMessage(error),
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
    this.extractFieldDescriptions(innerSchema, "", fields, new Set());

    return {
      schemaName,
      description: schemaDesc,
      fields,
    };
  }

  /**
   * Recursively extracts field descriptions from a Zod schema.
   *
   * Arrays and unions are printed inline (no index/branch segment), so their
   * element/member schemas are recursed into at the *same* path as the field
   * that holds them - only ZodObject keys ever extend the path.
   *
   * `ancestors` tracks the ZodObject instances currently on the recursion
   * stack (e.g. a self-referential schema built with a `get` accessor).
   * Re-entering one of them would otherwise recurse forever since the field
   * path keeps growing without ever revisiting the same schema/path pair.
   * Objects are added on the way down and removed on the way back up, so the
   * same schema referenced twice in unrelated (non-cyclic) places is still
   * fully extracted both times.
   */
  private extractFieldDescriptions(
    schema: unknown,
    prefix: string,
    fields: FieldDescription[],
    ancestors: Set<unknown>,
  ): void {
    if (!schema || typeof schema !== "object") {
      return;
    }

    // Handle ZodObject - extract from shape
    if (this.isZodObject(schema)) {
      if (ancestors.has(schema)) {
        return;
      }
      ancestors.add(schema);
      try {
        const shape = this.getShape(schema);
        if (shape && typeof shape === "object") {
          for (const [key, fieldSchema] of Object.entries(shape)) {
            const path = prefix ? `${prefix}.${key}` : key;

            // Get description for this field (check through effects/transforms)
            const desc = this.getDescriptionDeep(fieldSchema);
            if (desc) {
              fields.push({ path, description: desc });
            }

            // Recurse into nested schemas (objects, and objects reachable
            // through arrays/unions, which print inline at the same path)
            this.extractFieldDescriptions(this.unwrapSchema(fieldSchema), path, fields, ancestors);
          }
        }
      } finally {
        ancestors.delete(schema);
      }
      return;
    }

    // Array element types print inline without an index segment, so their
    // fields are scoped to the array field's own path.
    const elementSchema = this.getArrayElement(schema);
    if (elementSchema) {
      this.extractFieldDescriptions(this.unwrapSchema(elementSchema), prefix, fields, ancestors);
      return;
    }

    // Union members print inline too; only object-shaped members contribute
    // fields, scoped to the same path as the union itself.
    const unionOptions = this.getUnionOptions(schema);
    if (unionOptions) {
      for (const option of unionOptions) {
        this.extractFieldDescriptions(this.unwrapSchema(option), prefix, fields, ancestors);
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

    if (type === "optional" || type === "nullable" || type === "default" || type === "readonly") {
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
        _def.typeName === "ZodDefault" ||
        _def.typeName === "ZodReadonly"
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

  /**
   * Gets the element schema from a ZodArray schema.
   * Supports both Zod v3 and v4.
   */
  private getArrayElement(schema: unknown): unknown {
    if (!schema || typeof schema !== "object") {
      return undefined;
    }

    const zodSchema = schema as Record<string, unknown>;

    // Zod v4: type property and def.element
    if (zodSchema.type === "array") {
      const def = zodSchema.def as Record<string, unknown> | undefined;
      if (def?.element) return def.element;
    }

    // Zod v3 fallback: _def.typeName and _def.type
    const _def = zodSchema._def as Record<string, unknown> | undefined;
    if (_def?.typeName === "ZodArray" && _def.type) {
      return _def.type;
    }

    return undefined;
  }

  /**
   * Gets the member schemas from a ZodUnion (or discriminated union) schema.
   * Supports both Zod v3 and v4.
   */
  private getUnionOptions(schema: unknown): unknown[] | undefined {
    if (!schema || typeof schema !== "object") {
      return undefined;
    }

    const zodSchema = schema as Record<string, unknown>;

    // Zod v4: type property and def.options
    if (zodSchema.type === "union") {
      const def = zodSchema.def as Record<string, unknown> | undefined;
      if (Array.isArray(def?.options)) return def.options as unknown[];
    }

    // Zod v3 fallback: _def.typeName and _def.options
    const _def = zodSchema._def as Record<string, unknown> | undefined;
    if (
      (_def?.typeName === "ZodUnion" || _def?.typeName === "ZodDiscriminatedUnion") &&
      Array.isArray(_def.options)
    ) {
      return _def.options as unknown[];
    }

    return undefined;
  }
}
