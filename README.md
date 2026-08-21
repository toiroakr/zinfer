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
  --inline-external-types    Inline a plain type imported from another file instead of referencing it
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

  // Inline a plain type imported from another file instead of referencing it
  inlineExternalTypes: false,
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
  string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

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

Annotating the getter itself lets TypeScript unfold one whole copy of the schema
before it reaches the recursion. That copy is collapsed away, so the generated type
holds the self-reference directly rather than an extra level of the same shape.

### Recursive Schemas Across Files

A recursive type has no faithful inline form, so a recursive schema imported from
another file is referenced by name and imported from the file that declares its
types:

```typescript
// out/tree.generated.ts
import type { Node } from "./node.generated";

export type Tree = {
  root: Node;
  index: {
    [x: string]: Node;
  };
};
```

This needs the declaring file to be part of the same run and to get an output file of
its own (`--outDir` / `--outPattern`, or `--outFile`, which puts both declarations in
the one file and needs no import). A local import alias (`import { Node as N }`) makes
no difference - the reference and import still use the declaring file's own export name,
since that is the only name its generated file actually declares. `--schemas` only turns
this off for a schema the filter itself excludes, since that schema's own declaration
wouldn't be generated either; an output pattern that maps two schema files onto one path
turns it off too, for the same reason. Whenever a reference cannot be made, the schema
is inlined as far as it can be, with the recursion point kept as the index signature
or array the getter describes instead of collapsing to a bare `any`.

### Recursive Schemas Through a Non-Generated Intermediate

A schema that is not exported gets no generated type of its own, so a reference to
it is inlined. Its own references to schemas that ARE generated still resolve by
name, even when the reference to the recursive schema is nested inside that inlined
copy:

```typescript
export const NodeSchema = z.object({
  name: z.string(),
  get children() {
    return z.record(z.string(), NodeSchema);
  },
});

// Not exported - no type is generated for it
const GroupSchema = z.object({
  members: z.array(NodeSchema),
});

export const TreeSchema = z.object({
  direct: NodeSchema,
  viaGroup: GroupSchema,
});
```

```typescript
export type Tree = {
  direct: Node;
  viaGroup: {
    members: Node[];
  };
};
```

No import is needed here, since `Node` is generated in this same file - unlike the
cross-file case above, this works regardless of whether the intermediate's own file
is part of the run.

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

## Inlining External Types (`--inline-external-types`)

When a schema carries an explicit `z.ZodType<T>` annotation and `T` reaches a plain (non-Zod) `type`/`interface`/`enum` declared in another file, TypeScript prints an `import("...").Name` reference to it rather than expanding it - there is nothing else visible to print from that location. By default zinfer keeps that reference (rewritten to resolve correctly from wherever the output is written). Setting `--inline-external-types` replaces it with the referenced type's own structure instead, recursively, so the generated output carries no dependency on the original file layout - useful when generated files are moved, published, or read outside the project that declares those types.

```typescript
// field.types.ts
export type FieldType = "uuid" | "string" | "number" | "boolean";
export type FieldOutput = { type: FieldType; fields?: Record<string, FieldOutput> };

// field.schema.ts
import { z } from "zod";
import type { FieldOutput } from "./field.types";

export const FieldSchema: z.ZodType<FieldOutput> = z.lazy(() =>
  z.object({
    type: z.enum(["uuid", "string", "number", "boolean"]),
    fields: z.record(z.string(), FieldSchema).optional(),
  }),
);
```

Without the flag, `FieldType` is referenced:

```typescript
export type FieldOutput = {
  type: import("./field.types").FieldType;
  fields?: Record<string, FieldOutput>;
};
```

With `--inline-external-types`, it's expanded in place:

```typescript
export type FieldOutput = {
  type: "uuid" | "string" | "number" | "boolean";
  fields?: Record<string, FieldOutput>;
};
```

The expansion follows references across as many files as needed. A reference that would recurse into itself - directly, or by cycling back through another file - is left as an `import(...)` at the point it would repeat; everything outside the cycle is still fully expanded. A same-file type that isn't exported has no importable name to fall back to, so a cycle through one is left as a bare (unresolved) identifier - the same known limitation `nonexported-explicit-type-schema.ts` documents for a local explicit annotation. Namespace imports (`import * as ns`), default-imported types, and generic instantiations (`import("...").Foo<Bar>`) aren't expanded either; each is left as the reference zinfer would otherwise print.

This only applies to a plain type reached through an explicit `z.ZodType<T>` annotation - a Zod schema imported from another file is unaffected, and continues to be referenced by its own generated type name or inlined as already described elsewhere in this document.

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
