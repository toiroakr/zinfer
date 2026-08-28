---
"zinfer": patch
"vinfer": patch
---

Keep a brand applied directly to a tuple or an array. `__Normalize`'s array/tuple branch now leaves a type carrying symbol keys beyond an array's own well-known ones untouched, the same way the object branch already did - previously a branded fixed-length tuple was expanded into an object literal of every `Array.prototype` member, and a branded array silently lost its brand.
