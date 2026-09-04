import { relative, dirname, basename, join, isAbsolute } from "pathe";
import { existsSync, realpathSync } from "fs";
import type {
  ExtractResult,
  MappedTypeName,
  DeclarationOptions,
  FieldDescription,
} from "./types.js";
import { escapeRegExp } from "./regexp.js";
import { isEscaped } from "./string-scan.js";
import { replaceBareTypeNames } from "@zinfer-monorepo/core";

/**
 * Options for formatting type output.
 */
export interface PrintOptions {
  /** Indentation string (default: "  ") */
  indent?: string;
  /** Whether to include the schema name in the output */
  includeSchemaName?: boolean;
}

/**
 * Formats the extraction result for console output.
 *
 * @param result - The extraction result containing input and output types
 * @param options - Formatting options
 * @returns Formatted string ready for console output
 */
export function formatResult(result: ExtractResult, options: PrintOptions = {}): string {
  const { indent = "  ", includeSchemaName = false } = options;
  const lines: string[] = [];

  if (includeSchemaName) {
    lines.push(`// Schema: ${result.schemaName}`);
    lines.push("");
  }

  lines.push("// input");
  lines.push(prettifyType(result.input, indent));
  lines.push("");
  lines.push("// output");
  lines.push(prettifyType(result.output, indent));

  return lines.join("\n");
}

/**
 * Prettifies a type string by formatting object types with proper indentation.
 *
 * @param typeStr - The type string to format
 * @param indent - The indentation string to use
 * @param descriptions - Optional field descriptions to insert as TSDoc comments
 * @param prefix - Current path prefix for nested objects
 * @returns The formatted type string
 */
function prettifyType(
  typeStr: string,
  indent: string,
  descriptions?: FieldDescription[],
  prefix: string = "",
): string {
  // If it's not an object type, return as-is
  if (!typeStr.startsWith("{") || !typeStr.endsWith("}")) {
    return typeStr;
  }

  const prettified = prettifyObjectType(typeStr, indent, descriptions, prefix);

  // Remove trailing spaces from each line
  return prettified
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n");
}

/**
 * Creates a TSDoc comment line.
 */
function createTsDocComment(description: string, indentStr: string): string {
  const lines = description.split("\n");
  if (lines.length === 1) {
    return `${indentStr}/** ${description} */\n`;
  }
  return (
    [`${indentStr}/**`, ...lines.map((line) => `${indentStr} * ${line}`), `${indentStr} */`].join(
      "\n",
    ) + "\n"
  );
}

/**
 * Gets description for a field path.
 */
function getFieldDescription(
  fieldName: string,
  prefix: string,
  descriptions?: FieldDescription[],
): string | undefined {
  if (!descriptions) {
    return undefined;
  }

  const path = prefix ? `${prefix}.${fieldName}` : fieldName;
  const desc = descriptions.find((d) => d.path === path);
  return desc?.description;
}

/**
 * Parser state for object type formatting.
 */
interface ParserState {
  result: string;
  depth: number;
  inString: boolean;
  stringChar: string;
  currentFieldName: string;
  capturingFieldName: boolean;
  /**
   * Last field name seen at each depth (keyed by depth). Recording per-depth
   * (rather than a single shared value) keeps a parent field's name intact
   * while its children are parsed, so sibling object braces at the same
   * depth (e.g. union members `{ a } | { b }`) still resolve to the parent
   * field's own path instead of inheriting the first sibling's last field.
   */
  lastFieldByDepth: Record<number, string>;
  /**
   * One entry per open "{", holding the field name that owns that brace ("" if
   * none, e.g. the root object or a union member sibling). Pushed/popped in
   * lockstep with braces so it always reflects the true nesting depth.
   */
  fieldNameStack: string[];
}

/**
 * Creates initial parser state.
 */
function createParserState(): ParserState {
  return {
    result: "",
    depth: 0,
    inString: false,
    stringChar: "",
    currentFieldName: "",
    capturingFieldName: false,
    lastFieldByDepth: {},
    fieldNameStack: [],
  };
}

/**
 * Updates string literal tracking state.
 * Returns true if currently inside a string literal.
 */
function updateStringState(
  state: ParserState,
  char: string,
  typeStr: string,
  index: number,
): boolean {
  if ((char === '"' || char === "'" || char === "`") && !isEscaped(typeStr, index)) {
    if (!state.inString) {
      state.inString = true;
      state.stringChar = char;
    } else if (char === state.stringChar) {
      state.inString = false;
      state.stringChar = "";
    }
  }
  return state.inString;
}

/**
 * Handles opening brace character.
 */
function handleOpenBrace(state: ParserState, indent: string): void {
  // The field owning this brace is whatever was last seen at the *parent*
  // depth - not overwritten by a sibling brace's own inner fields.
  const ownerField = state.lastFieldByDepth[state.depth] ?? "";
  state.depth++;
  state.result += "{\n" + indent.repeat(state.depth);
  state.fieldNameStack.push(ownerField);
  state.capturingFieldName = true;
  state.currentFieldName = "";
}

/**
 * Handles closing brace character.
 */
function handleCloseBrace(state: ParserState, indent: string): void {
  // Clear this depth's last-seen field so it can't leak into a sibling
  // brace opened afterward at the parent depth.
  delete state.lastFieldByDepth[state.depth];
  state.depth--;
  state.fieldNameStack.pop();
  state.result += "\n" + indent.repeat(state.depth) + "}";
}

/**
 * Handles colon character and inserts TSDoc comment if applicable.
 */
function handleColon(
  state: ParserState,
  indent: string,
  descriptions: FieldDescription[] | undefined,
  prefix: string,
): void {
  if (state.capturingFieldName && state.currentFieldName) {
    const cleanFieldName = state.currentFieldName.replace(/\?$/, "").trim();
    const scopePath = state.fieldNameStack.filter(Boolean).join(".");
    const currentPath = [prefix, scopePath].filter(Boolean).join(".");
    const desc = getFieldDescription(cleanFieldName, currentPath, descriptions);

    if (desc) {
      const lastNewlinePos = state.result.lastIndexOf("\n");
      const beforeField = state.result.substring(0, lastNewlinePos + 1);
      const fieldPart = state.result.substring(lastNewlinePos + 1);
      state.result = beforeField + createTsDocComment(desc, indent.repeat(state.depth)) + fieldPart;
    }
    // An index signature is not a path segment: a record's value schema carries
    // its descriptions at the very path of the field holding the record, so
    // recording "[x" here would put every nested description out of reach.
    state.lastFieldByDepth[state.depth] = cleanFieldName.startsWith("[") ? "" : cleanFieldName;
  }
  state.result += ":";
  state.capturingFieldName = false;
  state.currentFieldName = "";
}

/**
 * Handles semicolon character.
 */
function handleSemicolon(state: ParserState, indent: string, typeStr: string, index: number): void {
  const remaining = typeStr.slice(index + 1).trim();
  if (remaining.startsWith("}")) {
    state.result += ";";
  } else {
    state.result += ";\n" + indent.repeat(state.depth);
    state.capturingFieldName = true;
    state.currentFieldName = "";
  }
}

/**
 * Handles space character, skipping extra spaces after newlines.
 */
function handleSpace(state: ParserState, indent: string): boolean {
  if (
    state.result.endsWith("\n" + indent.repeat(state.depth)) ||
    state.result.endsWith("{\n" + indent.repeat(state.depth))
  ) {
    return true; // Skip this space
  }
  state.result += " ";
  if (state.capturingFieldName) {
    state.currentFieldName += " ";
  }
  return false;
}

/**
 * Handles default character.
 */
function handleDefaultChar(state: ParserState, char: string): void {
  state.result += char;
  if (state.capturingFieldName) {
    state.currentFieldName += char;
  }
}

/**
 * Handles character inside a string literal.
 */
function handleStringChar(state: ParserState, char: string): void {
  state.result += char;
  if (state.capturingFieldName) {
    state.currentFieldName += char;
  }
}

/**
 * Formats an object type string with proper indentation and line breaks.
 */
function prettifyObjectType(
  typeStr: string,
  indent: string,
  descriptions?: FieldDescription[],
  prefix: string = "",
): string {
  const state = createParserState();

  for (let i = 0; i < typeStr.length; i++) {
    const char = typeStr[i];

    const inString = updateStringState(state, char, typeStr, i);

    if (inString) {
      handleStringChar(state, char);
      continue;
    }

    switch (char) {
      case "{":
        handleOpenBrace(state, indent);
        break;
      case "}":
        handleCloseBrace(state, indent);
        break;
      case ":":
        handleColon(state, indent, descriptions, prefix);
        break;
      case ";":
        handleSemicolon(state, indent, typeStr, i);
        break;
      case " ":
        handleSpace(state, indent);
        break;
      default:
        handleDefaultChar(state, char);
    }
  }

  return state.result;
}

/**
 * Formats the extraction result as input type only.
 */
export function formatInputOnly(result: ExtractResult, options: PrintOptions = {}): string {
  const { indent = "  " } = options;
  return prettifyType(result.input, indent);
}

/**
 * Formats the extraction result as output type only.
 */
export function formatOutputOnly(result: ExtractResult, options: PrintOptions = {}): string {
  const { indent = "  " } = options;
  return prettifyType(result.output, indent);
}

/**
 * Formats a single extraction result as TypeScript type declaration(s).
 *
 * @param result - The extraction result
 * @param typeName - The mapped type names
 * @param options - Declaration options
 * @returns TypeScript type declaration string
 */
export function formatAsDeclaration(
  result: ExtractResult,
  typeName: MappedTypeName,
  options: DeclarationOptions = {},
): string {
  const { inputOnly, outputOnly, mergeSame, brandStrategy } = options;
  const lines: string[] = [];
  const indent = "  ";

  const rawInput =
    brandStrategy === "local-symbol" ? localizeBrandMarkers(result.input) : result.input;
  const rawOutput =
    brandStrategy === "local-symbol" ? localizeBrandMarkers(result.output) : result.output;
  const inputFormatted = prettifyType(rawInput, indent, result.fieldDescriptions);
  const outputFormatted = prettifyType(rawOutput, indent, result.fieldDescriptions);

  // Schema-level TSDoc comment
  const schemaComment = result.description
    ? `/**\n${result.description
        .split("\n")
        .map((line) => ` * ${line}`)
        .join("\n")}\n */\n`
    : "";

  // Only export if the original schema was exported
  const exportKeyword = result.isExported ? "export " : "";

  // If mergeSame is enabled and types are identical
  if (mergeSame && result.input === result.output) {
    lines.push(`${schemaComment}${exportKeyword}type ${typeName.unifiedName} = ${inputFormatted};`);
    // Emit aliases for input/output names that differ from the unified name
    if (typeName.inputName !== typeName.unifiedName) {
      lines.push(`${exportKeyword}type ${typeName.inputName} = ${typeName.unifiedName};`);
    }
    if (
      typeName.outputName !== typeName.unifiedName &&
      typeName.outputName !== typeName.inputName
    ) {
      lines.push(`${exportKeyword}type ${typeName.outputName} = ${typeName.unifiedName};`);
    }
    return lines.join("\n");
  }

  // Input type
  if (!outputOnly) {
    lines.push(`${schemaComment}${exportKeyword}type ${typeName.inputName} = ${inputFormatted};`);
  }

  // Output type
  if (!inputOnly) {
    if (lines.length > 0) {
      lines.push("");
    }
    // Only add schema comment to output if input was not added
    const outputComment = outputOnly ? schemaComment : "";
    lines.push(`${outputComment}${exportKeyword}type ${typeName.outputName} = ${outputFormatted};`);
  }

  return lines.join("\n");
}

/**
 * Maps a promoted local's schema name, renaming it with a numeric suffix
 * until none of its input/output/unified names collide with a name already
 * reserved by an exported/imported type or an earlier promoted local.
 */
function uniqueMappedName(
  schemaName: string,
  mapName: (schemaName: string) => MappedTypeName,
  reservedNames: Set<string>,
): MappedTypeName {
  const base = mapName(schemaName);
  let mapped = base;
  let suffix = 2;
  while (
    reservedNames.has(mapped.inputName) ||
    reservedNames.has(mapped.outputName) ||
    reservedNames.has(mapped.unifiedName)
  ) {
    mapped = {
      originalName: schemaName,
      inputName: `${base.inputName}${suffix}`,
      outputName: `${base.outputName}${suffix}`,
      unifiedName: `${base.unifiedName}${suffix}`,
    };
    suffix++;
  }
  reservedNames.add(mapped.inputName);
  reservedNames.add(mapped.outputName);
  reservedNames.add(mapped.unifiedName);
  return mapped;
}

/**
 * Formats multiple extraction results as TypeScript type declarations.
 *
 * @param results - Array of extraction results
 * @param mapName - Function to map schema name to type names
 * @param options - Declaration options
 * @returns TypeScript type declarations string
 */
export function formatMultipleAsDeclarations(
  results: ExtractResult[],
  mapName: (schemaName: string) => MappedTypeName,
  options: DeclarationOptions = {},
): string {
  // Build a map of schema names to their mapped type names. Schemas declared
  // here are joined by those imported from another generated file, whose names
  // this file references without declaring them.
  const typeNameMap = new Map<string, MappedTypeName>();
  for (const result of results) {
    if (!result.isExported && !result.importedFrom) continue;
    if (typeNameMap.has(result.schemaName)) continue;
    typeNameMap.set(result.schemaName, mapName(result.schemaName));
  }

  // A non-exported, self-recursive schema reached only inline through
  // another schema still needs a name for its own recursion point - and
  // every other reference to it - to point at, so it gets a name here too
  // (formatAsDeclaration below omits `export` for it). Assigned only after
  // every exported/imported name is already reserved, so a promoted local
  // never steals a name an exported type owns; one whose own mapped name
  // collides with something already reserved (including another promoted
  // local) is disambiguated with a numeric suffix.
  //
  // Known gap: this dedups by the mapped *name*, not by the schema's own
  // (unavailable here) source file - two distinct, same-named non-exported
  // self-recursive schemas from two different files combined into one
  // `--outFile` run still collide (the second is silently skipped by the
  // `typeNameMap.has` check below, the same way two same-named *exported*
  // schemas from different files already do today). Disambiguating that
  // case would need `ExtractResult` to carry file identity, which it
  // currently does not.
  const reservedNames = new Set<string>();
  for (const mapped of typeNameMap.values()) {
    reservedNames.add(mapped.inputName);
    reservedNames.add(mapped.outputName);
    reservedNames.add(mapped.unifiedName);
  }
  for (const result of results) {
    if (!result.declaredLocally) continue;
    if (typeNameMap.has(result.schemaName)) continue;
    typeNameMap.set(result.schemaName, uniqueMappedName(result.schemaName, mapName, reservedNames));
  }

  // Pass 1: Replace schema references with correct type names. Built as one
  // simultaneous `replaceBareTypeNames` pass (rather than looping over
  // typeNameMap and calling String#replace once per entry), so that one
  // schema's own marker can never collide with another schema's
  // already-substituted mapped name mid-pass - e.g. a schema literally named
  // "Node" (self-reference marker "NodeInput") and a promoted local
  // "NodeSchema" mapped to "NodeInput" would otherwise have the second
  // substitution silently eat the first's output. `replaceBareTypeNames`
  // (shared with extractor.ts's own self-reference rewriting) also skips a
  // marker that shows up as a string literal, a property key, a method
  // name, or after a dot - a plain regex replace would corrupt those - and
  // correctly matches a marker for a schema named with a leading `$`
  // (legal in JS/TS, but not a `\b` word character).
  const markerToFinalName = new Map<string, string>();
  for (const [schemaName, mappedName] of typeNameMap) {
    markerToFinalName.set(`${schemaName}Input`, mappedName.inputName);
    markerToFinalName.set(`${schemaName}Output`, mappedName.outputName);
  }

  let fixedResults = results.map((result) => ({
    ...result,
    input: replaceBareTypeNames(result.input, markerToFinalName),
    output: replaceBareTypeNames(result.output, markerToFinalName),
  }));

  // Pass 2: When mergeSame is enabled, determine which schemas can be merged and
  // replace input/output-specific names with unified names.
  // Uses topological sort to process schemas in dependency order so that
  // transitive merges (A → B → C) are resolved in a single pass.
  if (options.mergeSame) {
    // Build dependency graph: which schemas does each schema reference?
    const deps = new Map<string, Set<string>>();
    for (const result of fixedResults) {
      const refSet = new Set<string>();
      for (const [, mapped] of typeNameMap) {
        if (mapped.inputName === mapped.unifiedName) continue;
        const inputRe = new RegExp(`\\b${escapeRegExp(mapped.inputName)}\\b`);
        const outputRe = new RegExp(`\\b${escapeRegExp(mapped.outputName)}\\b`);
        if (inputRe.test(result.input) || outputRe.test(result.output)) {
          refSet.add(mapped.inputName);
        }
      }
      deps.set(result.schemaName, refSet);
    }

    // Map inputName back to schemaName for dependency lookup
    const inputNameToSchema = new Map<string, string>();
    for (const [schemaName, mapped] of typeNameMap) {
      inputNameToSchema.set(mapped.inputName, schemaName);
    }

    // Topological sort (Kahn's algorithm)
    const inDegree = new Map<string, number>();
    const graph = new Map<string, string[]>();
    for (const result of fixedResults) {
      inDegree.set(result.schemaName, 0);
      graph.set(result.schemaName, []);
    }
    for (const [schemaName, refInputNames] of deps) {
      let count = 0;
      for (const refInputName of refInputNames) {
        const depSchema = inputNameToSchema.get(refInputName);
        // A recursive schema depends on itself, but its own merge is decided by
        // unifying those self-references - not by waiting for another schema -
        // so the self-edge must not keep it out of the topological order.
        if (depSchema && depSchema !== schemaName && graph.has(depSchema)) {
          graph.get(depSchema)!.push(schemaName);
          count++;
        }
      }
      inDegree.set(schemaName, count);
    }
    const order: string[] = [];
    const queue = [...inDegree.entries()].filter(([, d]) => d === 0).map(([n]) => n);
    while (queue.length > 0) {
      const node = queue.shift()!;
      order.push(node);
      for (const next of graph.get(node) ?? []) {
        const d = inDegree.get(next)! - 1;
        inDegree.set(next, d);
        if (d === 0) queue.push(next);
      }
    }
    // Append any remaining (cyclic) schemas at the end
    for (const result of fixedResults) {
      if (!order.includes(result.schemaName)) order.push(result.schemaName);
    }

    // Process in topological order, accumulating merged schemas. A schema can
    // appear twice - once as this file's own declaration, once as the imported
    // copy a sibling file brought along - and both describe the same types, so
    // the pass runs over one entry per name.
    const mergedSet = new Set<string>();
    const unifiedTypes = new Map<string, { input: string; output: string }>();
    for (const result of fixedResults) {
      if (!unifiedTypes.has(result.schemaName)) {
        unifiedTypes.set(result.schemaName, { input: result.input, output: result.output });
      }
    }

    for (const schemaName of order) {
      const result = unifiedTypes.get(schemaName);
      if (!result) continue;

      let { input, output } = result;

      // Apply unifications from already-determined merged schemas
      for (const mergedSchema of mergedSet) {
        const mapped = typeNameMap.get(mergedSchema);
        if (!mapped) continue;
        const escapedInput = escapeRegExp(mapped.inputName);
        const escapedOutput = escapeRegExp(mapped.outputName);
        input = input.replace(new RegExp(`\\b${escapedInput}\\b`, "g"), mapped.unifiedName);
        output = output.replace(new RegExp(`\\b${escapedOutput}\\b`, "g"), mapped.unifiedName);
      }

      const mapped = typeNameMap.get(schemaName);
      const mergeable = mapped != null && mapped.inputName !== mapped.unifiedName;

      // A recursive schema spells its own name inside itself, once per
      // direction. Those two names describe the same shape whenever everything
      // around them does, so they are unified before the comparison - otherwise
      // no recursive schema could ever merge.
      if (mergeable) {
        const selfInput = input.replace(
          new RegExp(`\\b${escapeRegExp(mapped.inputName)}\\b`, "g"),
          mapped.unifiedName,
        );
        const selfOutput = output.replace(
          new RegExp(`\\b${escapeRegExp(mapped.outputName)}\\b`, "g"),
          mapped.unifiedName,
        );
        if (selfInput === selfOutput) {
          input = selfInput;
          output = selfOutput;
        }
      }

      unifiedTypes.set(schemaName, { input, output });

      // Check if this schema is now mergeable
      if (input === output && mergeable) {
        mergedSet.add(schemaName);
      }
    }

    // Take only the unified types back, so each entry keeps its own export
    // status and descriptions.
    fixedResults = fixedResults.map((r) => ({ ...r, ...unifiedTypes.get(r.schemaName) }));
  }

  const declarations: string[] = [];

  // Generate declarations for exported schemas, and for a promoted local
  // (non-exported but declaredLocally, see the typeNameMap build above) -
  // formatAsDeclaration omits `export` for the latter based on isExported.
  // Looked up from typeNameMap (rather than calling mapName again) so a
  // promoted local whose name collided and was disambiguated is declared
  // under that same disambiguated name.
  for (const result of fixedResults) {
    if (!result.isExported && !result.declaredLocally) {
      continue;
    }
    const typeName = typeNameMap.get(result.schemaName) ?? mapName(result.schemaName);
    const declaration = formatAsDeclaration(result, typeName, options);
    declarations.push(declaration);
  }

  return declarations.join("\n\n");
}

/**
 * Local-symbol marker name for the `"local-symbol"` brand strategy. A single
 * `export declare const __brand: unique symbol;` is emitted once per
 * generated file and reused by every branded type it declares - the nominal
 * distinction between brands comes from the tag's string literal, not from
 * the symbol's identity, the same way zod's own `BRAND` marker works. It is
 * exported so a `--generate-tests` companion file can reference `typeof
 * __brand` to verify the marker against `z.output<>`.
 */
const LOCAL_BRAND_SYMBOL = "__brand";

/** Matches a TypeScript identifier character: letters, digits, `_`, or `$`. */
const WORD_CHAR = /[A-Za-z0-9_$]/;

/**
 * Rewrites every printed `BRAND<Tag>` marker to a self-contained
 * symbol-keyed property, so the output never needs to import zod's `BRAND`.
 *
 * Scans with string-literal awareness so a schema whose own literal type
 * happens to contain the text `BRAND<` (e.g. `z.literal("BRAND<Fake>")`,
 * printed as the string literal type `"BRAND<Fake>"`) is left untouched -
 * only an unquoted `BRAND<` at a word boundary is a real marker to rewrite.
 */
function localizeBrandMarkers(typeStr: string): string {
  let result = "";
  let cursor = 0;
  let inString = false;
  let stringChar = "";

  while (cursor < typeStr.length) {
    const char = typeStr[cursor];

    if ((char === '"' || char === "'" || char === "`") && !isEscaped(typeStr, cursor)) {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
      }
      result += char;
      cursor++;
      continue;
    }

    const atWordBoundary = cursor === 0 || !WORD_CHAR.test(typeStr[cursor - 1]);
    if (!inString && atWordBoundary && typeStr.startsWith("BRAND<", cursor)) {
      const tagStart = cursor + "BRAND<".length;
      const tagEnd = findBrandTagEnd(typeStr, tagStart);
      const tag = typeStr.slice(tagStart, tagEnd);
      result += `{ readonly [${LOCAL_BRAND_SYMBOL}]: ${tag} }`;
      cursor = tagEnd + 1;
      continue;
    }

    result += char;
    cursor++;
  }

  return result;
}

/**
 * Finds the `>` that closes a `BRAND<...>` marker's tag, skipping over a `>`
 * that occurs inside the tag's own string literal (e.g. a tag like `"a>b"`).
 */
function findBrandTagEnd(typeStr: string, tagStart: number): number {
  let depth = 0;
  let inString = false;
  let stringChar = "";

  for (let i = tagStart; i < typeStr.length; i++) {
    const char = typeStr[i];

    if ((char === '"' || char === "'" || char === "`") && !isEscaped(typeStr, i)) {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
      }
      continue;
    }

    if (inString) continue;

    if (char === "<") {
      depth++;
    } else if (char === ">") {
      if (depth === 0) return i;
      depth--;
    }
  }

  return typeStr.length;
}

/**
 * Checks whether a printed type contains an actual `BRAND<` marker, as
 * opposed to a plain string literal that merely contains that text (e.g.
 * `z.literal("BRAND<Fake>")`, printed as the string literal type
 * `"BRAND<Fake>"`). Shares `localizeBrandMarkers`'s string-literal-aware
 * scan rather than a plain regex, for the same reason.
 */
export function containsBrandMarker(typeStr: string): boolean {
  let inString = false;
  let stringChar = "";

  for (let cursor = 0; cursor < typeStr.length; cursor++) {
    const char = typeStr[cursor];

    if ((char === '"' || char === "'" || char === "`") && !isEscaped(typeStr, cursor)) {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
      }
      continue;
    }

    const atWordBoundary = cursor === 0 || !WORD_CHAR.test(typeStr[cursor - 1]);
    if (!inString && atWordBoundary && typeStr.startsWith("BRAND<", cursor)) {
      return true;
    }
  }

  return false;
}

/**
 * Checks if any result's *emitted* type(s) contain a printed brand marker.
 * Only scans results that actually get a declaration (exported, or a
 * promoted local - generateDeclarationFile/formatMultipleAsDeclarations skip
 * every other non-exported result entirely) and, within those, only the
 * input/output side(s) that will actually be printed for the given options.
 */
function hasBrands(results: ExtractResult[], options: DeclarationOptions = {}): boolean {
  const { inputOnly, outputOnly, mergeSame } = options;
  return results.some((r) => {
    if (!r.isExported && !r.declaredLocally) return false;
    if (mergeSame && r.input === r.output) return containsBrandMarker(r.input);
    if (outputOnly) return containsBrandMarker(r.output);
    if (inputOnly) return containsBrandMarker(r.input);
    return containsBrandMarker(r.input) || containsBrandMarker(r.output);
  });
}

/**
 * Generates a complete TypeScript declaration file content.
 *
 * @param results - Array of extraction results
 * @param mapName - Function to map schema name to type names
 * @param options - Declaration options
 * @returns Complete .d.ts or .ts file content
 */
export function generateDeclarationFile(
  results: ExtractResult[],
  mapName: (schemaName: string) => MappedTypeName,
  options: DeclarationOptions = {},
): string {
  const lines: string[] = [];
  const declarations = formatMultipleAsDeclarations(results, mapName, options);

  // Add header comment
  lines.push("// Generated by zinfer - Do not edit manually");
  lines.push("");

  // Add a brand marker declaration if any result has brands
  if (hasBrands(results, options)) {
    if (options.brandStrategy === "local-symbol") {
      lines.push(`export declare const ${LOCAL_BRAND_SYMBOL}: unique symbol;`);
    } else {
      lines.push('import type { BRAND } from "zod";');
    }
    lines.push("");
  }

  // Import the types this file references from other generated files
  const crossFileImports = crossFileImportLines(results, mapName, options, declarations);
  if (crossFileImports.length > 0) {
    lines.push(...crossFileImports);
    lines.push("");
  }

  // Add type declarations
  lines.push(declarations);
  lines.push("");

  return lines.join("\n");
}

/**
 * Builds the `import type` lines for schemas whose types another generated file
 * declares.
 *
 * Which of a schema's names are needed depends on how the declarations came out
 * - `mergeSame` collapses a reference to the unified name - so the names are
 * read back out of the rendered declarations rather than predicted.
 */
function crossFileImportLines(
  results: ExtractResult[],
  mapName: (schemaName: string) => MappedTypeName,
  options: DeclarationOptions,
  declarations: string,
): string[] {
  const { importSources } = options;
  if (!importSources || importSources.size === 0) {
    return [];
  }

  const namesByModule = new Map<string, Set<string>>();

  for (const result of results) {
    if (!result.importedFrom) continue;

    const moduleSpecifier = importSources.get(result.schemaName);
    if (!moduleSpecifier) continue;

    const mapped = mapName(result.schemaName);
    for (const typeName of new Set([mapped.unifiedName, mapped.inputName, mapped.outputName])) {
      if (!new RegExp(`\\b${escapeRegExp(typeName)}\\b`).test(declarations)) continue;

      let names = namesByModule.get(moduleSpecifier);
      if (!names) {
        names = new Set<string>();
        namesByModule.set(moduleSpecifier, names);
      }
      names.add(typeName);
    }
  }

  return [...namesByModule]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([moduleSpecifier, names]) =>
        `import type { ${[...names].sort().join(", ")} } from "${moduleSpecifier}";`,
    );
}

/**
 * Resolves `path` to its real, symlink-free form. `path` itself may not
 * exist yet (an output directory that hasn't been created), so this walks up
 * to the nearest existing ancestor, realpath's that, and re-appends the
 * not-yet-existing part unresolved.
 */
function realpathExisting(path: string): string {
  if (existsSync(path)) {
    return realpathSync(path);
  }
  const parent = dirname(path);
  if (parent === path) {
    return path;
  }
  return join(realpathExisting(parent), basename(path));
}

/**
 * Converts absolute `import("...")` paths in generated type content to relative paths,
 * and drops the qualifier entirely when it points back at this very output file.
 *
 * TypeScript's type printer may emit absolute file paths in `import()` type syntax
 * (e.g., `import("/Users/foo/bar/src/types/plugin").SomeType`).
 * These must be converted to relative paths so the output is portable across machines.
 *
 * A schema typed against a type this file previously generated for itself (the
 * standard `z.ZodType<T>` pattern for a recursive schema, where `T` is imported
 * from the tool's own prior output) can carry references to *sibling* schemas
 * that this same run also declares in this very file - printed as
 * `import("<this file>").Sibling` only because the field's printing location
 * doesn't see `Sibling` locally, not because it truly lives elsewhere. Once the
 * qualifier resolves to this output file's own path, the reference is collapsed
 * to bare, matching every other same-file reference already printed without one.
 *
 * @param content - The generated file content
 * @param outputFilePath - Absolute path to the output file
 * @returns Content with absolute import paths replaced by relative paths
 */
export function relativizeImportPaths(content: string, outputFilePath: string): string {
  // Realpath'd so a symlinked output directory (e.g. one built from an
  // absolute path the caller passed through unresolved) lines up with the
  // already-realpath'd absolute import paths extractor.ts produces - both
  // must be resolved from the same symlink base for `relative()` below to
  // compute a short, correct path instead of walking up through the root.
  const outputDir = realpathExisting(dirname(outputFilePath));
  const selfSpecifier = `./${basename(outputFilePath).replace(/\.d\.ts$|\.ts$/, "")}`;

  return content.replace(/import\("([^"]+)"\)(\.?)/g, (_match, importPath: string, dot: string) => {
    if (!isAbsolute(importPath)) {
      return _match;
    }
    let rel = relative(outputDir, importPath);
    if (!rel.startsWith(".")) {
      rel = "./" + rel;
    }
    // Only collapse a genuine qualified access (`import("...").Sibling`), never
    // a bare `import("...")` on its own (e.g. `typeof import("...")`) - dropping
    // that would leave a dangling keyword with nothing after it.
    if (rel === selfSpecifier && dot === ".") {
      return "";
    }
    return `import("${rel}")${dot}`;
  });
}
