import {
  SyntaxKind,
  isCallExpression,
  isIdentifier,
  isPropertyAccessExpression,
} from "@typescript/native-preview/unstable/ast";
import type {
  CallExpression,
  Expression,
  GetAccessorDeclaration,
  Node,
  SourceFile,
  VariableStatement,
} from "@typescript/native-preview/unstable/ast";
import { findFirstDescendantByKind, getDescendantsOfKind } from "./tsgo-ast-utils.js";

/**
 * GetterResolver, implemented against the tsgo/Corsa `ast` API. See issue #200.
 */
export interface GetterFieldInfo {
  refSchema: string;
  isArray: boolean;
  isRecord: boolean;
  isOptional: boolean;
  isSelfRef: boolean;
}

export type GetterFieldMap = Map<string, Map<string, GetterFieldInfo>>;

export class GetterResolver {
  analyzeGetterFields(sourceFile: SourceFile, schemaNames?: Set<string>): GetterFieldMap {
    const result: GetterFieldMap = new Map();

    for (const statement of sourceFile.statements) {
      if (statement.kind !== SyntaxKind.VariableStatement) continue;
      for (const decl of (statement as VariableStatement).declarationList.declarations) {
        const schemaName = decl.name.getText(sourceFile);
        if (schemaNames && !schemaNames.has(schemaName)) continue;

        const init = decl.initializer;
        if (!init) continue;

        const fieldMap = this.extractGetterFieldsFromAST(init, schemaName, sourceFile);

        if (fieldMap.size > 0) {
          result.set(schemaName, fieldMap);
        }
      }
    }

    return result;
  }

  private extractGetterFieldsFromAST(
    node: Node,
    schemaName: string,
    sourceFile: SourceFile,
  ): Map<string, GetterFieldInfo> {
    const fieldMap = new Map<string, GetterFieldInfo>();

    const getters = getDescendantsOfKind(node, SyntaxKind.GetAccessor) as GetAccessorDeclaration[];

    for (const getter of getters) {
      const fieldName = getter.name.getText(sourceFile);
      const body = getter.body;
      if (!body) continue;

      const returnStmt = findFirstDescendantByKind(body, SyntaxKind.ReturnStatement) as
        | { expression?: Expression }
        | undefined;
      if (!returnStmt) continue;

      const returnExpr = returnStmt.expression;
      if (!returnExpr) continue;

      const info = this.parseReturnExpressionAST(returnExpr, schemaName, sourceFile);
      if (info) {
        fieldMap.set(fieldName, info);
      }
    }

    return fieldMap;
  }

  private parseReturnExpressionAST(
    expr: Node,
    schemaName: string,
    sourceFile: SourceFile,
  ): GetterFieldInfo | null {
    let isArray = false;
    let isRecord = false;
    let isOptional = false;
    let refSchema: string | null = null;

    let currentExpr = expr;
    while (isCallExpression(currentExpr)) {
      const callExpr = currentExpr as CallExpression;
      const exprNode = callExpr.expression;

      if (isPropertyAccessExpression(exprNode)) {
        const methodName = exprNode.name.getText(sourceFile);
        const baseExpr = exprNode.expression;

        if (methodName === "optional" || methodName === "nullable") {
          isOptional = true;
          currentExpr = baseExpr;
          continue;
        }

        if (methodName === "array" && isIdentifier(baseExpr)) {
          const baseName = baseExpr.getText(sourceFile);
          if (baseName !== "z") {
            isArray = true;
            refSchema = baseName;
            break;
          }
        }

        if (isIdentifier(baseExpr) && baseExpr.getText(sourceFile) === "z") {
          const args = callExpr.arguments;

          if (methodName === "array" && args.length > 0) {
            isArray = true;
            refSchema = this.extractSchemaRef(args[0], sourceFile);
            break;
          }

          if (methodName === "record" && args.length >= 2) {
            isRecord = true;
            refSchema = this.extractSchemaRef(args[1], sourceFile);
            break;
          }
        }
      }

      break;
    }

    if (!refSchema && isIdentifier(currentExpr)) {
      refSchema = currentExpr.getText(sourceFile);
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

  private extractSchemaRef(node: Node, sourceFile: SourceFile): string | null {
    if (isIdentifier(node)) {
      return node.getText(sourceFile);
    }
    return null;
  }

  resolveAnyTypes(
    typeStr: string,
    getterFields: Map<string, GetterFieldInfo>,
    typeName: string,
  ): string {
    let result = typeStr;

    for (const [fieldName, info] of getterFields) {
      if (!info.isSelfRef) {
        continue;
      }

      if (info.isRecord) {
        result = this.replaceRecordAny(result, fieldName, typeName);
      }

      result = this.replaceFieldAny(result, fieldName, typeName, info.isArray);
    }

    return result;
  }

  private replaceRecordAny(typeStr: string, fieldName: string, typeName: string): string {
    const fieldPatterns = [`${fieldName}: {`, `${fieldName}?: {`];
    const indexSigPattern = "[x: string]:";

    for (const pattern of fieldPatterns) {
      let idx = typeStr.indexOf(pattern);
      while (idx !== -1) {
        const afterBrace = idx + pattern.length;
        const indexSigStart = typeStr.indexOf(indexSigPattern, afterBrace);

        if (indexSigStart !== -1 && indexSigStart < afterBrace + 20) {
          const colonPos = indexSigStart + indexSigPattern.length;
          let scanPos = colonPos;
          while (scanPos < typeStr.length && /\s/.test(typeStr[scanPos])) {
            scanPos++;
          }

          if (typeStr.substring(scanPos, scanPos + 3) === "any") {
            const anyStart = scanPos;
            const anyEnd = anyStart + 3;
            typeStr = typeStr.substring(0, anyStart) + typeName + typeStr.substring(anyEnd);
          }
        }

        idx = typeStr.indexOf(pattern, idx + 1);
      }
    }

    return typeStr;
  }

  private replaceFieldAny(
    typeStr: string,
    fieldName: string,
    typeName: string,
    isArray: boolean,
  ): string {
    const fieldPatterns = [`${fieldName}: `, `${fieldName}?: `];

    for (const pattern of fieldPatterns) {
      let idx = typeStr.indexOf(pattern);
      while (idx !== -1) {
        const valueStart = idx + pattern.length;
        const restOfType = typeStr.substring(valueStart);

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
          const afterAny = typeStr.substring(anyIdx + 3);
          const hasArrayBrackets = afterAny.startsWith("[]");

          let replacement = typeName;
          if (isArray || hasArrayBrackets) {
            replacement = `${typeName}[]`;
          }

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

  hasSelfReferences(getterFields: Map<string, GetterFieldInfo>): boolean {
    return Array.from(getterFields.values()).some((info) => info.isSelfRef);
  }
}
