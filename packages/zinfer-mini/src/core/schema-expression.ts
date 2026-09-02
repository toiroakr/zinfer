import { Node } from "ts-morph";
import {
  ZodMiniBindings,
  ZOD_MINI_ARRAY_BUILDERS,
  ZOD_MINI_NULLABLE_WRAPPERS,
  ZOD_MINI_OPTIONAL_KEY_WRAPPERS,
  ZOD_MINI_OPTIONAL_WRAPPERS,
  ZOD_MINI_RECORD_BUILDERS,
} from "./zod-mini-bindings.js";

/**
 * A reference from one schema expression to a named schema.
 */
export interface SchemaExpressionRef {
  /** The referenced schema name */
  refSchema: string;
  /** Whether the reference is wrapped in `z.array()` */
  isArray: boolean;
  /** Whether the reference is the value schema of a `z.record()` */
  isRecord: boolean;
  /**
   * Whether the reference's key may be omitted entirely (`z.optional()` /
   * `z.exactOptional()` / `z.nullish()`). Distinct from `isNullable`: zod/mini's
   * `z.nullable()` widens the value's type without making the key itself
   * optional.
   */
  isOptional: boolean;
  /** Whether the reference's value type includes `null` (`z.nullable()` / `z.nullish()`) */
  isNullable: boolean;
}

/**
 * Strips wrappers that do not change which expression is evaluated
 * (`as`, `satisfies`, parentheses, type assertions).
 */
export function unwrapExpression(node: Node): Node {
  let current = node;
  while (
    Node.isAsExpression(current) ||
    Node.isSatisfiesExpression(current) ||
    Node.isParenthesizedExpression(current) ||
    Node.isTypeAssertion(current)
  ) {
    current = current.getExpression();
  }
  return current;
}

/**
 * Resolves which named schema a schema expression ultimately points at.
 *
 * zod/mini composes schemas by wrapping them in function calls rather than by
 * chaining methods, so the wrappers are peeled off one call at a time:
 * `z.optional(z.array(AddressSchema))` resolves to `AddressSchema` as an
 * optional array.
 *
 * Returns null when the expression is not (a wrapper around) a reference to a
 * schema accepted by `isCandidateRef`. `z.pipe(a, b)` composes two schemas
 * (not a schema plus non-schema actions the way Valibot's `pipe` does) and is
 * treated as type-changing here - like `transform`, its result is no longer
 * simply `a`'s type, so references aren't tracked through it.
 *
 * @param node - The expression to analyze
 * @param bindings - How the analyzed file refers to zod/mini's exports
 * @param isCandidateRef - Predicate selecting the identifiers that count as references
 */
export function analyzeSchemaExpression(
  node: Node,
  bindings: ZodMiniBindings,
  isCandidateRef: (name: string) => boolean,
): SchemaExpressionRef | null {
  let isArray = false;
  let isRecord = false;
  let isOptional = false;
  let isNullable = false;
  let current = unwrapExpression(node);

  for (;;) {
    if (Node.isIdentifier(current)) {
      const name = current.getText();
      if (!isCandidateRef(name)) return null;
      return { refSchema: name, isArray, isRecord, isOptional, isNullable };
    }

    if (!Node.isCallExpression(current)) return null;

    const callName = bindings.getCallName(current);
    if (!callName) return null;

    const args = current.getArguments();

    if (ZOD_MINI_OPTIONAL_WRAPPERS.has(callName)) {
      if (args.length === 0) return null;
      // A wrapper below a collection widens the element, not the field, and
      // the isOptional/isNullable flags below have nowhere to attach that
      // distinction to (they describe the field, not "some element inside
      // it") - z.array(z.nullable(X)) is "array of nullable X", not
      // "nullable array of X". Leave it inlined, same as the array/record
      // double-nesting case below.
      if (isArray || isRecord) return null;
      if (ZOD_MINI_OPTIONAL_KEY_WRAPPERS.has(callName)) isOptional = true;
      if (ZOD_MINI_NULLABLE_WRAPPERS.has(callName)) isNullable = true;
      current = unwrapExpression(args[0]);
      continue;
    }

    if (ZOD_MINI_ARRAY_BUILDERS.has(callName)) {
      // Nested collections (array of arrays, array of records) have no place to
      // put the named reference, so leave them inlined.
      if (args.length === 0 || isArray || isRecord) return null;
      isArray = true;
      current = unwrapExpression(args[0]);
      continue;
    }

    if (ZOD_MINI_RECORD_BUILDERS.has(callName)) {
      if (args.length < 2 || isArray || isRecord) return null;
      isRecord = true;
      current = unwrapExpression(args[1]);
      continue;
    }

    return null;
  }
}
