---
"zinfer": patch
---

Fix a naive string-literal boundary check (`prevChar !== "\\"`, or the equivalent `text[i - 1] !== "\\"`) in `schema-detector.ts`, `getter-resolver.ts`, `type-printer.ts`, and `extractor.ts` (`promoteBareTypeReferences` and `hasTopLevelUnionOrIntersection`) that misjudged a string literal ending in an even number of backslashes (e.g. `"a\\"`) as still escaped, causing the scanner to stay stuck "inside" the string past its real end. Replaced with a backslash-parity check, shared through a new `string-scan.ts` module (ported from `toiroakr/vinfer`, which had the same bug independently and already fixed it the same way).
