import { z } from "zod";

export const ImportedKindSchema = z.enum(["c", "d"]);

export const ImportedBaseSchema = z.strictObject({ kind: ImportedKindSchema });
