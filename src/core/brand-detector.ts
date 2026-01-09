import { SourceFile, Node, CallExpression } from "ts-morph";
import type { BrandInfo } from "./types.js";

/**
 * Map of schema name to its brand information.
 */
export type SchemaBrandMap = Map<string, BrandInfo[]>;

/**
 * Detects .brand<...>() calls in Zod schemas.
 */
export class BrandDetector {
  /**
   * Analyzes a source file to find all branded types in schemas.
   *
   * @param sourceFile - The source file to analyze
   * @param schemaNames - Set of schema names to analyze
   * @returns Map of schema name to brand information
   */
  detectBrands(sourceFile: SourceFile, schemaNames: Set<string>): SchemaBrandMap {
    const result: SchemaBrandMap = new Map();

    const statements = sourceFile.getVariableStatements();
    for (const stmt of statements) {
      for (const decl of stmt.getDeclarations()) {
        const schemaName = decl.getName();
        if (!schemaNames.has(schemaName)) continue;

        const init = decl.getInitializer();
        if (!init) continue;

        const brands = this.findBrandsInNode(init, "");
        if (brands.length > 0) {
          result.set(schemaName, brands);
        }
      }
    }

    return result;
  }

  /**
   * Recursively finds brand calls in a node.
   */
  private findBrandsInNode(node: Node, currentPath: string): BrandInfo[] {
    const brands: BrandInfo[] = [];

    // Check if this node is a .brand<...>() call
    if (Node.isCallExpression(node)) {
      const brandInfo = this.extractBrandFromCall(node, currentPath);
      if (brandInfo) {
        brands.push(brandInfo);
      }

      // Check the expression being called (for method chains)
      const expr = node.getExpression();
      if (Node.isPropertyAccessExpression(expr)) {
        const base = expr.getExpression();
        brands.push(...this.findBrandsInNode(base, currentPath));
      }

      // Check arguments (for z.object({ field: schema }))
      for (const arg of node.getArguments()) {
        brands.push(...this.findBrandsInNode(arg, currentPath));
      }
    }

    // Check object literals for field definitions
    if (Node.isObjectLiteralExpression(node)) {
      for (const prop of node.getProperties()) {
        if (Node.isPropertyAssignment(prop)) {
          const fieldName = prop.getName();
          const fieldPath = currentPath ? `${currentPath}.${fieldName}` : fieldName;
          const initializer = prop.getInitializer();
          if (initializer) {
            brands.push(...this.findBrandsInNode(initializer, fieldPath));
          }
        }
      }
    }

    // Check property access expressions (method chains)
    if (Node.isPropertyAccessExpression(node)) {
      const base = node.getExpression();
      brands.push(...this.findBrandsInNode(base, currentPath));
    }

    return brands;
  }

  /**
   * Extracts brand information from a .brand<...>() call.
   */
  private extractBrandFromCall(node: CallExpression, fieldPath: string): BrandInfo | null {
    const expr = node.getExpression();
    if (!Node.isPropertyAccessExpression(expr)) {
      return null;
    }

    const methodName = expr.getName();
    if (methodName !== "brand") {
      return null;
    }

    // Get the type argument: .brand<"UserId">()
    const typeArgs = node.getTypeArguments();
    if (typeArgs.length === 0) {
      return null;
    }

    const typeArg = typeArgs[0];
    const brandName = this.extractBrandName(typeArg);
    if (!brandName) {
      return null;
    }

    return {
      brandName,
      fieldPath,
    };
  }

  /**
   * Extracts the brand name from a type argument.
   */
  private extractBrandName(node: Node): string | null {
    // Handle string literal type: "UserId"
    if (Node.isLiteralTypeNode(node)) {
      const literal = node.getLiteral();
      if (Node.isStringLiteral(literal)) {
        return literal.getLiteralText();
      }
    }

    // Handle direct string literal (some TS versions)
    const text = node.getText();
    const match = text.match(/^["'](.+)["']$/);
    if (match) {
      return match[1];
    }

    return null;
  }
}
