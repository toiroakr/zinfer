---
"vinfer": patch
"zinfer-mini": patch
"zinfer": patch
---

fix(deps): remove the unused `typescript` peer dependency. The packages analyze types through the bundled `typescript-native`, so the project's own `typescript` is not required.
