import { describe, expect, test } from "vitest";
import { Project } from "ts-morph";
import { collectSurface, inspectLibrary } from "../api-coverage/surface.js";

function surface(declarations: string): string {
  const project = new Project({ useInMemoryFileSystem: true, compilerOptions: { strict: true } });
  project.createSourceFile("/library.ts", declarations);
  const source = project.createSourceFile("/consumer.ts", 'import * as library from "./library";');
  return collectSurface(source);
}

const baseline = `
export interface Schema { _zod: {}; parse(value: unknown): string; }
export function string(): Schema { throw 0; }
export namespace iso { export function date(): Schema { throw 0; } }
`;

describe("upstream API inventory", () => {
  test("detects a new builder without consulting a local allowlist", () => {
    expect(surface(baseline + "export const future = string;")).not.toBe(surface(baseline));
    expect(surface(baseline)).toContain("string: callable");
  });

  test("detects new nested namespace APIs and exported aliases", () => {
    expect(surface(baseline + "export namespace iso { export const future = string; }")).toContain(
      "iso.future: callable",
    );
    expect(surface(baseline + "export { string as alias };")).toContain("alias: callable");
  });

  test("detects inherited schema methods and properties", () => {
    const original = baseline + "export interface Child extends Schema { shape: {}; }";
    const changed = original + "export interface Schema { exactPartial(): Schema; }";
    expect(surface(changed)).not.toBe(surface(original));
    expect(surface(changed)).toContain("exactPartial: (): Schema");
    expect(surface(changed)).toContain("shape");
  });

  test("detects Valibot action members", () => {
    const original =
      'export interface Action { "~run": () => void; type: "transform"; } export declare function transform(): Action;';
    expect(surface(original + "export interface Action { future(): Action; }")).not.toBe(
      surface(original),
    );
  });

  test("detects removal and callable-to-value changes", () => {
    expect(surface(baseline.replace("export function string(): Schema { throw 0; }", ""))).not.toBe(
      surface(baseline),
    );
    expect(surface("export const string = 1;")).toContain("string: value");
  });

  test("detects parameter, optionality, generic, and return-type changes", () => {
    const original = "export declare function transform<T>(value: T): T;";
    for (const changed of [
      "export declare function transform<T>(value: string): T;",
      "export declare function transform<T>(value?: T): T;",
      "export declare function transform<T extends string>(value: T): T;",
      "export declare function transform<T>(value: T): Promise<T>;",
    ]) {
      expect(surface(changed)).not.toBe(surface(original));
    }
  });

  test("detects overload-only changes", () => {
    const original = "export declare function parse(value: string): string;";
    expect(surface(original + "export declare function parse(value: number): number;")).not.toBe(
      surface(original),
    );
  });

  test("detects inherited method signature changes", () => {
    const original = baseline + "export interface Child extends Schema {}";
    expect(
      surface(original.replace("parse(value: unknown): string", "parse(value: unknown): number")),
    ).not.toBe(surface(original));
  });

  test("detects constructor signature changes", () => {
    expect(surface("export declare class Schema { constructor(value: string); }")).not.toBe(
      surface("export declare class Schema { constructor(value: number); }"),
    );
  });

  test("is stable across declaration order and comments", () => {
    expect(surface("export const b = 1; export const a = 2;")).toBe(
      surface("/** docs */ export const a = 2; export const b = 1;"),
    );
  });

  test("excludes documented utility namespaces but retains their presence", () => {
    expect(surface("export namespace core { export const privateHelper = 1; }")).toContain(
      "core: namespace (excluded)",
    );
    expect(surface("export namespace core { export const privateHelper = 1; }")).not.toContain(
      "core.privateHelper",
    );
  });

  test("fails closed when an upstream module cannot be resolved", () => {
    expect(() => inspectLibrary("/missing-adapter", "missing-upstream-package")).toThrow();
  });
});
