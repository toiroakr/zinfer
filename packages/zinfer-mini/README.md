# zinfer-mini

A tool to extract TypeScript input/output types from [zod/mini](https://zod.dev/api?id=zod-mini) schemas.

zinfer-mini is the zod/mini counterpart of [zinfer](https://github.com/toiroakr/zinfer). zod/mini composes
schemas through top-level functions (`z.object({...})`, `z.optional(schema)`, `z.pick(schema, mask)`) rather
than zinfer's method-chain style (`z.object({...}).optional()`), so it needs its own detection logic - see the
[Supported zod/mini features](#supported-zodmini-features) section below for what that means in practice.

## Features

- Extract `z.input<T>` / `z.output<T>` types as text from zod/mini schemas
- Accurate type analysis using the TypeScript Compiler API (ts-morph)
- Non-invasive: does not modify original source files
- Works with both `import * as z from "zod/mini"` and named imports (`import { object, string } from "zod/mini"`)
- Handles circular references (`z.lazy()`, getter patterns)
- Outputs `z.describe()` / `z.meta()` descriptions as TSDoc comments
- Preserves branded types (`.brand()`)
- Supports both CLI and library API
- Configuration file support (`zinfer-mini.config.ts`, `package.json`)

## Installation

```bash
npm install zinfer-mini
```

zod/mini ships as a subpath of the `zod` package itself (not a separate package), so `zod` (>=4.3.0) is a
peer dependency - installing `zinfer-mini` alongside whatever `zod` version your project already uses is enough.
(4.3.0, not zod v4's own 4.0.0 floor: earlier 4.x releases were still missing `describe`/`promise`/`exactOptional`
from zod/mini's top-level exports.)

## Quick Start

### CLI

```bash
# Extract all schemas from a single file
zinfer-mini src/schemas/user.ts

# Process multiple files with glob patterns
zinfer-mini "src/**/*.schema.ts"

# Output to files
zinfer-mini src/schemas.ts --outDir ./types

# Merge into a single type when input/output are identical
zinfer-mini src/schemas.ts --merge-same --suffix Schema
```

### Library API

```typescript
import { extractZodMiniTypes, extractAllSchemas, extractAndFormat } from "zinfer-mini";

// Extract a single schema
const { input, output } = extractZodMiniTypes("./schemas.ts", "UserSchema");
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

| Option                                                           | Description                                              |
| ---------------------------------------------------------------- | -------------------------------------------------------- |
| `-c, --config <path>`                                            | Path to config file                                      |
| `-p, --project <path>`                                           | Path to tsconfig.json                                    |
| `--schemas <names>`                                              | Comma-separated schema names to extract                  |
| `--input-only` / `--output-only`                                 | Output only one side                                     |
| `--merge-same`                                                   | Single type if input === output                          |
| `--suffix <suffix>`                                              | Remove suffix from schema names (e.g. `Schema`)          |
| `--input-suffix` / `--output-suffix <suffix>`                    | Suffix for generated type names                          |
| `--map <mappings>`                                               | Custom name mappings (`UserSchema:User`)                 |
| `--outDir <dir>` / `--outFile <file>` / `--outPattern <pattern>` | Output location/naming                                   |
| `-d, --declaration`                                              | Generate `.d.ts` files                                   |
| `--dry-run`                                                      | Preview without writing files                            |
| `--with-descriptions`                                            | Include `z.describe()`/`z.meta()` as TSDoc comments      |
| `--generate-tests`                                               | Generate vitest type-equality tests alongside type files |
| `--inline-type-references [project\|all]`                        | Inline a plain type an explicit annotation reaches       |
| `--brand-strategy <zod-import\|local-symbol>`                    | How a `.brand()` marker is represented                   |
| `-v, --verbose`                                                  | Enable verbose output                                    |

## Configuration File

### zinfer-mini.config.ts

```typescript
import { defineConfig } from "zinfer-mini";

export default defineConfig({
  include: ["src/**/*.schema.ts"],
  outDir: "src/types",
  suffix: "Schema",
});
```

### package.json

```json
{
  "zinferMini": {
    "include": ["src/**/*.schema.ts"],
    "outDir": "src/types"
  }
}
```

## Supported zod/mini features

zinfer-mini's v1 covers the schemas most codebases actually write:

- Primitives and string formats, `object` / `strictObject` / `looseObject`, `array`, `tuple`, `record` and its
  variants, `map`, `set`, `union` / `xor`, `discriminatedUnion`, `intersection`
- Wrappers: `optional`, `exactOptional`, `nullable`, `nullish`, `nonoptional`, `success`, `readonly`, `promise`
- Object operations that take the schema as their first argument: `pick`, `omit`, `partial`, `required`,
  `extend`, `safeExtend`, `merge`\*, `catchall`, `keyof`
- `_default`, `prefault`, `catch`, `lazy` (recursive schemas), `check`/`custom`/`refine`/`superRefine`
- Descriptions set via `.check(z.describe(...))`, `z.meta(...)`, or `.register(z.globalRegistry, {...})` -
  read from zod's shared `globalRegistry` at runtime, since (unlike classic zod) `ZodMiniType` has no
  `.meta()`/`.describe()` instance method of its own
- Both `import * as z from "zod/mini"` and named imports, across all three equivalent specifiers
  (`zod/mini`, `zod/v4/mini`, `zod/v4-mini`)

\* `merge` is detected like any other builder, but is itself deprecated upstream in favor of `extend` - and, in
zod 4.4.3, its two-full-schema form (`z.merge(a, b)`, matching its own type signature) crashes at runtime; only
`z.merge(a, b.shape)` (a plain shape object as the second argument) actually works. Prefer `extend` instead.

### Known limitations

- `z.pipe(a, b)` composes two full schemas (unlike zinfer-classic's `.transform()`, there is no single
  "input schema" a reference could point back to), so a named schema reference is not tracked through a pipe -
  it prints inlined, the same way a `.transform()` result does in zinfer.
- `codec`, `invertCodec`, `stringbool`, `json`, and function schemas (`z.function()`) aren't analyzed.
- **A recursive zod/mini schema needs an explicit `z.ZodMiniType<T>` annotation.** zod/mini's `object()` is a
  plain generic function (unlike zod-classic's method-chain-based `ZodObject`), so TypeScript cannot infer a
  getter's return type when it is circular through the very object literal being passed to `object()` - it
  gives up on the whole schema's type, not just the recursive field, which leaves no `any` placeholder for
  zinfer-mini to resolve back to a name. Add the annotation (see [Circular Reference Support](#circular-reference-support))
  and it resolves correctly, `z.lazy()` included.

## Circular Reference Support

A recursive zod/mini schema needs an explicit `z.ZodMiniType<T>` annotation (see Known limitations above) -
with one, both a getter-based self-reference and `z.lazy(() => Schema)` resolve back to a named type reference:

```typescript
interface Category {
  name: string;
  subcategories: Category[];
}

export const CategorySchema: z.ZodMiniType<Category> = z.object({
  name: z.string(),
  get subcategories() {
    return z.array(CategorySchema);
  },
});
```

## License

MIT
