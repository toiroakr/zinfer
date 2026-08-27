import type { Holder } from "./holder";

// Holder isn't visible from schema.ts, so reaching its `typeof Kind` field
// recurses through holder.ts's own declaration - exercising the
// bare-reference promotion path's typeof guard, not just the top-level
// synthesis path's (see typeof-toplevel-schema.ts).
export type Wrapper = { holder: Holder };
