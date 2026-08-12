---
"zinfer": patch
---

Give `renovate.json` an explicit `rangeStrategy` per dependency type instead of one blanket `"bump"`:

- `peerDependencies`: kept at `"widen"` explicitly (matches Renovate's `"auto"` default for this depType, but spelled out so the intent — always widen a peer range, never narrow a floor — is clear from reading the file rather than relying on Renovate's implicit default). The dedicated `automerge: false` rule stays, since a peer range change still deserves human review even when it's a safe widen.
- `dependencies`: kept at `"bump"`. Unlike peers, these resolve to zinfer's own private copy in the tree, so a floor bump doesn't force anything on consumers.
- `devDependencies`: changed from `"bump"` to `"pin"`, and the manifest's `^`-ranged versions were unpinned to the exact versions already resolved in the lockfile. With `pnpm install --frozen-lockfile` in CI this was already effectively pinned, but a plain local `pnpm install` could previously drift to a newer patch/minor without a corresponding Renovate PR; pinning removes that ambiguity. Automerge behavior is unchanged.
