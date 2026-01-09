import { SourceFile, SyntaxKind, Node, CallExpression, PropertyAccessExpression } from "ts-morph";

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
  /** Whether the field is optional (.optional() or .nullable()) */
  isOptional: boolean;
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
  analyzeGetterFields(sourceFile: SourceFile): GetterFieldMap {
    const result: GetterFieldMap = new Map();

    const statements = sourceFile.getVariableStatements();
    for (const stmt of statements) {
      for (const decl of stmt.getDeclarations()) {
        const schemaName = decl.getName();
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
          isOptional = true;
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
   * Resolves `any` types in extracted type string by replacing with self-references.
   * Uses structured parsing instead of regex.
   *
   * @param typeStr - The extracted type string with `any` placeholders
   * @param schemaName - The schema name being extracted
   * @param getterFields - Map of field name to getter field info
   * @param typeName - The generated type name to use for self-references
   * @returns The resolved type string with proper self-references
   */
  resolveAnyTypes(
    typeStr: string,
    _schemaName: string,
    getterFields: Map<string, GetterFieldInfo>,
    typeName: string,
  ): string {
    let result = typeStr;

    for (const [fieldName, info] of getterFields) {
      if (!info.isSelfRef) {
        continue;
      }

      // For z.record pattern: { [x: string]: any } -> { [x: string]: TypeName }
      if (info.isRecord) {
        result = this.replaceRecordAny(result, fieldName, typeName);
      }

      // Handle any field (array or single reference)
      result = this.replaceFieldAny(result, fieldName, typeName, info.isArray);
    }

    return result;
  }

  /**
   * Replaces any type in a record field.
   */
  private replaceRecordAny(typeStr: string, fieldName: string, typeName: string): string {
    // Find "fieldName: { [x: string]: any" or "fieldName?: { [x: string]: any"
    const fieldPatterns = [`${fieldName}: {`, `${fieldName}?: {`];

    for (const pattern of fieldPatterns) {
      let idx = typeStr.indexOf(pattern);
      while (idx !== -1) {
        // Find the index signature pattern
        const afterBrace = idx + pattern.length;
        const indexSigStart = typeStr.indexOf("[x: string]:", afterBrace);

        if (indexSigStart !== -1 && indexSigStart < afterBrace + 20) {
          const colonPos = indexSigStart + "[x: string]:".length;
          // Find "any" after the colon
          const afterColon = typeStr.substring(colonPos).trimStart();
          if (afterColon.startsWith("any")) {
            const anyStart = colonPos + typeStr.substring(colonPos).indexOf("any");
            const anyEnd = anyStart + 3;
            typeStr = typeStr.substring(0, anyStart) + typeName + typeStr.substring(anyEnd);
          }
        }

        idx = typeStr.indexOf(pattern, idx + 1);
      }
    }

    return typeStr;
  }

  /**
   * Replaces any type in a regular field.
   */
  private replaceFieldAny(
    typeStr: string,
    fieldName: string,
    typeName: string,
    isArray: boolean,
  ): string {
    // Find "fieldName: any" or "fieldName?: any" patterns
    const fieldPatterns = [`${fieldName}: `, `${fieldName}?: `];

    for (const pattern of fieldPatterns) {
      let idx = typeStr.indexOf(pattern);
      while (idx !== -1) {
        const valueStart = idx + pattern.length;
        const restOfType = typeStr.substring(valueStart);

        // Check for "readonly any" or just "any"
        let anyIdx = -1;
        let prefixLen = 0;

        if (restOfType.startsWith("readonly ")) {
          prefixLen = "readonly ".length;
          if (restOfType.substring(prefixLen).startsWith("any")) {
            anyIdx = valueStart + prefixLen;
          }
        } else if (restOfType.startsWith("any")) {
          anyIdx = valueStart;
        }

        if (anyIdx !== -1) {
          // Check what comes after "any"
          const afterAny = typeStr.substring(anyIdx + 3);
          const hasArrayBrackets = afterAny.startsWith("[]");

          // Build replacement
          let replacement = typeName;
          if (isArray || hasArrayBrackets) {
            replacement = `${typeName}[]`;
          }

          // Calculate end position (include [] if present)
          let endPos = anyIdx + 3;
          if (hasArrayBrackets) {
            endPos += 2;
          }

          typeStr = typeStr.substring(0, anyIdx) + replacement + typeStr.substring(endPos);
        }

        idx = typeStr.indexOf(pattern, idx + 1);
      }
    }

    return typeStr;
  }

  /**
   * Checks if a schema has getter-based self-references.
   */
  hasSelfReferences(getterFields: Map<string, GetterFieldInfo>): boolean {
    return Array.from(getterFields.values()).some((info) => info.isSelfRef);
  }
}
