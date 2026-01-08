import { SourceFile, Node, CallExpression } from "ts-morph";

/**
 * Information about a schema reference within another schema.
 */
export interface SchemaReferenceInfo {
  /** The field path where the reference occurs (e.g., "output", "input") */
  fieldPath: string;
  /** The referenced schema name */
  refSchema: string;
  /** Whether wrapped in z.array() */
  isArray: boolean;
  /** Whether wrapped in z.record() */
  isRecord: boolean;
  /** Whether optional */
  isOptional: boolean;
}

/**
 * Information about union member references.
 */
export interface UnionReferenceInfo {
  /** The referenced schema names (members of the union) */
  memberSchemas: string[];
  /** Whether this is a discriminated union */
  isDiscriminated: boolean;
  /** The discriminator key for discriminated unions */
  discriminatorKey?: string;
}

/**
 * Map of schema name to its references to other schemas.
 */
export type SchemaReferenceMap = Map<string, SchemaReferenceInfo[]>;

/**
 * Map of schema name to its union member references.
 */
export type UnionReferenceMap = Map<string, UnionReferenceInfo>;

/**
 * Analyzes schema references to detect cross-schema dependencies.
 */
export class SchemaReferenceAnalyzer {
  /**
   * Analyzes a source file to find all schema references.
   */
  analyzeReferences(sourceFile: SourceFile, schemaNames: Set<string>): SchemaReferenceMap {
    const result: SchemaReferenceMap = new Map();

    const statements = sourceFile.getVariableStatements();
    for (const stmt of statements) {
      for (const decl of stmt.getDeclarations()) {
        const schemaName = decl.getName();
        if (!schemaNames.has(schemaName)) continue;

        const init = decl.getInitializer();
        if (!init) continue;

        const refs = this.findSchemaReferences(init, schemaNames, schemaName);
        if (refs.length > 0) {
          result.set(schemaName, refs);
        }
      }
    }

    return result;
  }

  /**
   * Analyzes a source file to find union schema references.
   */
  analyzeUnionReferences(sourceFile: SourceFile, schemaNames: Set<string>): UnionReferenceMap {
    const result: UnionReferenceMap = new Map();

    const statements = sourceFile.getVariableStatements();
    for (const stmt of statements) {
      for (const decl of stmt.getDeclarations()) {
        const schemaName = decl.getName();
        if (!schemaNames.has(schemaName)) continue;

        const init = decl.getInitializer();
        if (!init) continue;

        const unionRef = this.findUnionReference(init, schemaNames, schemaName);
        if (unionRef) {
          result.set(schemaName, unionRef);
        }
      }
    }

    return result;
  }

  /**
   * Finds union references in a schema definition.
   */
  private findUnionReference(
    node: Node,
    schemaNames: Set<string>,
    currentSchema: string,
  ): UnionReferenceInfo | undefined {
    // Check if this is a z.discriminatedUnion() or z.union() call
    if (!Node.isCallExpression(node)) {
      return undefined;
    }

    const expr = node.getExpression();
    if (!Node.isPropertyAccessExpression(expr)) {
      return undefined;
    }

    const obj = expr.getExpression();
    const method = expr.getName();

    if (!Node.isIdentifier(obj) || obj.getText() !== "z") {
      return undefined;
    }

    if (method === "discriminatedUnion") {
      return this.parseDiscriminatedUnion(node, schemaNames, currentSchema);
    }

    if (method === "union") {
      return this.parseUnion(node, schemaNames, currentSchema);
    }

    return undefined;
  }

  /**
   * Parses a z.discriminatedUnion() call.
   */
  private parseDiscriminatedUnion(
    node: CallExpression,
    schemaNames: Set<string>,
    currentSchema: string,
  ): UnionReferenceInfo | undefined {
    const args = node.getArguments();
    if (args.length < 2) {
      return undefined;
    }

    // First arg is the discriminator key
    const discriminatorArg = args[0];
    let discriminatorKey: string | undefined;
    if (Node.isStringLiteral(discriminatorArg)) {
      discriminatorKey = discriminatorArg.getLiteralText();
    }

    // Second arg is the array of schemas
    const schemasArg = args[1];
    const memberSchemas = this.extractSchemaArrayMembers(schemasArg, schemaNames, currentSchema);

    if (memberSchemas.length === 0) {
      return undefined;
    }

    return {
      memberSchemas,
      isDiscriminated: true,
      discriminatorKey,
    };
  }

  /**
   * Parses a z.union() call.
   */
  private parseUnion(
    node: CallExpression,
    schemaNames: Set<string>,
    currentSchema: string,
  ): UnionReferenceInfo | undefined {
    const args = node.getArguments();
    if (args.length < 1) {
      return undefined;
    }

    // First arg is the array of schemas
    const schemasArg = args[0];
    const memberSchemas = this.extractSchemaArrayMembers(schemasArg, schemaNames, currentSchema);

    if (memberSchemas.length === 0) {
      return undefined;
    }

    return {
      memberSchemas,
      isDiscriminated: false,
    };
  }

  /**
   * Extracts schema names from an array expression.
   */
  private extractSchemaArrayMembers(
    node: Node,
    schemaNames: Set<string>,
    currentSchema: string,
  ): string[] {
    if (!Node.isArrayLiteralExpression(node)) {
      return [];
    }

    const members: string[] = [];
    for (const element of node.getElements()) {
      if (Node.isIdentifier(element)) {
        const name = element.getText();
        if (schemaNames.has(name) && name !== currentSchema) {
          members.push(name);
        }
      }
    }

    return members;
  }

  /**
   * Finds all references to other schemas within a schema definition.
   */
  private findSchemaReferences(
    node: Node,
    schemaNames: Set<string>,
    currentSchema: string,
  ): SchemaReferenceInfo[] {
    const refs: SchemaReferenceInfo[] = [];

    // Find z.object() call
    const objectCalls = this.findZodObjectCalls(node);

    for (const objectCall of objectCalls) {
      const args = objectCall.getArguments();
      if (args.length === 0) continue;

      const objectLiteral = args[0];
      if (!Node.isObjectLiteralExpression(objectLiteral)) continue;

      // Analyze each property
      for (const prop of objectLiteral.getProperties()) {
        if (Node.isPropertyAssignment(prop)) {
          const fieldName = prop.getName();
          const initializer = prop.getInitializer();
          if (!initializer) continue;

          const refInfo = this.analyzeFieldValue(
            initializer,
            fieldName,
            schemaNames,
            currentSchema,
          );
          if (refInfo) {
            refs.push(refInfo);
          }
        }
      }
    }

    return refs;
  }

  /**
   * Finds all z.object() calls in a node (including the node itself).
   */
  private findZodObjectCalls(node: Node): CallExpression[] {
    const calls: CallExpression[] = [];

    // Check the node itself
    const checkNode = (n: Node) => {
      if (Node.isCallExpression(n)) {
        const expr = n.getExpression();
        if (Node.isPropertyAccessExpression(expr)) {
          const obj = expr.getExpression();
          const method = expr.getName();
          if (Node.isIdentifier(obj) && obj.getText() === "z" && method === "object") {
            calls.push(n);
          }
        }
      }
    };

    checkNode(node);
    node.forEachDescendant(checkNode);

    return calls;
  }

  /**
   * Analyzes a field value to detect schema references.
   */
  private analyzeFieldValue(
    node: Node,
    fieldPath: string,
    schemaNames: Set<string>,
    currentSchema: string,
  ): SchemaReferenceInfo | null {
    let isArray = false;
    let isRecord = false;
    let isOptional = false;
    let refSchema: string | null = null;

    // Unwrap method chains
    let current = node;
    while (Node.isCallExpression(current)) {
      const expr = current.getExpression();

      if (Node.isPropertyAccessExpression(expr)) {
        const method = expr.getName();
        const base = expr.getExpression();

        if (method === "optional" || method === "nullable") {
          isOptional = true;
          current = base;
          continue;
        }

        if (method === "array") {
          if (Node.isIdentifier(base) && base.getText() !== "z") {
            // SchemaName.array()
            const name = base.getText();
            if (schemaNames.has(name) && name !== currentSchema) {
              isArray = true;
              refSchema = name;
              break;
            }
          } else if (Node.isIdentifier(base) && base.getText() === "z") {
            // z.array(SchemaName)
            const args = current.getArguments();
            if (args.length > 0 && Node.isIdentifier(args[0])) {
              const name = args[0].getText();
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

        if (method === "record" && Node.isIdentifier(base) && base.getText() === "z") {
          // z.record(key, SchemaName)
          const args = current.getArguments();
          if (args.length >= 2 && Node.isIdentifier(args[1])) {
            const name = args[1].getText();
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

    // Check if current is a direct identifier reference
    if (!refSchema && Node.isIdentifier(current)) {
      const name = current.getText();
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
