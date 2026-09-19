> **Done** (2026-09-18), as Phases 3 and 4 of [goal-dependency-provenance](goal-dependency-provenance.md)
> on `AS/dependency-provenance`. All three phases landed, in
> `packages/abuddy-cli/tests/helpers/pack-builds.ts` and
> `packages/abuddy-cli/tests/build/dependency-graph.spec.ts`. Kept for the reasoning behind them.
>
> Two notes for a later reader:
>
> - **Phase 2 asks the diamond to assert `typeOwners.entities`, which no longer exists.** The goal it
>   landed inside replaced `typeOwners`, `dependencyCommands` and `dependencyPlugins` with one
>   `provenance` field, so the assertion is on `provenance.entities` — same claim, current shape.
> - **The measured cost this goal asked for:** the new spec runs in **26.1s** (8 tests, 25.9s of it in
>   the tests themselves), for 9 `abuddy build` invocations. That is over the four-build budget its
>   sibling goal stated; every one of them is a case the two Finished-when lists ask for, so it is
>   reported rather than trimmed.

# Goal: prove a diamond dependency builds, and that a facade missing an export fails

> **Written in session** `36f122d9-3a1e-40ef-988d-40b2574fc098` (Claude Code, 2026-09-18). Resume it with `claude -r 36f122d9-3a1e-40ef-988d-40b2574fc098`.

```
# Goal: prove a diamond dependency builds, and that a facade missing an export fails

Implement docs/goals/goal-diamond-dependencies.md on a branch cut from AS/outgoing-event-validation.
Read Background, Decisions, Phases and Constraints first. Decisions are final: implement them, don't
reopen them or stop to ask.
Where a detail isn't specified, pick the conventional option, note it in the final summary, and keep
going. No backward compatibility in code: change signatures, move modules, migrate every in-repo caller,
test, fixture, template and doc in the same change, and fix forward. Stored user data is the exception:
it moves with migrations.

Finished when:
- Phases 1–3 are implemented and each meets its "Done when"; every new guard, helper or test is
  mutation-checked.
- packages/abuddy-cli/tests/build/dependency-graph.spec.ts exists and builds a four-pack diamond
  (A → {B, C} → D) with the real `abuddy build`, asserting A builds and names D's entity once.
- A build against a dependency whose facade lacks a required export fails, naming the missing export
  and the dependency, proven against a real built snapshot rather than a hand-written one.
- Mutation: reverting `declaredBy` in mergeRegistries to attribute a name to the dependency it arrived
  through fails the diamond test; removing a name from REQUIRED_FACADE_EXPORTS fails the missing-export
  test.
- npm run typecheck passes, and npm test -w @abuddy/cli passes.
- The new spec's wall-clock cost is recorded in the final summary, measured, not estimated.
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
- add fixture packs under tests/fixtures/ for this goal, or wire anything into
  tests/scripts/test-external-pack.sh (Decision 1 explains why).
- run a Playwright E2E for the diamond: the defect is build-time and an E2E proves nothing about it.
```

## Background (2026-09-18, at 8530b002f)

**The defect this covers was real and is already fixed; nothing proves it stays fixed.**

A pack's `dist/snapshot.json` records its own entity names *and its dependencies'*, so a dependent
resolves a chain one level deep without reading snapshots transitively
(`packages/abuddy-cli/tests/build/snapshot-entity-names.spec.ts`). `mergeRegistries`
(`packages/abuddy-sdk/src/build/generate-entries.ts:21`) then attributed each name to the dependency it
*arrived through*, not the pack that *declares* it. A dependent of two packs sharing an ancestor
therefore saw the ancestor's entities from both and reported a collision that wasn't one:

```
Type conflicts:
  entity "Thread" declared by both "left-pack" and "right-pack"
```

Every pack depends on the base pack, so this was every pack with two dependencies. Measured at the
time: `tests/fixtures/external-pack` surfaces 13 entities, 12 of them inherited from default-setup — so
two such dependencies would have collided on 12 names.

The fix records `typeOwners` in the snapshot (`packages/abuddy-sdk/src/build/manifest.ts`) and resolves
conflicts by the declaring pack (`declaredBy` in `mergeRegistries`). It is currently guarded only by
unit tests over hand-written snapshot objects
(`packages/abuddy-sdk/tests/build/generate-entries.spec.ts`, `describe('a diamond dependency')`). Those
pin the merge logic; they do not prove that `abuddy build` *writes* `typeOwners` such that a real
dependent reads it. The bug class is real dependency graphs, and no test builds one.

**The facade capability check has the same shape of gap.** `requireFacadeExports`
(`generate-entries.ts:~207`) fails a build when a dependency's facade lacks any of
`PackEntityShapes`, `PackStepNodes`, `PackSystemEvents`, `Services`, `Repositories` — or `PackEvents`
for a dependency some `sendsTo` names. Its unit tests construct facades as strings. Nothing builds a
real pack, strips an export from what it published, and confirms a dependent fails.

**What already exists, and is the reason this goal is small.**
`packages/abuddy-cli/tests/build/facade-typing.spec.ts:291` (`buildPacks`) already builds a two-pack
chain — `base-pack` → `app-pack` — in a temp dir, by running the real CLI:

```ts
const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'facade-typing-'));
const modules = published ? path.join(installPublishedPackages(), 'node_modules') : path.join(REPO_ROOT, 'node_modules');
for (const [name, files] of [['base-pack', BASE_PACK], ['app-pack', APP_PACK]] as const) {
  const dir = path.join(parent, name);
  write(dir, files);
  fs.symlinkSync(modules, path.join(dir, 'node_modules'), 'dir');
  const build = run(process.execPath, [CLI, 'build'], dir);
  if (build.code !== 0) throw new Error(`abuddy build failed in ${name}:\n${build.output}`);
}
```

Its helpers are `write`, `run` (`:268`), `packageJson`, `tsconfig`, and the pack bodies `BASE_PACK`
(`:35`, 46 lines) and `APP_PACK` (`:82`, 23 lines). Sibling packs under `parent` resolve each other
through `resolveFromWorkspace` ("a dependency in a directory the pack sits under",
`packages/abuddy-cli/src/commands/fetch-deps.ts:107`), which labels the resolution `workspace`.

**Why `tests/fixtures/` is the wrong home.** `tests/scripts/test-external-pack.sh` runs, per fixture:
`abuddy validate`, `abuddy build`, `tsc --noEmit`, vitest if the pack has a config, then
`abuddy test --app-root` — a Playwright E2E. `abuddy test` requires a `playwright.config.ts`. A fixture
pack therefore drags in an app launch and an E2E suite, none of which exercises a build-time codegen
defect.

## Decisions

Final.

1. **The diamond lives in the CLI suite as a temp-dir build, not as fixture packs.** Add
   `packages/abuddy-cli/tests/build/dependency-graph.spec.ts`, reusing `facade-typing.spec.ts`'s
   approach (`write`, `run`, the CLI path, the `node_modules` symlink). The defect is entirely in what
   `abuddy build` writes and what codegen reads; installing and running the packs adds cost and covers
   nothing extra. This is also why the prompt forbids fixture packs and `test-external-pack.sh` edits.

2. **The diamond is four synthetic packs, not default-setup.** `base-pack` (D) declares an entity;
   `left-pack` and `right-pack` (B, C) each depend on D and declare one of their own; `app-pack` (A)
   depends on B and C. Synthetic D keeps the test fast, keeps the entity names owned by the test, and
   avoids coupling it to default-setup's evolving entity set.

3. **Build one layout, not the published matrix.** `facade-typing.spec.ts` builds each pack under both
   workspace-source and published layouts. `typeOwners` is written and read by the same CLI and SDK code
   either way, so the diamond builds once, against workspace source. Note this in the spec so nobody
   "restores" the matrix without a reason.

4. **The missing-export test strips a real built facade.** Build `base-pack`, then remove a required
   export from the `defs[PACK_TYPES_DEF]` entry of its written `dist/types/snapshot.json`, then build a
   dependent against it. That proves the check against what a build actually publishes, which is the
   half the unit tests can't reach.

5. **Remedy-per-source stays a unit test.** A temp-dir build resolves its dependency as `workspace`, so
   only the rebuildable remedy is reachable there. The `github:`/`installed app` and cache-hit branches
   are already covered by unit tests over `facadeRemedy`; don't contrive a fake GitHub resolution.

6. **Assert the entity survives, not just that the build exits 0.** A build could succeed while dropping
   the shared entity. The dependent's generated `EntityName` must contain D's entity exactly once, so
   read `src/__generated__/ears.ts` from the built dependent and assert on it.

## Phases

### Phase 1 — Extract the shared pack-building helpers

- Move `write`, `run`, `packageJson`, `tsconfig` and the CLI path out of `facade-typing.spec.ts` into a
  helper beside the existing ones (`packages/abuddy-cli/tests/helpers/`), and have `facade-typing.spec.ts`
  import them. Keep `BASE_PACK`/`APP_PACK` where they are: they belong to that spec's scenario.
- No behaviour change; this is so Phase 2 doesn't copy them.

**Done when:** `npm test -w @abuddy/cli` passes unchanged, and `facade-typing.spec.ts` declares none of
the four helpers itself.

### Phase 2 — The diamond builds

- Add `packages/abuddy-cli/tests/build/dependency-graph.spec.ts`. Build the four packs of Decision 2 in
  one temp dir, in dependency order, each with the `node_modules` symlink.
- Assert: `app-pack` builds (exit 0), and its generated `EntityName` names D's entity once (Decision 6).
- Assert the snapshots carry ownership: `left-pack`'s `dist/types/snapshot.json` records D's entity in
  `typeOwners.entities` as owned by `base-pack`, not by itself.
- Keep a second case for the collision that *is* real: two packs each declaring the same entity name
  independently must still fail with `declared by both`.

**Done when:** the spec passes; `app-pack`'s build output contains no `Type conflicts`. Mutation:
changing `declaredBy` (`generate-entries.ts`) to `return via;` fails the diamond case and leaves the
genuine-collision case passing.

### Phase 3 — A facade missing an export fails a real build

- In the same spec, after building `base-pack`, strip one name from
  `snapshot.defs[PACK_TYPES_DEF]` in its written snapshot (Decision 4) and build a dependent against it.
- Assert the build fails, and that the message names both the missing export and `base-pack`.
- Assert the `PackEvents` half separately: a dependent whose `system.sendsTo` names a plugin of a
  dependency whose facade lacks `PackEvents` fails, and one that names no such plugin builds.

**Done when:** both cases pass. Mutation: removing `'Repositories'` from `REQUIRED_FACADE_EXPORTS` fails
the missing-export case; removing the `eventDeps` requirement fails the `sendsTo` case.

## Deferred

- **Runtime or E2E coverage of a diamond.** The registry already refuses a duplicate entity type at
  registration and that path has its own tests; nothing here needs an app.
- **A published-layout run of the diamond** (Decision 3).
- **Fabricating a `github:` resolution** to reach that remedy branch end to end (Decision 5).

## Constraints

- Commits only on request, in logical chunks, no attribution lines, `git diff --cached` first.
- No publishing, releases or triggered workflows.
- No real data dirs; no broad `pkill`.
- No bare `tsc` on `packages/preload`; no `npm install` in the example pack; no version or release
  metadata edits.
- Typed EARS types are change-controlled (`packages/abuddy-sdk/TYPED-EARS.md`). This goal adds tests
  over `mergeRegistries`' behaviour and must not change it.
- Published packages: no `any`, the TypeScript floor, `api:update` after export changes. Phase 1 moves
  test helpers only and should need none.
- `packages:build` before the CLI suite; the suite's `pretest` handles it.
- Investigate a failing test rather than loosening it; mutation-check every new guard.
- Each `abuddy build` in a temp dir costs seconds. Four builds is the budget for the whole spec — if it
  grows past that, say so in the summary rather than letting the CLI suite get slower quietly.
