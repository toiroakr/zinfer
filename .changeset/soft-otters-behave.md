---
"zinfer": patch
---

Fix `TsgoHost` (tsgo/Corsa API backend, see #200) mishandling real `tsconfig.json` files that use `extends` or contain comments/trailing commas. Previously, `--project` support extracted `CompilerOptions` via `parseConfigFile()` and re-embedded them into a synthetic config elsewhere, which broke relative `extends`/`typeRoots` resolution for real-world configs. It now serves a patched copy of the original tsconfig.json at its own path (parsed with `jsonc-parser`, only `files` appended to), so `extends` and every other config-relative path resolve exactly as they would for the real project.
