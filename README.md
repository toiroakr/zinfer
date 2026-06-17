# zinfer

A tool to extract TypeScript input/output types from Zod schemas.

## Features

- Extract `z.input<T>` / `z.output<T>` types as text from Zod schemas
- Accurate type analysis using TypeScript Compiler API (ts-morph)
- Non-invasive: does not modify original source files
- Supports both CLI and library API
- Handles circular references (`z.lazy`, getter patterns)
- Outputs `.describe()` as TSDoc comments
- Supports branded types via `.brand()`
- Configuration file support (`zinfer.config.ts`, `package.json`)

## Installation

```bash
npm install zinfer
```

## Quick Start

### CLI

```bash
# Extract all schemas from a single file
zinfer src/schemas/user.ts

# Process multiple files with glob patterns
zinfer "src/**/*.schema.ts"

# Output to files
zinfer src/schemas.ts --outDir ./types

# Merge into a single type when input/output are identical
zinfer src/schemas.ts --merge-same --suffix Schema
```

### Library API

```typescript
import { extractZodTypes, extractAllSchemas, extractAndFormat } from "zinfer";

// Extract a single schema
const { input, output } = extractZodTypes("./schemas.ts", "UserSchema");
console.log(input); // { id: string; name: string; }
console.log(output); // { id: string; name: string; }

// Get formatted output
const formatted = extractAndFormat("./schemas.ts", "UserSchema");
console.log(formatted);

// Extract all schemas from a file
const results = extractAllSchemas("./schemas.ts");
for (const result of results) {
  console.log(`${result.schemaName}: ${result.input}`);
}
```

## CLI Options

```
Usage: zinfer [options] [files...]

Arguments:
  files                      File paths or glob patterns

Options:
  -c, --config <path>        Path to config file
  -p, --project <path>       Path to tsconfig.json
  --schemas <names>          Comma-separated schema names to extract
  --input-only               Output only input types
  --output-only              Output only output types
  --merge-same               Single type if input===output
  --suffix <suffix>          Remove suffix from schema names (e.g., 'Schema')
  --input-suffix <suffix>    Suffix for input type names (default: 'Input')
  --output-suffix <suffix>   Suffix for output type names (default: 'Output')
  --map <mappings>           Custom name mappings (e.g., 'UserSchema:User')
  --outDir <dir>             Output directory for generated files
  --outFile <file>           Single output file for all types
  --outPattern <pattern>     Output file naming pattern (e.g., '[name].types.ts')
  -d, --declaration          Generate .d.ts files
  --dry-run                  Preview without writing files
  --with-descriptions        Include Zod .describe() as TSDoc comments
  --generate-tests           Generate vitest type equality tests alongside type files
  -V, --version              Output the version number
  -h, --help                 Display help
```

## Configuration File

### zinfer.config.ts

```typescript
import { defineConfig } from "zinfer";

export default defineConfig({
  // Target files
  include: ["src/**/*.schema.ts"],

  // Exclude patterns
  exclude: ["**/*.test.ts"],

  // Path to tsconfig.json
  project: "./tsconfig.json",

  // Schema names to extract (all if not specified)
  schemas: ["UserSchema", "PostSchema"],

  // Output options
  outDir: "./types",
  outFile: "./types/index.ts",
  outPattern: "[name].types.ts",
  declaration: true,

  // Type output options
  inputOnly: false, // Output only input types
  outputOnly: false, // Output only output types
  mergeSame: true, // Merge into single type when input === output

  // Type name options
  suffix: "Schema", // Suffix to remove from schema names
  inputSuffix: "Input", // Suffix for input types
  outputSuffix: "Output", // Suffix for output types

  // Custom mappings
  map: {
    UserSchema: "User",
    PostSchema: "Article",
  },

  // Output .describe() as TSDoc
  withDescriptions: true,
});
```

### package.json

```json
{
  "zinfer": {
    "include": ["src/**/*.schema.ts"],
    "outDir": "./types",
    "mergeSame": true,
    "suffix": "Schema"
  }
}
```

Config file resolution order:

1. `zinfer.config.ts`
2. `zinfer.config.mts`
3. `zinfer.config.js`
4. `zinfer.config.mjs`
5. `zinfer` field in `package.json`

CLI options take precedence over config file settings.

## Output Examples

### Basic Output

Input schema:

```typescript
export const UserSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  age: z.number().optional(),
});
```

Output (default):

```typescript
export type UserSchemaInput = {
  id: string;
  name: string;
  age?: number | undefined;
};

export type UserSchemaOutput = {
  id: string;
  name: string;
  age?: number | undefined;
};
```

Output (`--merge-same --suffix Schema`):

```typescript
export type User = {
  id: string;
  name: string;
  age?: number | undefined;
};
```

### With Transforms

Input schema:

```typescript
export const DateSchema = z.object({
  createdAt: z.string().transform((s) => new Date(s)),
  count: z.string().transform(Number),
});
```

Output:

```typescript
export type DateSchemaInput = {
  createdAt: string;
  count: string;
};

export type DateSchemaOutput = {
  createdAt: Date;
  count: number;
};
```

### With TSDoc Comments (`--with-descriptions`)

Input schema:

```typescript
export const UserSchema = z
  .object({
    id: z.string().uuid().describe("Unique user identifier"),
    name: z.string().describe("User's display name"),
    email: z.string().email().describe("Email address"),
  })
  .describe("User account information");
```

Output:

```typescript
/**
 * User account information
 */
export type UserSchemaInput = {
  /** Unique user identifier */
  id: string;
  /** User's display name */
  name: string;
  /** Email address */
  email: string;
};
```

### Branded Types

Input schema:

```typescript
export const UserIdSchema = z.string().brand<"UserId">();

export const UserSchema = z.object({
  id: z.string().brand<"UserId">(),
  name: z.string(),
});
```

Output:

```typescript
import type { BRAND } from "zod";

export type UserIdSchemaInput = string;

export type UserIdSchemaOutput = string & BRAND<"UserId">;

export type UserSchemaInput = {
  id: string;
  name: string;
};

export type UserSchemaOutput = {
  id: string & BRAND<"UserId">;
  name: string;
};
```

Branded types are applied only to output types. Input types do not include brands.

## Circular Reference Support

### Getter Pattern (Recommended)

```typescript
interface Category {
  name: string;
  subcategories: Category[];
}

const CategoryBaseSchema = z.object({
  name: z.string(),
  get subcategories() {
    return CategorySchema.array();
  },
});

export const CategorySchema: z.ZodType<Category> = CategoryBaseSchema;
```

### z.lazy Pattern

```typescript
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(JsonValueSchema),
  ]),
);
```

When an explicit type annotation (`z.ZodType<T>`) is present, that type name is used in the output.

## Library API

### extractZodTypes

Extracts types from a single schema.

```typescript
import { extractZodTypes } from "zinfer";

const { input, output } = extractZodTypes(
  "./schemas.ts",
  "UserSchema",
  "./tsconfig.json", // optional
);
```

### extractAllSchemas

Extracts all schemas from a file.

```typescript
import { extractAllSchemas } from "zinfer";

const results = extractAllSchemas("./schemas.ts");
// results: ExtractResult[]
```

### extractAndFormat

Extracts types and returns them as a formatted string.

```typescript
import { extractAndFormat } from "zinfer";

const formatted = extractAndFormat("./schemas.ts", "UserSchema");
console.log(formatted);
// Output:
// // input
// { id: string; name: string; }
//
// // output
// { id: string; name: string; }
```

### generateTypeDeclarations

Generates TypeScript type declarations from extraction results.

```typescript
import { extractAllSchemas, generateTypeDeclarations } from "zinfer";

const results = extractAllSchemas("./schemas.ts");
const declarations = generateTypeDeclarations(results, {
  nameMapping: {
    removeSuffix: "Schema",
    inputSuffix: "Input",
    outputSuffix: "Output",
  },
  declaration: {
    mergeSame: true,
  },
});

console.log(declarations);
```

### ZodTypeExtractor Class

For more fine-grained control:

```typescript
import { ZodTypeExtractor } from "zinfer";

const extractor = new ZodTypeExtractor("./tsconfig.json");

// Single schema
const result = extractor.extract({
  filePath: "./schemas.ts",
  schemaName: "UserSchema",
});

// All schemas
const allResults = extractor.extractAll("./schemas.ts");

// Multiple specific schemas
const selectedResults = extractor.extractMultiple("./schemas.ts", ["UserSchema", "PostSchema"]);

// Extract by file (includes file path)
const fileResult = extractor.extractFile("./schemas.ts");
// fileResult: { filePath: string; schemas: ExtractResult[] }

// List schema names
const schemaNames = extractor.getSchemaNames("./schemas.ts");
```

## Type Test Generation

zinfer can automatically generate vitest tests that verify the generated types match `z.input<typeof Schema>` / `z.output<typeof Schema>`.

### Usage

```bash
# Generate type definitions and tests simultaneously
zinfer "src/schemas/*.ts" --outDir ./types --generate-tests --suffix Schema
# -> ./types/user.ts (type definitions)
# -> ./types/user.test.ts (tests)

# When outputting to a single file
zinfer "src/schemas/*.ts" --outFile ./types.ts --generate-tests --suffix Schema
# -> ./types.ts (type definitions)
# -> ./types.test.ts (tests)

# Run the tests
vitest run
```

### Example Generated Test

```typescript
import { describe, it, expectTypeOf } from "vitest";
import type { z } from "zod";

import { UserSchema } from "../schemas/user";
import type { UserInput, UserOutput } from "./user";

describe("Type equality tests", () => {
  describe("user", () => {
    it("UserSchema input matches z.input", () => {
      expectTypeOf<UserInput>().toEqualTypeOf<z.input<typeof UserSchema>>();
    });

    it("UserSchema output matches z.output", () => {
      expectTypeOf<UserOutput>().toEqualTypeOf<z.output<typeof UserSchema>>();
    });
  });
});
```

Re-run with `--generate-tests` after modifying schemas to continuously verify type correctness.

## Supported Zod Features

- Primitives: `z.string()`, `z.number()`, `z.boolean()`, `z.date()`, etc.
- Objects: `z.object()`
- Arrays: `z.array()`
- Union: `z.union()`, `z.discriminatedUnion()`
- Intersection: `z.intersection()`, `.and()`, `.merge()`
- Enum: `z.enum()`, `z.nativeEnum()`
- Optional/Nullable: `.optional()`, `.nullable()`
- Transform: `.transform()`
- Refine: `.refine()`, `.superRefine()`
- Utilities: `.partial()`, `.pick()`, `.omit()`, `.extend()`
- Circular references: `z.lazy()`, getter patterns
- Descriptions: `.describe()`
- Branded types: `.brand()`
- Imported schemas: relative imports and subpath imports (package.json `imports` field, including the `#/*` form)

## Subpath Imports

Schemas imported via the package.json [`imports`](https://nodejs.org/api/packages.html#subpath-imports) field are resolved automatically, including the `#/*` wildcard form supported by TypeScript 6 / Node 26.

```json
// package.json
{
  "imports": {
    "#/*": "./src/*"
  }
}
```

```typescript
// src/user.ts
import { z } from "zod";
import { AddressSchema } from "#/address.js";

export const UserSchema = z.object({
  name: z.string(),
  address: AddressSchema,
});
```

The imported `AddressSchema` is resolved through the nearest package.json `imports` map (wildcard, exact, and conditional targets are all supported) so that its type is inlined into the generated output.

## License

MIT
