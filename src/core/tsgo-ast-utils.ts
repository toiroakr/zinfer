import type {
  Node,
  SourceFile,
  VariableDeclaration,
  VariableStatement,
} from "@typescript/native-preview/unstable/ast";
import { SyntaxKind } from "@typescript/native-preview/unstable/ast";

/**
 * Shared tree-walking helpers for the tsgo/Corsa `ast` API, which (unlike
 * ts-morph) has no built-in "getDescendantsOfKind"-style convenience methods.
 */

export function forEachDescendant(node: Node, cb: (node: Node) => void): void {
  node.forEachChild((child) => {
    cb(child);
    forEachDescendant(child, cb);
    return undefined;
  });
}

export function getDescendantsOfKind(node: Node, kind: SyntaxKind): Node[] {
  const results: Node[] = [];
  forEachDescendant(node, (n) => {
    if (n.kind === kind) results.push(n);
  });
  return results;
}

export function findFirstDescendantByKind(node: Node, kind: SyntaxKind): Node | undefined {
  function visit(n: Node): Node | undefined {
    if (n.kind === kind) return n;
    return n.forEachChild(visit);
  }
  return node.forEachChild(visit);
}

/** Finds a top-level `const`/`let`/`var` declaration by name within a source file. */
export function findVariableDeclarationByName(
  sourceFile: SourceFile,
  name: string,
): VariableDeclaration | undefined {
  for (const statement of sourceFile.statements) {
    if (statement.kind !== SyntaxKind.VariableStatement) continue;
    for (const declaration of (statement as VariableStatement).declarationList.declarations) {
      if (
        declaration.name.kind === SyntaxKind.Identifier &&
        declaration.name.getText(sourceFile) === name
      ) {
        return declaration;
      }
    }
  }
  return undefined;
}
