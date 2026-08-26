import { describe, it, expect } from "vitest";
import { resolve } from "path";
import { Project } from "ts-morph";
import { GetterResolver } from "../src/core/getter-resolver.js";

const fixturesDir = resolve(import.meta.dirname, "fixtures");

describe("GetterResolver", () => {
  const resolver = new GetterResolver();

  function getSourceFile(filename: string) {
    const project = new Project();
    return project.addSourceFileAtPath(resolve(fixturesDir, filename));
  }

  describe("analyzeGetterFields", () => {
    it("should detect getter fields with self-references", () => {
      const sourceFile = getSourceFile("getter-schema.ts");
      const getterFields = resolver.analyzeGetterFields(sourceFile);

      expect(getterFields.size).toBeGreaterThan(0);
      expect(getterFields.has("TreeNodeSchema")).toBe(true);

      const treeNodeFields = getterFields.get("TreeNodeSchema")!;
      expect(treeNodeFields.has("children")).toBe(true);

      const childrenInfo = treeNodeFields.get("children")!;
      expect(childrenInfo.isSelfRef).toBe(true);
      expect(childrenInfo.isArray).toBe(true);
      expect(childrenInfo.isOptional).toBe(true);
    });

    it("should detect getter fields with record types", () => {
      const sourceFile = getSourceFile("getter-schema.ts");
      const getterFields = resolver.analyzeGetterFields(sourceFile);

      expect(getterFields.has("NestedRecordSchema")).toBe(true);

      const nestedRecordFields = getterFields.get("NestedRecordSchema")!;
      expect(nestedRecordFields.has("items")).toBe(true);

      const itemsInfo = nestedRecordFields.get("items")!;
      expect(itemsInfo.isSelfRef).toBe(true);
      expect(itemsInfo.isRecord).toBe(true);
    });

    it("should return empty map for schemas without getters", () => {
      const sourceFile = getSourceFile("basic-schema.ts");
      const getterFields = resolver.analyzeGetterFields(sourceFile);

      // basic-schema.ts doesn't have getter-based fields
      expect(getterFields.size).toBe(0);
    });
  });

  describe("hasSelfReferences", () => {
    it("should return true when getter fields contain self-references", () => {
      const sourceFile = getSourceFile("getter-schema.ts");
      const getterFields = resolver.analyzeGetterFields(sourceFile);

      const treeNodeFields = getterFields.get("TreeNodeSchema")!;
      expect(resolver.hasSelfReferences(treeNodeFields)).toBe(true);
    });

    it("should return false for empty map", () => {
      const emptyMap = new Map();
      expect(resolver.hasSelfReferences(emptyMap)).toBe(false);
    });
  });

  describe("resolveAnyTypes", () => {
    it("should replace any with type name for array self-references", () => {
      const getterFields = new Map([
        [
          "children",
          {
            refSchema: "TreeNode",
            isArray: true,
            isRecord: false,
            isOptional: true,
            isSelfRef: true,
          },
        ],
      ]);

      const typeStr = "{ value: string; children?: any[]; }";
      const result = resolver.resolveAnyTypes(typeStr, getterFields, "TreeNode");

      expect(result).toBe("{ value: string; children?: TreeNode[]; }");
    });

    it("should replace any with type name for record self-references", () => {
      const getterFields = new Map([
        [
          "items",
          {
            refSchema: "NestedRecord",
            isArray: false,
            isRecord: true,
            isOptional: false,
            isSelfRef: true,
          },
        ],
      ]);

      const typeStr = "{ name: string; items: { [x: string]: any }; }";
      const result = resolver.resolveAnyTypes(typeStr, getterFields, "NestedRecord");

      expect(result).toBe("{ name: string; items: { [x: string]: NestedRecord }; }");
    });

    it("should rebuild the shape from an unknown placeholder", () => {
      // An annotated getter's input side is `unknown`, not `any`:
      // `z.ZodType<Output>` leaves its `Input` parameter at its default.
      const getterFields = new Map([
        [
          "children",
          { refSchema: "Node", isArray: false, isRecord: true, isOptional: false, isSelfRef: true },
        ],
      ]);

      const typeStr = "{ name: string; children: unknown; }";
      const result = resolver.resolveAnyTypes(typeStr, getterFields, "Node");

      expect(result).toBe("{ name: string; children: { [x: string]: Node; }; }");
    });

    it("should collapse an inlined copy of the schema into the self-reference", () => {
      // An annotated getter lets TypeScript unfold one whole copy of the schema
      // before it reaches the recursion, and that copy says nothing the
      // self-reference does not.
      const getterFields = new Map([
        [
          "children",
          { refSchema: "Node", isArray: false, isRecord: true, isOptional: false, isSelfRef: true },
        ],
      ]);

      const typeStr =
        "{ name: string; children: { [x: string]: { name: string; children: any; }; }; }";
      const result = resolver.resolveAnyTypes(typeStr, getterFields, "Node");

      expect(result).toBe("{ name: string; children: { [x: string]: Node; }; }");
    });

    it("should collapse an inlined copy behind an optional key", () => {
      const getterFields = new Map([
        [
          "children",
          { refSchema: "Node", isArray: false, isRecord: true, isOptional: true, isSelfRef: true },
        ],
      ]);

      const typeStr =
        "{ name: string; children?: { [x: string]: { name: string; children?: any | undefined; }; } | undefined; }";
      const result = resolver.resolveAnyTypes(typeStr, getterFields, "Node");

      expect(result).toBe("{ name: string; children?: { [x: string]: Node; } | undefined; }");
    });

    it("should keep the inlined copy when told not to collapse it", () => {
      // Without a name to point at, the copy is the most that can be said - only
      // its innermost placeholder is widened to the shape the getter describes.
      const getterFields = new Map([
        [
          "children",
          { refSchema: "Node", isArray: false, isRecord: true, isOptional: false, isSelfRef: true },
        ],
      ]);

      const typeStr =
        "{ name: string; children: { [x: string]: { name: string; children: any; }; }; }";
      const result = resolver.resolveAnyTypes(typeStr, getterFields, "any", {
        collapseInlinedCopies: false,
      });

      expect(result).toBe(
        "{ name: string; children: { [x: string]: { name: string; children: { [x: string]: any; }; }; }; }",
      );
    });

    it("should not modify types without self-references", () => {
      const getterFields = new Map([
        [
          "other",
          {
            refSchema: "OtherSchema",
            isArray: false,
            isRecord: false,
            isOptional: false,
            isSelfRef: false,
          },
        ],
      ]);

      const typeStr = "{ value: string; other: any; }";
      const result = resolver.resolveAnyTypes(typeStr, getterFields, "MyType");

      expect(result).toBe("{ value: string; other: any; }");
    });

    it("should handle optional fields", () => {
      const getterFields = new Map([
        [
          "child",
          { refSchema: "Node", isArray: false, isRecord: false, isOptional: true, isSelfRef: true },
        ],
      ]);

      const typeStr = "{ value: string; child?: any; }";
      const result = resolver.resolveAnyTypes(typeStr, getterFields, "Node");

      expect(result).toBe("{ value: string; child?: Node; }");
    });

    it("should replace a nullable-and-optional array placeholder (any[] | null | undefined)", () => {
      // .array(Self).nullable().optional() prints as `any[] | null | undefined`,
      // not just `any[]` - the `| null` sits between the placeholder and the
      // trailing `| undefined`.
      const getterFields = new Map([
        [
          "children",
          { refSchema: "Node", isArray: true, isRecord: false, isOptional: true, isSelfRef: true },
        ],
      ]);

      const typeStr = "{ name: string; children?: any[] | null | undefined; }";
      const result = resolver.resolveAnyTypes(typeStr, getterFields, "Node");

      expect(result).toBe("{ name: string; children?: Node[] | null | undefined; }");
    });

    it("should collapse an inlined copy whose recursion point is nullable", () => {
      // An annotated getter that unfolds one level can leave the inner
      // recursion point printed as `any[] | null | undefined` - the same
      // suffix that has to be recognised as a placeholder for the inline
      // copy detection to kick in.
      const getterFields = new Map([
        [
          "children",
          { refSchema: "Node", isArray: true, isRecord: false, isOptional: true, isSelfRef: true },
        ],
      ]);

      const typeStr =
        "{ name: string; children: { name: string; children: any[] | null | undefined; }[] | null; }";
      const result = resolver.resolveAnyTypes(typeStr, getterFields, "Node");

      expect(result).toBe("{ name: string; children: Node[] | null; }");
    });
  });
});
