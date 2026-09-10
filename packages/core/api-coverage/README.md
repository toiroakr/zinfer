# Upstream API review gate

Run `pnpm test:api` from the repository root. CI runs this check against the
lockfile-installed Zod, Zod Mini, and Valibot versions. Renovate dependency updates
therefore fail CI when the upstream API inventory changes, even if our existing
fixtures do not use the new API yet.

The inventory is collected from the upstream TypeScript declarations, independently
of the adapters' builder/action registries. Each adapter's own installed dependency
is resolved; no network request or execution of upstream schema factories is needed.
Both `zod/mini` and the `@zod/mini` package are checked against the Mini baseline.
The `.txt` baselines record:

- Runtime export names, including aliases, and whether they are callable,
  constructors, values, or namespaces. Declared call/construct signatures record
  parameters, optionality, generics, overloads (in order), and return types.
- Namespace members such as `iso.datetime` and `coerce.string`, including newly
  exported namespaces.
- Public members of exported schema/action types, including inherited members.
  Their declared callable signatures are recorded too. Identical member sets are grouped to keep the baseline readable.

Zod's `core`, `util`, `regexes`, and `locales` namespace contents are excluded as
implementation/utility APIs. The duplicate `z` and `default` namespaces are also
excluded. Their namespace exports themselves remain recorded. Internal schema
members beginning with `_`, `$`, or `~` are omitted.

## Handling a failure

1. Read the diff and the upstream release notes. Identify each added, removed, or
   renamed API and determine whether it creates a schema, changes the input/output
   type, preserves the type, or is outside the adapter's scope.
2. For schema APIs, check detection for namespace/named imports and chained or
   curried calls as applicable. For Valibot transformations, check reference
   preservation and `VALIBOT_TYPE_CHANGING_ACTIONS` as well.
3. Add an executable fixture for relevant APIs. Assert that the export is detected
   and compare the generated input/output declarations with upstream inferred
   types, using the existing type tests. Add negative cases for APIs returning
   ordinary values. Fix implementation gaps before accepting the inventory.
4. Run `pnpm test:api --update`, review the `.txt` diff, and commit it together with
   the implementation/tests. Explain out-of-scope additions in the PR description.
5. Run `pnpm test:api` and the adapter's regular test suite.

Updating a snapshot alone does not establish support. The initial baselines record
main's installed API surface; they do not certify that every existing API is
supported. Behavioral changes, changes inside referenced type aliases, type-only
utility exports, and APIs inside excluded namespaces are not detected by this inventory.
Inherited generic methods are recorded as declared, rather than repeated for every
instantiation of their type parameters. Generated
input/output type tests remain necessary for those cases.

The guard deliberately runs separately from the peer-floor suite: an older supported
version has a different API inventory. Do not add a version-based skip to this check;
that would hide the very dependency upgrades it is intended to detect. A dependency
update is required to inspect a newly published version; this check does not poll npm.

## Testing the guard

`pnpm --filter @zinfer-monorepo/core test` includes synthetic upstream changes that
exercise new builders, aliases, namespace APIs, inherited methods, removals, and
signature changes, and module-resolution failures. `pnpm test:api` fails on missing baselines as well as
differences; snapshots are only written with an explicit `--update`.
