import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";
import { inspectLibrary } from "./surface.js";

for (const [adapter, library] of [
  ["zinfer", "zod"],
  ["zinfer-mini", "zod/mini"],
  ["zinfer-mini", "@zod/mini"],
  ["vinfer", "valibot"],
]) {
  test(`${adapter} (${library}): upstream API changes require a compatibility review`, async () => {
    const directory = fileURLToPath(new URL(`../../${adapter}/`, import.meta.url));
    const surface = inspectLibrary(directory, library);
    await expect(surface).toMatchFileSnapshot(`./${adapter}.txt`);
  });
}
