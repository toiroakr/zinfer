# zinfer

Zod スキーマから TypeScript の input/output 型を抽出するツール。

## 特徴

- Zod スキーマから `z.input<T>` / `z.output<T>` 型をテキストとして抽出
- TypeScript Compiler API (ts-morph) を使用した正確な型解析
- 元のソースファイルを変更しない
- CLI とライブラリ API の両方をサポート
- 循環参照 (`z.lazy`, getter パターン) に対応
- `.describe()` を TSDoc コメントとして出力
- 設定ファイル対応 (`zinfer.config.ts`, `package.json`)

## インストール

```bash
npm install zinfer
```

## クイックスタート

### CLI

```bash
# 単一ファイルから全スキーマを抽出
zinfer src/schemas/user.ts

# Glob パターンで複数ファイルを処理
zinfer "src/**/*.schema.ts"

# ファイルに出力
zinfer src/schemas.ts --outDir ./types

# input/output が同一なら1つの型に統一
zinfer src/schemas.ts --unify-same --suffix Schema
```

### ライブラリ API

```typescript
import { extractZodTypes, extractAllSchemas } from 'zinfer';

// 単一スキーマの抽出
const { input, output } = extractZodTypes('./schemas.ts', 'UserSchema');
console.log(input);  // { id: string; name: string; }
console.log(output); // { id: string; name: string; }

// ファイル内の全スキーマを抽出
const results = extractAllSchemas('./schemas.ts');
for (const result of results) {
  console.log(`${result.schemaName}: ${result.input}`);
}
```

## CLI オプション

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
  --unify-same               Single type if input===output
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
  -V, --version              Output the version number
  -h, --help                 Display help
```

## 設定ファイル

### zinfer.config.ts

```typescript
import { defineConfig } from 'zinfer';

export default defineConfig({
  // 処理対象ファイル
  include: ['src/**/*.schema.ts'],

  // 除外パターン
  exclude: ['**/*.test.ts'],

  // tsconfig.json のパス
  project: './tsconfig.json',

  // 抽出するスキーマ名（指定しない場合は全て）
  schemas: ['UserSchema', 'PostSchema'],

  // 出力オプション
  outDir: './types',
  outFile: './types/index.ts',
  outPattern: '[name].types.ts',
  declaration: true,

  // 型名オプション
  suffix: 'Schema',           // スキーマ名から削除するサフィックス
  inputSuffix: 'Input',       // input 型のサフィックス
  outputSuffix: 'Output',     // output 型のサフィックス
  unifySame: true,            // input === output なら1つの型に

  // カスタムマッピング
  map: {
    'UserSchema': 'User',
    'PostSchema': 'Article',
  },

  // .describe() を TSDoc として出力
  withDescriptions: true,
});
```

### package.json

```json
{
  "zinfer": {
    "include": ["src/**/*.schema.ts"],
    "outDir": "./types",
    "unifySame": true,
    "suffix": "Schema"
  }
}
```

設定ファイルの検索順序:
1. `zinfer.config.ts`
2. `zinfer.config.mts`
3. `zinfer.config.js`
4. `zinfer.config.mjs`
5. `package.json` の `zinfer` フィールド

CLI オプションは設定ファイルより優先されます。

## 出力例

### 基本的な出力

入力スキーマ:
```typescript
export const UserSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  age: z.number().optional(),
});
```

出力 (デフォルト):
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

出力 (`--unify-same --suffix Schema`):
```typescript
export type User = {
  id: string;
  name: string;
  age?: number | undefined;
};
```

### Transform がある場合

入力スキーマ:
```typescript
export const DateSchema = z.object({
  createdAt: z.string().transform((s) => new Date(s)),
  count: z.string().transform(Number),
});
```

出力:
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

### TSDoc コメント付き (`--with-descriptions`)

入力スキーマ:
```typescript
export const UserSchema = z.object({
  id: z.string().uuid().describe('Unique user identifier'),
  name: z.string().describe("User's display name"),
  email: z.string().email().describe('Email address'),
}).describe('User account information');
```

出力:
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

## 循環参照のサポート

### Getter パターン (推奨)

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

### z.lazy パターン

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
  ])
);
```

明示的な型注釈 (`z.ZodType<T>`) がある場合、その型名が出力に使用されます。

## ライブラリ API

### extractZodTypes

単一スキーマから型を抽出します。

```typescript
import { extractZodTypes } from 'zinfer';

const { input, output } = extractZodTypes(
  './schemas.ts',
  'UserSchema',
  './tsconfig.json'  // optional
);
```

### extractAllSchemas

ファイル内の全スキーマを抽出します。

```typescript
import { extractAllSchemas } from 'zinfer';

const results = extractAllSchemas('./schemas.ts');
// results: ExtractResult[]
```

### generateTypeDeclarations

抽出結果から TypeScript 型宣言を生成します。

```typescript
import { extractAllSchemas, generateTypeDeclarations } from 'zinfer';

const results = extractAllSchemas('./schemas.ts');
const declarations = generateTypeDeclarations(results, {
  nameMapping: {
    removeSuffix: 'Schema',
    inputSuffix: 'Input',
    outputSuffix: 'Output',
  },
  declaration: {
    unifySame: true,
  },
});

console.log(declarations);
```

### ZodTypeExtractor クラス

より細かい制御が必要な場合:

```typescript
import { ZodTypeExtractor } from 'zinfer';

const extractor = new ZodTypeExtractor('./tsconfig.json');

// 単一スキーマ
const result = extractor.extract({
  filePath: './schemas.ts',
  schemaName: 'UserSchema',
});

// 全スキーマ
const allResults = extractor.extractAll('./schemas.ts');

// 複数スキーマを指定
const selectedResults = extractor.extractMultiple(
  './schemas.ts',
  ['UserSchema', 'PostSchema']
);

// スキーマ名の一覧
const schemaNames = extractor.getSchemaNames('./schemas.ts');
```

## 対応している Zod 機能

- 基本型: `z.string()`, `z.number()`, `z.boolean()`, `z.date()`, etc.
- オブジェクト: `z.object()`
- 配列: `z.array()`
- Union: `z.union()`, `z.discriminatedUnion()`
- Intersection: `z.intersection()`, `.and()`, `.merge()`
- Enum: `z.enum()`, `z.nativeEnum()`
- Optional/Nullable: `.optional()`, `.nullable()`
- Transform: `.transform()`
- Refine: `.refine()`, `.superRefine()`
- ユーティリティ: `.partial()`, `.pick()`, `.omit()`, `.extend()`
- 循環参照: `z.lazy()`, getter パターン
- 説明: `.describe()`

## ライセンス

MIT
