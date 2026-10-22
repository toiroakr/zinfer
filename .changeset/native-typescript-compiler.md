---
"zinfer": minor
"zinfer-mini": minor
"vinfer": minor
---

Use TypeScript 7.1 Beta's native compiler API for schema detection, module resolution, and input/output type extraction. The compiler is installed under the `typescript-native` alias so consumers can keep their existing TypeScript version. ts-morph is no longer a runtime dependency. Development type checks and generated-code tests use the same compiler's CLI, replacing `@typescript/native-preview`.

Generated property and literal-union ordering can change, and recursive declarations may reference exported source interfaces. `SchemaDetector` accepts native TypeScript AST nodes; callers using ts-morph should use the extractor's `getSchemaNames(filePath)` instead.

Pass the originating synchronous native project to `new SchemaDetector(project)` when supplying native ASTs directly to preserve compiler options and virtual dependencies. The caller retains ownership of the API and snapshot.
