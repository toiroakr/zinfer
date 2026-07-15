import {
  SyntaxKind,
  isCallExpression,
  isLiteralTypeNode,
  isObjectLiteralExpression,
  isPropertyAccessExpression,
  isPropertyAssignment,
  isStringLiteral,
} from "@typescript/native-preview/unstable/ast";
import type {
  CallExpression,
  Node,
  SourceFile,
  VariableStatement,
} from "@typescript/native-preview/unstable/ast";
import type { BrandInfo } from "./types.js";

/**
 * BrandDetector, implemented against the tsgo/Corsa `ast` API. See issue #200.
 */
export type SchemaBrandMap = Map<string, BrandInfo[]>;

export class BrandDetector {
  detectBrands(sourceFile: SourceFile, schemaNames: Set<string>): SchemaBrandMap {
    const result: SchemaBrandMap = new Map();

    for (const statement of sourceFile.statements) {
      if (statement.kind !== SyntaxKind.VariableStatement) continue;
      for (const decl of (statement as VariableStatement).declarationList.declarations) {
        const schemaName = decl.name.getText(sourceFile);
        if (!schemaNames.has(schemaName)) continue;

        const init = decl.initializer;
        if (!init) continue;

        if (!init.getText(sourceFile).includes(".brand")) continue;

        const brands = this.findBrandsInNode(init, "", sourceFile);
        if (brands.length > 0) {
          result.set(schemaName, brands);
        }
      }
    }

    return result;
  }

  private findBrandsInNode(node: Node, currentPath: string, sourceFile: SourceFile): BrandInfo[] {
    const brands: BrandInfo[] = [];

    if (isCallExpression(node)) {
      const brandInfo = this.extractBrandFromCall(node, currentPath, sourceFile);
      if (brandInfo) {
        brands.push(brandInfo);
      }

      const expr = node.expression;
      if (isPropertyAccessExpression(expr)) {
        const base = expr.expression;
        brands.push(...this.findBrandsInNode(base, currentPath, sourceFile));
      }

      for (const arg of node.arguments) {
        brands.push(...this.findBrandsInNode(arg, currentPath, sourceFile));
      }
    }

    if (isObjectLiteralExpression(node)) {
      for (const prop of node.properties) {
        if (isPropertyAssignment(prop)) {
          const fieldName = prop.name.getText(sourceFile);
          const fieldPath = currentPath ? `${currentPath}.${fieldName}` : fieldName;
          const initializer = prop.initializer;
          if (initializer) {
            brands.push(...this.findBrandsInNode(initializer, fieldPath, sourceFile));
          }
        }
      }
    }

    if (isPropertyAccessExpression(node)) {
      const base = node.expression;
      brands.push(...this.findBrandsInNode(base, currentPath, sourceFile));
    }

    return brands;
  }

  private extractBrandFromCall(
    node: CallExpression,
    fieldPath: string,
    sourceFile: SourceFile,
  ): BrandInfo | null {
    const expr = node.expression;
    if (!isPropertyAccessExpression(expr)) {
      return null;
    }

    const methodName = expr.name.getText(sourceFile);
    if (methodName !== "brand") {
      return null;
    }

    const typeArgs = node.typeArguments;
    if (!typeArgs || typeArgs.length === 0) {
      return null;
    }

    const typeArg = typeArgs[0];
    const brandName = this.extractBrandName(typeArg, sourceFile);
    if (!brandName) {
      return null;
    }

    return {
      brandName,
      fieldPath,
    };
  }

  private extractBrandName(node: Node, sourceFile: SourceFile): string | null {
    if (isLiteralTypeNode(node)) {
      const literal = node.literal;
      if (isStringLiteral(literal)) {
        return literal.text;
      }
    }

    const text = node.getText(sourceFile);
    const match = text.match(/^["'](.+)["']$/);
    if (match) {
      return match[1];
    }

    return null;
  }
}
