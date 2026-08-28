import { SourceFile, SyntaxKind, Node, CallExpression, PropertyAccessExpression } from "ts-morph";
import { escapeRegExp } from "./regexp.js";
import { isEscaped } from "./string-scan.js";

/**
 * Information about a getter field in a z.object schema.
 */
export interface GetterFieldInfo {
  /** Referenced schema name */
  refSchema: string;
  /** Whether the reference is wrapped in z.array() */
  isArray: boolean;
  /** Whether the reference is wrapped in z.record() */
  isRecord: boolean;
  /** Whether the field is optional (.optional()) */
  isOptional: boolean;
  /** Whether the field is nullable (.nullable()) */
  isNullable: boolean;
  /** Whether this is a self-reference */
  isSelfRef: boolean;
}

/**
 * Mapping of schema name to its getter field information.
 */
export type GetterFieldMap = Map<string, Map<string, GetterFieldInfo>>;

/**
 * Detects and resolves getter-based recursive patterns in Zod schemas.
 */
export class GetterResolver {
  /**
   * Analyzes a source file to find getter field mappings.
   *
   * @param sourceFile - The ts-morph SourceFile to analyze
   * @returns Map of schema name to field info
   */
  analyzeGetterFields(sourceFile: SourceFile, schemaNames?: Set<string>): GetterFieldMap {
    const result: GetterFieldMap = new Map();

    const statements = sourceFile.getVariableStatements();
    for (const stmt of statements) {
      for (const decl of stmt.getDeclarations()) {
        const schemaName = decl.getName();
        if (schemaNames && !schemaNames.has(schemaName)) continue;

        const init = decl.getInitializer();
        if (!init) continue;

        const fieldMap = this.extractGetterFieldsFromAST(init, schemaName);

        if (fieldMap.size > 0) {
          result.set(schemaName, fieldMap);
        }
      }
    }

    return result;
  }

  /**
   * Extracts getter field info from AST nodes.
   */
  private extractGetterFieldsFromAST(node: Node, schemaName: string): Map<string, GetterFieldInfo> {
    const fieldMap = new Map<string, GetterFieldInfo>();

    // Find all getter declarations within the node
    const getters = node.getDescendantsOfKind(SyntaxKind.GetAccessor);

    for (const getter of getters) {
      const fieldName = getter.getName();
      const body = getter.getBody();
      if (!body) continue;

      // Find return statement
      const returnStmt = body.getFirstDescendantByKind(SyntaxKind.ReturnStatement);
      if (!returnStmt) continue;

      const returnExpr = returnStmt.getExpression();
      if (!returnExpr) continue;

      const info = this.parseReturnExpressionAST(returnExpr, schemaName);
      if (info) {
        fieldMap.set(fieldName, info);
      }
    }

    return fieldMap;
  }

  /**
   * Parses the return expression AST to extract schema reference info.
   */
  private parseReturnExpressionAST(expr: Node, schemaName: string): GetterFieldInfo | null {
    let isArray = false;
    let isRecord = false;
    let isOptional = false;
    let isNullable = false;
    let refSchema: string | null = null;

    // Unwrap method chains like .optional(), .nullable(), .array()
    let currentExpr = expr;
    while (Node.isCallExpression(currentExpr)) {
      const callExpr = currentExpr as CallExpression;
      const exprNode = callExpr.getExpression();

      if (Node.isPropertyAccessExpression(exprNode)) {
        const propAccess = exprNode as PropertyAccessExpression;
        const methodName = propAccess.getName();
        const baseExpr = propAccess.getExpression();

        // Check for .optional() or .nullable() on a schema
        if (methodName === "optional" || methodName === "nullable") {
          if (methodName === "optional") isOptional = true;
          else isNullable = true;
          currentExpr = baseExpr;
          continue;
        }

        // Check for SchemaName.array() pattern
        if (methodName === "array" && Node.isIdentifier(baseExpr)) {
          const baseName = baseExpr.getText();
          if (baseName !== "z") {
            isArray = true;
            refSchema = baseName;
            break;
          }
        }

        // Check for z.array(SchemaName) or z.record(key, SchemaName)
        if (Node.isIdentifier(baseExpr) && baseExpr.getText() === "z") {
          const args = callExpr.getArguments();

          if (methodName === "array" && args.length > 0) {
            isArray = true;
            refSchema = this.extractSchemaRef(args[0]);
            break;
          }

          if (methodName === "record" && args.length >= 2) {
            isRecord = true;
            refSchema = this.extractSchemaRef(args[1]);
            break;
          }
        }
      }

      break;
    }

    // If we haven't found a ref yet, check if currentExpr is an identifier
    if (!refSchema && Node.isIdentifier(currentExpr)) {
      refSchema = currentExpr.getText();
    }

    if (!refSchema) {
      return null;
    }

    return {
      refSchema,
      isArray,
      isRecord,
      isOptional,
      isNullable,
      isSelfRef: refSchema === schemaName,
    };
  }

  /**
   * Extracts schema reference from an argument node.
   */
  private extractSchemaRef(node: Node): string | null {
    if (Node.isIdentifier(node)) {
      return node.getText();
    }
    return null;
  }

  /**
   * Replaces the placeholders a recursive getter leaves behind.
   *
   * TypeScript cannot infer a getter that refers back to the schema it belongs
   * to, so the entry surfaces as `any` - or, on the input side of an annotated
   * getter, as `unknown`, since `z.ZodType<Output>` leaves its `Input` parameter
   * at its `unknown` default. Both are rebuilt here from what the getter's AST
   * actually says.
   *
   * When the getter carries an explicit return type annotation, TypeScript gets
   * one level further before giving up, so the printed type holds a full inline
   * copy of the schema whose innermost recursion point is the placeholder. That
   * copy says nothing the self-reference does not, so it is collapsed away too -
   * see `collapseInlinedCopies`.
   *
   * @param typeStr - The extracted type string with placeholders
   * @param getterFields - Map of field name to getter field info
   * @param typeName - The generated type name to use for self-references
   * @param options - Set `collapseInlinedCopies: false` to keep the inline copy,
   *   which is what callers that have no name to point at have to do
   * @returns The resolved type string with proper self-references
   */
  resolveAnyTypes(
    typeStr: string,
    getterFields: Map<string, GetterFieldInfo>,
    typeName: string,
    options: { collapseInlinedCopies?: boolean } = {},
  ): string {
    const { collapseInlinedCopies = true } = options;
    const selfRefFields = [...getterFields].filter(([, info]) => info.isSelfRef);
    const selfRefNames = selfRefFields.map(([fieldName]) => fieldName);

    let result = typeStr;
    for (const [fieldName, info] of selfRefFields) {
      result = this.replaceFieldPlaceholder(
        result,
        fieldName,
        typeName,
        info,
        collapseInlinedCopies ? selfRefNames : [],
      );
    }

    return result;
  }

  /**
   * Rewrites every recursive occurrence of a field to the getter's real type.
   *
   * A field qualifies when its printed type is a placeholder, or - when
   * `collapsibleFields` is given - when it is an inline copy of the schema,
   * recognised by a placeholder for one of those fields somewhere inside it.
   */
  private replaceFieldPlaceholder(
    typeStr: string,
    fieldName: string,
    typeName: string,
    info: GetterFieldInfo,
    collapsibleFields: string[],
  ): string {
    let result = typeStr;
    let searchFrom = 0;

    for (;;) {
      const field = findFieldValue(result, fieldName, searchFrom);
      if (!field) return result;

      const value = result.slice(field.valueStart, field.valueEnd);
      const rewritten = rewriteRecursiveValue(value, typeName, info, collapsibleFields);
      if (rewritten === undefined) {
        searchFrom = field.valueStart;
        continue;
      }

      result = result.slice(0, field.valueStart) + rewritten + result.slice(field.valueEnd);
      searchFrom = field.valueStart + rewritten.length;
    }
  }

  /**
   * Checks if a schema has getter-based self-references.
   */
  hasSelfReferences(getterFields: Map<string, GetterFieldInfo>): boolean {
    return Array.from(getterFields.values()).some((info) => info.isSelfRef);
  }
}

/** A printed type TypeScript fell back to at a recursion point. */
const PLACEHOLDER = /^(?:any|unknown)(\[\])?$/;

/** An index signature whose value TypeScript gave up on. */
const INDEX_SIGNATURE_PLACEHOLDER = /^(\{\s*\[x: string\]:\s*)(?:any|unknown)(\s*;?\s*\})$/;

/**
 * Rewrites a recursive getter field's printed type, or returns undefined when
 * the type is neither a placeholder nor an inline copy of the schema.
 *
 * Only the recursion point itself is rewritten: a trailing `| null` and/or
 * `| undefined` union (from `.nullable()`/`.optional()` on the value), and a
 * `readonly` modifier (on the key), describe something other than the
 * recursion point's own shape, so both are carried over untouched.
 */
function rewriteRecursiveValue(
  value: string,
  typeName: string,
  info: GetterFieldInfo,
  collapsibleFields: string[],
): string | undefined {
  const nullableOptionalSuffix = /(?:\s*\|\s*(?:null|undefined))+\s*$/.exec(value);
  const core = nullableOptionalSuffix ? value.slice(0, nullableOptionalSuffix.index) : value;
  const suffix = nullableOptionalSuffix ? value.slice(nullableOptionalSuffix.index) : "";

  const readonlyPrefix = /^readonly\s+/.exec(core)?.[0] ?? "";
  const bare = core.slice(readonlyPrefix.length).trim();

  if (PLACEHOLDER.test(bare)) {
    const printedArray = bare.endsWith("[]");
    const replacement = buildReplacementType(typeName, info, printedArray);
    return readonlyPrefix + restoreMissingNull(replacement, info, suffix) + suffix;
  }

  // An index signature the getter's AST already explains: only its value is
  // unknown, so the printed braces are kept exactly as they are.
  const indexSignature = INDEX_SIGNATURE_PLACEHOLDER.exec(bare);
  if (indexSignature) {
    const replacement = indexSignature[1] + typeName + indexSignature[2];
    return readonlyPrefix + restoreMissingNull(replacement, info, suffix) + suffix;
  }

  if (isInlinedRecursiveCopy(bare, collapsibleFields)) {
    const replacement = buildReplacementType(typeName, info);
    return readonlyPrefix + restoreMissingNull(replacement, info, suffix) + suffix;
  }

  return undefined;
}

/**
 * Appends `| null` to a rebuilt recursion-point type when the getter's AST
 * says `.nullable()` but the suffix already carried over from the printed
 * placeholder does not mention `null`.
 *
 * On an annotated getter's Input side, Zod 4's `ZodType<Output, Input =
 * unknown>` default means `.nullable()` prints as bare `unknown` - TypeScript
 * collapses `unknown | null` down to `unknown` - so there is no `| null` left
 * in the placeholder text for `rewriteRecursiveValue` to preserve. Only the
 * AST still knows the value is nullable, so it has to be added back in here.
 */
function restoreMissingNull(replacement: string, info: GetterFieldInfo, suffix: string): string {
  if (info.isNullable && !/\bnull\b/.test(suffix)) {
    return `${replacement} | null`;
  }
  return replacement;
}

/**
 * Builds the type a getter field should have, from the shape its AST describes.
 *
 * @param printedArray - Whether the placeholder itself was printed as an array,
 *   which the AST may not say (e.g. a reference already wrapped elsewhere)
 */
function buildReplacementType(
  typeName: string,
  info: GetterFieldInfo,
  printedArray = false,
): string {
  if (info.isArray || printedArray) return `${typeName}[]`;
  if (info.isRecord) return `{ [x: string]: ${typeName}; }`;
  return typeName;
}

/**
 * Checks whether a printed field type is nothing but a placeholder.
 *
 * An annotated optional getter prints its placeholder as `any | undefined`,
 * and an annotated nullable-and-optional getter as `any | null | undefined`:
 * the key may be absent (`.optional()`) and/or the value may be `null`
 * (`.nullable()`), even though TypeScript cannot tell what the value itself
 * holds. Neither suffix carries information about the placeholder's own
 * shape, so both are ignored here.
 */
function isAnyPlaceholder(value: string): boolean {
  const normalized = value
    .trim()
    .replace(/^readonly\s+/, "")
    .replace(/(?:\s*\|\s*(?:null|undefined))+$/, "")
    .trim();
  return PLACEHOLDER.test(normalized) || INDEX_SIGNATURE_PLACEHOLDER.test(normalized);
}

/**
 * Checks whether a printed field type is an inline copy of the schema it belongs
 * to, rather than the schema's own printed shape.
 *
 * The copy always bottoms out in a placeholder for one of the schema's recursive
 * getter fields - that placeholder is precisely where TypeScript gave up - so
 * finding one inside the value identifies the whole value as an unfolded step of
 * the recursion.
 */
function isInlinedRecursiveCopy(value: string, selfRefFields: string[]): boolean {
  return selfRefFields.some((fieldName) => {
    let searchFrom = 0;
    for (;;) {
      const nested = findFieldValue(value, fieldName, searchFrom);
      if (!nested) return false;
      if (isAnyPlaceholder(value.slice(nested.valueStart, nested.valueEnd))) return true;
      searchFrom = nested.valueStart;
    }
  });
}

/**
 * Locates a field and its type inside a printed object type.
 *
 * @returns Offsets for the end of the field name and the bounds of its type,
 *   or undefined when the field does not occur after `searchFrom`
 */
function findFieldValue(
  typeStr: string,
  fieldName: string,
  searchFrom: number,
): { valueStart: number; valueEnd: number } | undefined {
  const pattern = new RegExp(`(?:^|[{;|(]\\s*)${escapeRegExp(fieldName)}\\??:\\s*`, "g");
  pattern.lastIndex = searchFrom;

  const match = pattern.exec(typeStr);
  if (!match) return undefined;

  const valueStart = match.index + match[0].length;

  return { valueStart, valueEnd: findValueEnd(typeStr, valueStart) };
}

/**
 * Finds where a field's type ends, tracking nesting and string literals.
 */
function findValueEnd(typeStr: string, valueStart: number): number {
  let depth = 0;
  let index = valueStart;
  let inString = false;
  let stringChar = "";

  while (index < typeStr.length) {
    const char = typeStr[index];
    const prevChar = typeStr[index - 1];

    if ((char === '"' || char === "'" || char === "`") && !isEscaped(typeStr, index)) {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
        stringChar = "";
      }
    }

    if (!inString) {
      if (char === "{" || char === "[" || char === "(" || char === "<") {
        depth++;
      } else if (char === "}" || char === "]" || char === ")" || char === ">") {
        // The `>` of an arrow type closes nothing - a function type's `=>`
        // would otherwise cut the value short.
        if (char === ">" && prevChar === "=") {
          index++;
          continue;
        }
        if (depth === 0) break;
        depth--;
      } else if (char === ";" && depth === 0) {
        break;
      }
    }
    index++;
  }

  return index;
}
