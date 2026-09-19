> **Done** (2026-09-18) on `AS/dependency-provenance`, cut from `AS/outgoing-event-validation`. All four phases landed.

# Goal: one provenance record for what a dependency tree declares

> **Written in session** `36f122d9-3a1e-40ef-988d-40b2574fc098` (Claude Code, 2026-09-18). Resume it with `claude -r 36f122d9-3a1e-40ef-988d-40b2574fc098`.

```
# Goal: one provenance record for what a dependency tree declares

Implement docs/goals/goal-dependency-provenance.md on a branch cut from AS/outgoing-event-validation.
Read Background, Decisions, Phases and Constraints first. Decisions are final: implement them, don't
reopen them or stop to ask.
Where a detail isn't specified, pick the conventional option, note it in the final summary, and keep
going. No backward compatibility in code: change signatures, move modules, migrate every in-repo caller,
test, fixture, template and doc in the same change, and fix forward. Stored user data is the exception:
it moves with migrations.

Finished when:
- Phases 1–4 are implemented and each meets its "Done when"; every new guard, helper or test is
  mutation-checked.
- `PackSnapshot` carries one `provenance` field. `dependencyCommands`, `dependencyPlugins` and
  `typeOwners` no longer exist in the source, and neither do `DependencyCommand`,
  `DependencyCommandSource`, `DependencyPlugin`, `DependencyPluginSource`, `_dependencyCommands` or
  `_dependencyPlugins` (`grep -r` finds them only in docs/archive).
- One `_mergeProvenance` serves entities, relKinds, commands and plugins; no kind has its own reader.
- A four-pack diamond (A → {B, C} → D) builds with the real `abuddy build`, and A's generated
  `EntityName` names D's entity once.
- A build against a dependency whose facade lacks a required export fails, naming the missing export
  and the dependency, proven against a real built snapshot.
- Mutations: dropping the own-manifest pass in `_mergeProvenance` fails the nearer-wins test; reverting
  `declaredBy` in mergeRegistries fails the diamond test while leaving the genuine-collision test
  passing; removing a name from REQUIRED_FACADE_EXPORTS fails the missing-export test.
- npm run typecheck, npm run api:check, and npm test -w @abuddy/cli and -w @abuddy/sdk all pass.
- npm run compile and npm run test:external-pack pass (both rebuild snapshots in the new shape).
- A final summary: phase → done/deferred, evidence, and the conventional choices made.

Never:
- commit, stage, push or tag unless the user asks in this session. When asked, commit in logical
  chunks (conventional messages, no Co-Authored-By or session lines) with `git commit -- <paths>`,
  and check `git diff --cached` first: something outside the session stages files.
- npm publish, create GitHub releases, or trigger workflows (dry runs only).
- open, copy or modify ~/Library/Application Support/abuddy* or any real data dir.
- pkill/killall Electron or node; launch the app outside the test env without an isolated
  ABUDDY_USER_DATA_DIR.
- run bare tsc on packages/preload, `npm install` in the example pack, or edit version/release
  metadata.
- change the typed EARS types' behaviour (packages/abuddy-sdk/TYPED-EARS.md) to make a call site compile.
- add backward-compat shims or loosen a failing assertion instead of investigating.
- keep a reader for the old snapshot fields, or a fallback for a snapshot without `provenance`.
- add fixture packs under tests/fixtures/, or wire anything into tests/scripts/test-external-pack.sh
  (Decision 4).
- run a Playwright E2E for the diamond: the defect is build-time and an E2E proves nothing about it.
```

## Background (2026-09-18, at 8530b002f)

**One concept is implemented three times.** A snapshot must tell a dependent what its whole tree
declares, so the dependent can report a collision naming the pack responsible. Three things travel that
way today, each with its own type, reader and shape:

| Field on `PackSnapshot` | Shape | Reader |
|---|---|---|
| `dependencyCommands` | `{ name, packId }[]` | `_dependencyCommands` (`manifest.ts`) |
| `dependencyPlugins` | `{ id, packId }[]` | `_dependencyPlugins` (`manifest.ts`) |
| `typeOwners` | `{ entities?: Record<string,string>; relKinds?: … }` | `ownerOf`, inline in `build.ts` |

The algorithm is identical in all three — walk the dependencies, take what each inherited, then let each
dependency's own declarations override, so the nearest pack wins:

```ts
for (const [depId, snapshot] of snapshots) {
  for (const { name, packId } of snapshot.dependencyCommands ?? []) owners.set(name, packId);
  for (const { name } of snapshot.manifest.commands ?? []) owners.set(name, depId);
}
```

`_dependencyPlugins` is that function with `name` renamed to `id`. `ownerOf` is that function written as
`Object.assign` over records, in a different package, and additionally folding in the pack's own names.

**The cost today:** 6 entries in `@abuddy/sdk/build`'s public API (`etc/build.api.md:219–253`), 5 field
declarations in `manifest.ts`, 14 call sites across `build.ts`, `generate-entries.ts` and `index.ts`,
and three test suites that each re-pin the same nearer-wins rule. The cost of the next kind that needs
to travel — services, steps, artifacts — is another type pair, another reader, another suite.

**Why now.** Two of the three fields were added today (`dependencyPlugins` in `7d5f67e83`,
`typeOwners` in `8cd745ece`). Nothing consumes a snapshot but this repo, so the shape is free to change;
it only gets more expensive as more code reads it.

**What this also closes.** `typeOwners` exists because `mergeRegistries`
(`packages/abuddy-sdk/src/build/generate-entries.ts`) used to attribute an entity to the dependency it
*arrived through* rather than the pack that *declares* it, so a dependent of two packs sharing an
ancestor reported a collision that wasn't one. Every pack depends on the base pack, so that was every
pack with two dependencies. The fix is guarded only by unit tests over hand-written snapshot objects;
nothing builds a real diamond, and nothing pins that a real build *writes* the ownership a dependent
reads. `tests/fixtures/external-pack`'s built snapshot does carry it (`Thread → default-setup`), and no
test asserts so.

**The build harness that makes this cheap.** `packages/abuddy-cli/tests/build/facade-typing.spec.ts:291`
(`buildPacks`) already builds a two-pack chain in a temp dir by running the real CLI, with a
`node_modules` symlink and sibling packs that resolve each other through `resolveFromWorkspace`. Its
helpers are `write`, `run` (`:268`), `packageJson` and `tsconfig`; `BASE_PACK` is 46 lines, `APP_PACK`
23. A four-pack diamond is an extension of that harness, not new scaffolding.

## Decisions

Final.

1. **One field, one reader.** `PackSnapshot.provenance?: PackProvenance`, where `PackProvenance` is
   `Partial<Record<ProvenanceKind, Record<string, string>>>` — name → the pack that declares it. One
   exported `_mergeProvenance(kind, deps, own?)` replaces `_dependencyCommands`, `_dependencyPlugins`
   and `ownerOf`. The kinds live in one table that maps a kind to how its names are read off a manifest:

   ```ts
   export const PROVENANCE_KINDS = {
     entities: (m) => Object.keys(m.entities ?? {}),
     relKinds: (m) => Object.keys(m.relKinds ?? {}),
     commands: (m) => (m.commands ?? []).map((c) => c.name),
     plugins:  (m) => (m.features ?? []).filter((f) => f.plugin).map((f) => f.id),
   } as const;
   ```

   Adding a kind is a line in that table. `DependencyCommand`, `DependencyCommandSource`,
   `DependencyPlugin` and `DependencyPluginSource` are deleted, not re-exported as aliases.

2. **Record shape, not array of pairs.** Two of the three already disagree; `Record<name, packId>` is
   the one that indexes without a scan, serialises smaller, and diffs legibly in a snapshot. The array
   forms carried no information the record doesn't.

3. **Delete the old fields outright.** A snapshot is a build artifact; every one in the repo is
   regenerated by `npm run compile` and the fixture builds, which Phase 4 runs. No reader for the old
   shape, no fallback, no deprecation window.

4. **The diamond is a temp-dir build in the CLI suite, not fixture packs.** `test-external-pack.sh` runs
   `abuddy validate`, `build`, `tsc`, vitest and then `abuddy test` — a Playwright E2E requiring a
   `playwright.config.ts`. The defect is build-time codegen; an app launch covers none of it and costs
   minutes. Reuse `facade-typing.spec.ts`'s harness instead.

5. **The diamond's D is synthetic, and the real graph is pinned separately.** Four synthetic packs keep
   the build test fast and its entity names owned by the test. That proves the mechanism but not that
   *default-setup's* snapshot carries provenance, so Phase 3 also asserts on
   `tests/fixtures/external-pack`'s built snapshot in `snapshot-entity-names.spec.ts`, which already
   reads it. Both halves, neither expensive.

6. **The broken facade is produced by editing a real built snapshot.** Phase 4 builds `base-pack`, then
   removes a name from `defs[PACK_TYPES_DEF]` in its written `dist/types/snapshot.json`, then builds a
   dependent. The alternative — building against a genuinely older CLI — proves more but costs a second
   toolchain. Editing the artifact is the trade accepted here; note in the spec that the facade under
   test is synthetic in origin though the build around it is real.

## Phases

### Phase 1 — Introduce `provenance` and the single reader

- Add `PackProvenance`, `ProvenanceKind`, `PROVENANCE_KINDS` and `_mergeProvenance` to
  `packages/abuddy-sdk/src/build/manifest.ts`; export from `build/index.ts`.
- Unit-test `_mergeProvenance` directly: inherited-then-own ordering, nearer-wins across two
  dependencies, a snapshot with no `provenance`, and one kind per table entry.

**Done when:** the new tests pass and nothing else changed behaviour. Mutation: dropping the
own-manifest pass fails the nearer-wins test; swapping the two loops fails it too.

### Phase 2 — Move the three consumers onto it, and delete the old shapes

- `build.ts` writes `provenance` for all four kinds via `_mergeProvenance`, and stops writing
  `dependencyCommands`, `dependencyPlugins` and `typeOwners`.
- `generate-entries.ts`: `checkCommandNames`, the transitive-plugin owner lookup, and `mergeRegistries`'
  `depOwners` all read `provenance`.
- Delete the four `Dependency*` types and the two `_dependency*` functions. Run `api:update`.

**Done when:** `grep -rn "dependencyCommands\|dependencyPlugins\|typeOwners\|_dependencyCommands\|_dependencyPlugins" packages/ scripts/`
returns nothing outside `docs/archive`; `npm run typecheck` and `npm run api:check` pass; the existing
command-collision, transitive-plugin and diamond unit tests pass unchanged in behaviour.

### Phase 3 — Prove it end to end on a real diamond

- Extract `write`, `run`, `packageJson`, `tsconfig` and the CLI path from `facade-typing.spec.ts` into
  `packages/abuddy-cli/tests/helpers/`, and have that spec import them (no behaviour change).
- Add `packages/abuddy-cli/tests/build/dependency-graph.spec.ts`: build `base-pack` (D), `left-pack` and
  `right-pack` (B, C, both on D), then `app-pack` (A, on B and C). Assert A builds, its generated
  `EntityName` names D's entity exactly once, and B's snapshot attributes D's entity to `base-pack`.
- Keep the collision that *is* real: two packs independently declaring the same entity still fail with
  `declared by both`.
- In `snapshot-entity-names.spec.ts`, assert `external-pack`'s built snapshot attributes an inherited
  entity to `default-setup` (Decision 5).

**Done when:** both specs pass; A's build output contains no `Type conflicts`. Mutation: `declaredBy →
return via` fails the diamond case and leaves the genuine-collision case passing.

### Phase 4 — Close the facade check's untested direction, and regenerate

- In the same spec, strip a required export from `base-pack`'s built snapshot and build a dependent:
  the build fails, naming the missing export and `base-pack`. Cover the `PackEvents` half separately —
  a dependent whose `sendsTo` names a plugin of such a dependency fails; one that names none builds.
- Run `npm run compile` and `npm run test:external-pack` so every in-repo snapshot is rewritten in the
  new shape (Decision 3).

**Done when:** both cases pass; `compile` and `test:external-pack` succeed. Mutation: removing
`'Repositories'` from `REQUIRED_FACADE_EXPORTS` fails the missing-export case; removing the `eventDeps`
requirement fails the `sendsTo` case.

## Outcome (2026-09-18)

All four phases landed on `AS/dependency-provenance`. The three fields and their readers are gone,
replaced by `PackSnapshot.provenance` and one `_mergeProvenance`; a four-pack diamond and the facade
check's failing direction are covered by real `abuddy build` runs. Everything in the Finished-when list
passes. One Decision needed correcting in practice (below), and the new spec runs over the stated build
budget.

### Per phase
| Phase | Status | Evidence |
|---|---|---|
| 1 — `provenance` and the single reader | done | `packages/abuddy-sdk/tests/build/provenance.spec.ts`, 13 tests. Mutations: dropping the own-manifest pass, swapping the two loops, and writing empty kinds each fail their test |
| 2 — consumers moved, old shapes deleted | done | `grep -r` finds the old names only in `docs/archive` and this doc; `etc/build.api.md` −6 entries +the provenance set; `npm run compile` leaves `default-setup/src/__generated__/ears.ts` byte-identical |
| 3 — the real diamond | done | `packages/abuddy-cli/tests/build/dependency-graph.spec.ts` (8 tests, 26.1s); harness extracted to `tests/helpers/pack-builds.ts` with `facade-typing.spec.ts` unchanged at 20 tests. Mutations: `declaredBy → via` fails both diamond cases and leaves the genuine-collision case passing; misattributing the fixture snapshot's inherited entity fails the Decision 5 assertion in `snapshot-entity-names.spec.ts` |
| 4 — the facade check's failing direction | done | same spec, three cases. Mutations: dropping `'Repositories'` fails the missing-export case; dropping the `eventDeps` requirement fails the `sendsTo` case |

### Conventional choices
- **`_buildProvenance` beside `_mergeProvenance`** (Phase 2). The Decisions name one reader; writing a
  snapshot needs all four kinds at once, and having `build.ts` loop the table itself would put the table
  in two places. It is a thin wrapper over the single reader, not a second one.
- **A kind that declared nothing is left out** rather than written as an empty record, so a snapshot says
  what it means. Pinned by a test.
- **`ProvenanceManifest` as the reader's input type** rather than `PackManifest`, so the table's functions
  state what they actually read and the unit tests need no cast.
- **The diamond's middle packs declare their own entities too** (`LeftNote`, `RightNote`), so the test
  distinguishes "the ancestor's name once" from "no names at all".

### Corrections to the Decisions
- **Decision 1 says one merged record; `mergeRegistries` needs one per dependency.** Merging across
  dependencies before `mergeRegistries` sees them loses the distinction the collision check is made of:
  two dependencies naming the *same* ancestor for a name is a diamond, two naming *different* packs is a
  real collision, and a single merged record answers only "who declares this". `mergeRegistries` takes
  `Map<depId, PackProvenance>`. The reader is still the one `_mergeProvenance` — the other three consumers
  use its merged output — but the parameter is per-dependency and the reason is recorded at the call site.
  Caught by the existing genuine-collision test, which failed on the merged version.

### Open items
- **The new spec runs 9 `abuddy build` invocations against the stated budget of four**: four for the
  diamond (D, B, C, A), two for the genuine collision (a rival declaring the same entity, and a dependent
  of both), and three for Phase 4's dependents. The Phase 4 cases reuse the already-built ancestor by
  copying its `dist`, so none of the three rebuilds it. Reported rather than trimmed because every one of
  them is a case the Finished-when list asks for.
- **The facade under test in Phase 4 is synthetic in origin** — a built snapshot with an export renamed —
  as Decision 6 accepted. The build around it is real.

### Final verification
| Check | Result |
|---|---|
| `npm run typecheck` | passes |
| `npm run api:check` | passes (reports regenerated for the six removed and five added entries) |
| `npm test -w @abuddy/sdk` | 439 passed |
| `npm test -w @abuddy/cli` | 718 passed |
| `npm run compile` | passes; generated `ears.ts` byte-identical to before the change |
| `npm run test:external-pack` | passes; fixture snapshots rewritten in the new shape |
| `default-setup` snapshot | `provenance` with all four kinds, no `typeOwners`/`dependencyCommands`/`dependencyPlugins` |

## Deferred

- **Extending provenance to services, steps or artifacts.** The table makes each a line; none is needed
  yet, and adding one without a consumer is speculative.
- **Runtime or E2E coverage of a diamond.** The registry already refuses a duplicate entity type at
  registration, with its own tests.
- **A published-layout run of the diamond.** Provenance is written and read by the same code in either
  layout.
- **Reaching the `github:` remedy branch end to end.** A temp-dir build always resolves `workspace`;
  `facadeRemedy`'s other branches stay unit-tested.

## Constraints

- Commits only on request, in logical chunks, no attribution lines, `git diff --cached` first.
- No publishing, releases or triggered workflows.
- No real data dirs; no broad `pkill`.
- No bare `tsc` on `packages/preload`; no `npm install` in the example pack; no version or release
  metadata edits.
- Typed EARS types are change-controlled (`packages/abuddy-sdk/TYPED-EARS.md`). Phase 2 changes where
  `mergeRegistries` reads ownership from, not what it decides; the generated `PackShapes` and
  `EntityName` must be byte-identical before and after for every in-repo pack. Check this by building
  default-setup on both sides and diffing `src/__generated__/ears.ts`.
- Published packages: no `any`, the TypeScript floor, `api:update` after export changes — Phase 2
  removes six public entries and must update `etc/build.api.md`.
- `packages:build` before the CLI suite; the suite's `pretest` handles it.
- Investigate a failing test rather than loosening it; mutation-check every new guard.
- Four `abuddy build` invocations is the budget for the new spec. If it grows past that, say so in the
  summary rather than letting the CLI suite get slower quietly.
