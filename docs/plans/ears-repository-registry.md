# The repository registry leaves the engine

Status: planned, 2026-10-23. The last item of the EARS API cleanup; the four before it are on `ears-engine-overhaul`.

## Why

`@apackdev/ears` is storage, queries, writes and units. The repository registry is none of those: it is pack
plumbing. It holds what each pack's `features.<id>.repositories` exports, under the names
`#generated/repository` types. It sits on the engine anyway, as `engine.repository`, `registerRepository`,
`unregisterRepository` and `admin.repositories()`. Three costs follow:

- **A test engine can't be replaced without carrying the packs' plumbing across.** `resetTestData` does
  `installFreshEngine(testEngine().admin.repositories())`.
- **Two things own "which pack provides `noteQueries`".** The host's pack registry decides it, then
  copies the answer into the engine one name at a time (`packs/registry.ts:371`).
- **The engine's public face exposes members that only the composition root calls.** `registerRepository`
  also has an SDK export, which a pack rule and a `check:specifiers` rule exist only to refuse.

## The move

- **The registry becomes the host pack registry's own, derived like `rowRules`.** It is a map from
  repository name to value, built from the admitted registrations, and read through `PackRegistryView` (for
  example `repositories()` or `repository(name)`). A pack's replacement swaps it with the rest of the pack's
  contributions, as it already does for services.
- **The SDK's `repository` proxy and `services.repository` read the bound packs** (`boundHost().packs`) instead
  of `boundEars().repository`. An unregistered name still throws, with the same message.
- **The test runtime keeps repositories in `testPacks`.** `resetTestData` then replaces the engine and nothing
  else, and the harness registers a pack's repositories through its registry, as it does its services.
- **Deleted:**
  - `engine.repository`, `registerRepository`, `unregisterRepository`, `admin.repositories()` and
    `createRepositoryRegistry` (`apack-ears/src/repository.ts`). `RepositoryError` stays.
  - The SDK's `registerRepository`/`unregisterRepository` exports, and the pack rule and `check:specifiers` rule
    that refuse them.

## Callers to move

- **Host:** `packs/registry.ts` (registration, replacement and unregistration), and its specs `registration`,
  `replacement` and `content-binding`.
- **SDK:** the `ears/index.ts` proxy, `testing/index.ts`, and the specs `bound-ears`, `test-host` and `unbound`.
- **API:** `tests/runtime/bound-runtime.spec.ts`.
- **Ears:** `tests/engine/queries.spec.ts` (repository registry cases, which move to the host) and
  `tests/engines.spec.ts`.
- **Tooling and docs:** `pack-rules.ts`, `scripts/check-import-specifiers.ts` and their spec, both CLAUDE.md
  files and `services-and-data.md`.
- **Not changing:** pack code. It reads `repository` from `#generated/repository`, whose type and import stay.

## Questions before building

- **Which tooling binds only an engine (`_bindEars`) and reads `repository`?** The CLI's db console and the
  flow compiler are the candidates. If any does, it needs packs bound too, or it reads no repository.
- **Does replacement's atomicity survive?** `replacement.spec.ts` spies on `registerRepository` to fail a swap
  half way. The same guarantee has to hold on the registry's own map.
- **Should the view expose the map or a lookup?** The proxy needs only a lookup. The specs' `toEqual({ … })` on
  `admin.repositories()` suggests a read of the whole map for diagnostics.

## Done when

- No `@apackdev/ears` member or export mentions a repository, other than `RepositoryError`.
- `resetTestData` creates an engine and copies nothing into it.
- Pack code is unchanged.
- `npm run chain -- --no-native` is green.
