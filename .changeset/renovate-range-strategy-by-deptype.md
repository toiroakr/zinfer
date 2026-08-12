---
"zinfer": patch
---

Give `renovate.json` an explicit `rangeStrategy` per dependency type instead of one blanket `"bump"`:

- `peerDependencies`: kept at `"widen"` explicitly (matches Renovate's `"auto"` default for this depType, but spelled out so the intent — always widen a peer range, never narrow a floor — is clear from reading the file rather than relying on Renovate's implicit default). The dedicated `automerge: false` rule stays, since a peer range change still deserves human review even when it's a safe widen.
- `dependencies`: kept at `"bump"`. Unlike peers, these don't need to resolve to a single shared instance across the consumer's tree, so a floor bump can at most add a duplicate install of a slightly newer version alongside whatever the consumer already has — it doesn't force or conflict with the consumer's own declared version.
- `devDependencies`: changed from `"bump"` to `"pin"`, and the manifest's `^`-ranged versions were unpinned to the exact versions already resolved in the lockfile. This doesn't change what either `pnpm install --frozen-lockfile` or a plain `pnpm install` against an up-to-date lockfile resolves to (both already reuse the locked versions as-is; pnpm only re-resolves within a range on `pnpm update` or when the lockfile itself is regenerated). What it removes is the gap between what `package.json` documents and what's actually locked, and it keeps that guarantee even across a lockfile regeneration. Automerge behavior is unchanged.
