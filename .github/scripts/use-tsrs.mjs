import { registerHooks, createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const coreRequire = createRequire(new URL("../../packages/core/package.json", import.meta.url));
const redirects = new Map(
  ["sync", "ast", "fs"].map((entry) => [
    pathToFileURL(coreRequire.resolve(`typescript-native/${entry}`)).href,
    import.meta.resolve(`tsrs/unstable/${entry}`),
  ]),
);

registerHooks({
  resolve(specifier, context, nextResolve) {
    const resolved = nextResolve(specifier, context);
    const replacement = redirects.get(resolved.url);
    return replacement ? { ...resolved, url: replacement } : resolved;
  },
});

for (const [original, replacement] of redirects) {
  if ((await import(original)) !== (await import(replacement))) {
    throw new Error(`Failed to select the tsrs backend for ${original}`);
  }
}
