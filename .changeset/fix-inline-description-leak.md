---
"zinfer": patch
---

Fix `.describe()` text on an inlined nested field being replaced by an unrelated same-named field's text elsewhere in the file. Field descriptions were looked up by field name only, because the nested object formatter never actually tracked nesting depth (including across sibling objects in the same union/tuple). Also extend description extraction to recurse into array element and union member types, since those types print inline at the same path as their containing field.
