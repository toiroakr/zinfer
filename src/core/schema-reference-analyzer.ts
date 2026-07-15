import {
  SyntaxKind,
  isArrayLiteralExpression,
  isAsExpression,
  isCallExpression,
  isIdentifier,
  isObjectLiteralExpression,
  isParenthesizedExpression,
  isPropertyAccessExpression,
  isPropertyAssignment,
  isSatisfiesExpression,
  isSpreadAssignment,
  isStringLiteral,
  isTypeAssertion,
} from "@typescript/native-preview/unstable/ast";
import type {
  CallExpression,
  Node,
  SourceFile,
  VariableStatement,
} from "@typescript/native-preview/unstable/ast";
import { findVariableDeclarationByName, forEachDescendant } from "./tsgo-ast-utils.js";

/**
 * SchemaReferenceAnalyzer, implemented against the tsgo/Corsa `ast` API. See issue #200.
 */
export interface SchemaReferenceInfo {
  fieldPath: string;
  refSchema: string;
  isArray: boolean;
  isRecord: boolean;
  isOptional: boolean;
}

export interface UnionReferenceInfo {
  memberSchemas: string[];
  hasInlineMembers: boolean;
  isDiscriminated: boolean;
  discriminatorKey?: string;
}

export type SchemaReferenceMap = Map<string, SchemaReferenceInfo[]>;
export type UnionReferenceMap = Map<string, UnionReferenceInfo>;

export class SchemaReferenceAnalyzer {
  private static readonly OBJECT_BUILDERS = new Set(["object", "strictObject", "looseObject"]);
  private static readonly TYPE_PRESERVING_METHODS = new Set([
    "describe",
    "meta",
    "superRefine",
    "check",
  ]);

  analyzeAllReferences(
    sourceFile: SourceFile,
    schemaNames: Set<string>,
  ): { references: SchemaReferenceMap; unionReferences: UnionReferenceMap } {
    const references: SchemaReferenceMap = new Map();
    const unionReferences: UnionReferenceMap = new Map();

    for (const statement of sourceFile.statements) {
      if (statement.kind !== SyntaxKind.VariableStatement) continue;
      for (const decl of (statement as VariableStatement).declarationList.declarations) {
        const schemaName = decl.name.getText(sourceFile);
        if (!schemaNames.has(schemaName)) continue;

        const init = decl.initializer;
        if (!init) continue;

        const refs = this.findSchemaReferences(init, schemaNames, schemaName, sourceFile);
        if (refs.length > 0) {
          references.set(schemaName, refs);
        }

        const unionRef = this.findUnionReference(init, schemaNames, schemaName, sourceFile);
        if (unionRef) {
          unionReferences.set(schemaName, unionRef);
        }
      }
    }

    return { references, unionReferences };
  }

  private findUnionReference(
    node: Node,
    schemaNames: Set<string>,
    currentSchema: string,
    sourceFile: SourceFile,
  ): UnionReferenceInfo | undefined {
    let current = node;
    while (isCallExpression(current)) {
      const callee = current.expression;
      if (
        !isPropertyAccessExpression(callee) ||
        !SchemaReferenceAnalyzer.TYPE_PRESERVING_METHODS.has(callee.name.getText(sourceFile))
      ) {
        break;
      }
      current = callee.expression;
    }

    if (!isCallExpression(current)) {
      return undefined;
    }

    const expr = current.expression;
    if (!isPropertyAccessExpression(expr)) {
      return undefined;
    }

    const obj = expr.expression;
    const method = expr.name.getText(sourceFile);

    if (!isIdentifier(obj) || obj.getText(sourceFile) !== "z") {
      return undefined;
    }

    if (method === "discriminatedUnion") {
      return this.parseDiscriminatedUnion(current, schemaNames, currentSchema, sourceFile);
    }

    if (method === "union") {
      return this.parseUnion(current, schemaNames, currentSchema, sourceFile);
    }

    return undefined;
  }

  private parseDiscriminatedUnion(
    node: CallExpression,
    schemaNames: Set<string>,
    currentSchema: string,
    sourceFile: SourceFile,
  ): UnionReferenceInfo | undefined {
    const args = node.arguments;
    if (args.length < 2) {
      return undefined;
    }

    const discriminatorArg = args[0];
    let discriminatorKey: string | undefined;
    if (isStringLiteral(discriminatorArg)) {
      discriminatorKey = discriminatorArg.text;
    }

    const schemasArg = args[1];
    const { memberSchemas, hasInlineMembers } = this.extractSchemaArrayMembers(
      schemasArg,
      schemaNames,
      currentSchema,
      sourceFile,
    );

    if (memberSchemas.length === 0) {
      return undefined;
    }

    return {
      memberSchemas,
      hasInlineMembers,
      isDiscriminated: true,
      discriminatorKey,
    };
  }

  private parseUnion(
    node: CallExpression,
    schemaNames: Set<string>,
    currentSchema: string,
    sourceFile: SourceFile,
  ): UnionReferenceInfo | undefined {
    const args = node.arguments;
    if (args.length < 1) {
      return undefined;
    }

    const schemasArg = args[0];
    const { memberSchemas, hasInlineMembers } = this.extractSchemaArrayMembers(
      schemasArg,
      schemaNames,
      currentSchema,
      sourceFile,
    );

    if (memberSchemas.length === 0) {
      return undefined;
    }

    return {
      memberSchemas,
      hasInlineMembers,
      isDiscriminated: false,
    };
  }

  private extractSchemaArrayMembers(
    node: Node,
    schemaNames: Set<string>,
    currentSchema: string,
    sourceFile: SourceFile,
  ): { memberSchemas: string[]; hasInlineMembers: boolean } {
    if (!isArrayLiteralExpression(node)) {
      return { memberSchemas: [], hasInlineMembers: true };
    }

    const members: string[] = [];
    let hasInlineMembers = false;
    for (const element of node.elements) {
      if (isIdentifier(element)) {
        const name = element.getText(sourceFile);
        if (schemaNames.has(name) && name !== currentSchema) {
          members.push(name);
          continue;
        }
      }
      hasInlineMembers = true;
    }

    return { memberSchemas: members, hasInlineMembers };
  }

  private findSchemaReferences(
    node: Node,
    schemaNames: Set<string>,
    currentSchema: string,
    sourceFile: SourceFile,
  ): SchemaReferenceInfo[] {
    const refs: SchemaReferenceInfo[] = [];

    const objectCalls = this.findZodObjectCalls(node, sourceFile);

    for (const objectCall of objectCalls) {
      const args = objectCall.arguments;
      if (args.length === 0) continue;

      const objectLiteral = args[0];
      if (!isObjectLiteralExpression(objectLiteral)) continue;

      const fields = this.findObjectLiteralReferences(
        objectLiteral,
        schemaNames,
        currentSchema,
        new Set(),
        sourceFile,
      );
      refs.push(...[...fields.values()].filter((ref): ref is SchemaReferenceInfo => ref !== null));
    }

    return refs;
  }

  private findObjectLiteralReferences(
    objectLiteral: Node,
    schemaNames: Set<string>,
    currentSchema: string,
    visitedShapes: Set<string>,
    sourceFile: SourceFile,
  ): Map<string, SchemaReferenceInfo | null> {
    if (!isObjectLiteralExpression(objectLiteral)) {
      return new Map();
    }

    const refsByField = new Map<string, SchemaReferenceInfo | null>();

    for (const prop of objectLiteral.properties) {
      if (isSpreadAssignment(prop)) {
        const expression = prop.expression;
        if (!isIdentifier(expression)) {
          refsByField.clear();
          continue;
        }

        const declaration = findVariableDeclarationByName(
          sourceFile,
          expression.getText(sourceFile),
        );
        let initializer = declaration?.initializer;
        while (
          initializer &&
          (isAsExpression(initializer) ||
            isSatisfiesExpression(initializer) ||
            isParenthesizedExpression(initializer) ||
            isTypeAssertion(initializer))
        ) {
          initializer = initializer.expression;
        }
        if (!declaration || !initializer || !isObjectLiteralExpression(initializer)) {
          refsByField.clear();
          continue;
        }

        const shapeId = `${sourceFile.path}:${declaration.getStart(sourceFile)}`;
        if (visitedShapes.has(shapeId)) continue;

        const nextVisitedShapes = new Set(visitedShapes);
        nextVisitedShapes.add(shapeId);
        for (const [fieldName, ref] of this.findObjectLiteralReferences(
          initializer,
          schemaNames,
          currentSchema,
          nextVisitedShapes,
          sourceFile,
        )) {
          refsByField.set(fieldName, ref);
        }
        continue;
      }

      if (!isPropertyAssignment(prop)) continue;

      const fieldName = prop.name.getText(sourceFile);
      const initializer = prop.initializer;
      if (!initializer) continue;

      const refInfo = this.analyzeFieldValue(
        initializer,
        fieldName,
        schemaNames,
        currentSchema,
        sourceFile,
      );
      refsByField.set(fieldName, refInfo);
    }

    return refsByField;
  }

  private findZodObjectCalls(node: Node, sourceFile: SourceFile): CallExpression[] {
    const calls: CallExpression[] = [];

    const checkNode = (n: Node) => {
      if (isCallExpression(n)) {
        const expr = n.expression;
        if (isPropertyAccessExpression(expr)) {
          const obj = expr.expression;
          const method = expr.name.getText(sourceFile);
          if (
            isIdentifier(obj) &&
            obj.getText(sourceFile) === "z" &&
            SchemaReferenceAnalyzer.OBJECT_BUILDERS.has(method)
          ) {
            calls.push(n);
          }
        }
      }
    };

    checkNode(node);
    forEachDescendant(node, checkNode);

    return calls;
  }

  private analyzeFieldValue(
    node: Node,
    fieldPath: string,
    schemaNames: Set<string>,
    currentSchema: string,
    sourceFile: SourceFile,
  ): SchemaReferenceInfo | null {
    let isArray = false;
    let isRecord = false;
    let isOptional = false;
    let refSchema: string | null = null;

    let current = node;
    while (isCallExpression(current)) {
      const expr = current.expression;

      if (isPropertyAccessExpression(expr)) {
        const method = expr.name.getText(sourceFile);
        const base = expr.expression;

        if (method === "optional" || method === "nullable") {
          isOptional = true;
          current = base;
          continue;
        }

        if (SchemaReferenceAnalyzer.TYPE_PRESERVING_METHODS.has(method)) {
          current = base;
          continue;
        }

        if (method === "array") {
          if (isIdentifier(base) && base.getText(sourceFile) !== "z") {
            const name = base.getText(sourceFile);
            if (schemaNames.has(name) && name !== currentSchema) {
              isArray = true;
              refSchema = name;
              break;
            }
          } else if (isIdentifier(base) && base.getText(sourceFile) === "z") {
            const args = current.arguments;
            if (args.length > 0 && isIdentifier(args[0])) {
              const name = args[0].getText(sourceFile);
              if (schemaNames.has(name) && name !== currentSchema) {
                isArray = true;
                refSchema = name;
                break;
              }
            }
          }
          current = base;
          continue;
        }

        if (method === "record" && isIdentifier(base) && base.getText(sourceFile) === "z") {
          const args = current.arguments;
          if (args.length >= 2 && isIdentifier(args[1])) {
            const name = args[1].getText(sourceFile);
            if (schemaNames.has(name) && name !== currentSchema) {
              isRecord = true;
              refSchema = name;
              break;
            }
          }
        }
      }

      break;
    }

    if (!refSchema && isIdentifier(current)) {
      const name = current.getText(sourceFile);
      if (schemaNames.has(name) && name !== currentSchema) {
        refSchema = name;
      }
    }

    if (!refSchema) {
      return null;
    }

    return {
      fieldPath,
      refSchema,
      isArray,
      isRecord,
      isOptional,
    };
  }
}
