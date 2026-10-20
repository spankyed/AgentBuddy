> **Written in session** `36f122d9-3a1e-40ef-988d-40b2574fc098` (Claude Code, 2026-09-18). Resume it with
> `claude -r 36f122d9-3a1e-40ef-988d-40b2574fc098`.

Status: retained; re-audit against the completed naming contracts. Current dev-mode has API/source watchers and a pack
runtime watcher; this older survey must not be treated as their complete inventory. Separate package-dist
freshness from descriptor/codegen/runtime freshness. The latter is required by
[discovery](../archive/plans/discovery-without-activation.md): declaration edits must refresh catalog metadata
and bindings together, and failed rebuilds must retain/report the last valid view. Do not add a parallel
watcher before checking the existing watch inputs and build locks.

```
# Goal: a running dev app keeps the @apackdev packages' dist current

Implement docs/goals/goal-dev-loop-freshness.md, it may be outdated so first verify all claims. Read Background, Decisions, Phases and Constraints first.
Preserve the scoped package-dist goal, but re-audit watcher inputs and coordination against the
discovery plan before implementing. Resolve stale survey assumptions in this document first. No backward
compatibility in code: change signatures, move modules, migrate every in-repo caller, test, fixture,
template and doc in the same change, and fix forward.

Finished when:
- Phases 1–4 are implemented and each meets its "Done when"; every new guard, helper or test is
  mutation-checked.
- Editing a source of @apackdev/ears, @apackdev/sdk or @apackdev/ui while `npm run dev` runs rebuilds that
  package's dist on its own, within a few seconds of the edit, without a blanket full rebuild of the shipped pack; refresh affected descriptor/codegen inputs when required.
- The watcher's watch set is derived from BUILD_UNITS rather than listed again, so adding an input to
  a unit extends the watcher with no second edit.
- A build that fails mid-edit, and a build the lock is already held for, both leave the dev session
  running.
- The freshness doors table in packages/apack-testing/CLAUDE.md lists the new door, and the "What a
  running dev app does and doesn't pick up" section says what changed.
- Focused watcher/coordination specs and npm run chain, following current repository validation commands.
```

## Background

`npm run dev` leaves the built-in pack on two clocks, documented in `packages/apack-testing/CLAUDE.md`
under "What a running dev app does and doesn't pick up". The renderer's Vite config and the API's tsup
build both declare the `@apackdev/source` condition, so editing `@apackdev/sdk`, `@apackdev/ears` or
`@apackdev/ui` hot-reloads the browser and the pack's running code follows source. What does not follow is
anything read from those packages' **`dist`**, which is built on demand in a checkout and refreshed only
when a command with a freshness door runs (the six doors are listed in that same file).

The symptom people hit: **the editor type-checks `packages/default-setup` against the packages' `dist`**,
because default-setup's `tsconfig.json` correctly declares no condition — it is a pack config. Change an
SDK type and the editor keeps showing the old one until something rebuilds. `npm run dev` builds it once at
startup and then never again for the life of the session.

Two earlier proposals for this were rejected on measurement, and the numbers are recorded so they are not
re-derived:

| Proposal | Why not | Where |
|---|---|---|
| Stat-before-hash, so the check is cheap enough to run continuously | The check is already 24ms; the 345ms of `packages:ensure` is npm spawn and node/tsx startup. Saving ~20ms is not worth a cache key that is right unless a file changes content while keeping its size and timestamp. Re-measured 2026-09-28 at chain-sweep scale (12 units, 39.1MB), where the arithmetic is worse: the stats *are* the walk, and a unit whose stats moved pays both, 861ms against 661ms — which is the ordinary case, since a chain run is a run you made because something changed. | comment on `fingerprintInputs`, `@apackdev/host/build/packages-built` |
| Rebuild the built-in pack whenever the SDK changes | `apack pack build` for default-setup is ~14s, and what it refreshes (compiled content, the facade dependents consume, the step build, the content runtime) is not what bites the person editing SDK and default-setup together. | Decision 2 below |

### Measurements (this machine, warm)

| | |
|---|---|
| `stalePackageUnits()` in-process | **24ms** (417 files, 2.5MB) |
| `npm run packages:ensure`, everything fresh | **345ms** (24ms of work, ~320ms process startup) |
| `build:package -w @apackdev/ears` | 1.10s |
| `build:package -w @apackdev/sdk` | 2.47s |
| `build:package -w @apackdev/ui` | 4.99s |
| `build:package -w @apackdev/testing` | 2.58s |
| `apack pack build` for default-setup | ~14s |

`ensurePackagesBuilt` builds only the stale units, so an SDK edit costs 2.5s, not the 12s a full
`packages:build` takes.

## Handoff with discovery

[Manifest maturity](../plans/manifest-maturity.md) owns the priority order. Discovery must solve coherent
build publication for each migrated kind before switching its readers; it need not wait for this
entire package-dist watcher follow-up. This goal supplies reusable freshness coordination, not an
alternative catalog or permission to leave descriptor/codegen outputs stale. Update this goal’s measured
survey only with new evidence; historical timings below are not promises for the renamed tree.

## Decisions

- **Own package-dist freshness, not the entire pack build loop.** Editor types and subsequent pack
  builds consume package `dist`. Refresh those stale units using the existing freshness rule. Discovery
  owns affected pack descriptor/codegen/runtime publication; this watcher must coordinate with that
  contract without taking over compiled-content and dependent-pack builds indiscriminately.
- **Do not rebuild the shipped pack indiscriminately on package edits.** Package-dist freshness and
  pack descriptor/runtime freshness have different consumers. Discovery owns the latter’s invalidation
  contract: an edit affecting generated API types or declarations must refresh the affected pack outputs
  before publication. Ordinary package implementation edits need not run the entire pack build. Derive
  affected inputs from the existing build graph; coordinate the package and pack watchers rather than
  create independent publishers that can pair stale metadata with new bindings.
- **Pull-based, not push-based.** No `tsc --watch` or `tsdown --watch` per package: that is three
  long-running toolchains rebuilding on every save whether or not anything consumes the output. The
  watcher observes, then calls the check the repo already has, which builds only what is stale.
- **The watch set is derived from `BUILD_UNITS`, not listed again.** Each unit already declares its
  inputs. A watcher with its own list is a second place to forget, and this repo has just spent a branch
  removing exactly that shape.
- **Call `ensurePackagesBuilt()` in-process.** It costs 24ms to check. Spawning `npm run packages:ensure`
  would cost 345ms for the same answer and lose the ability to handle failure gracefully.
- **A watcher skips a held lock; it does not fail.** `withBuildLock` fails immediately when another
  process holds it, which is right for a command and wrong here: running `npm run typecheck` in another
  terminal must not put an error in the dev session. The watcher treats a held lock as "someone else is
  building" and retains pending work until the lock is released. Use a bounded retry or release signal,
  with shutdown cleanup; freshness must not depend on another source edit.
- **A failed build never ends the dev session.** Half-typed source is normal while editing. Report it
  where the dev output goes and keep watching.
- **`apack pack dev` gets the same treatment as `npm run dev`.** It has the same shape — a long-running session
  over a pack linked to a checkout — and today it ensures once at startup (`commands/run.ts`).

## Phases

### Phase 1 — the watcher

- A module in `@apackdev/host` beside the freshness rule (`src/build/`), exporting something like
  `watchPackageFreshness({ onBuilt?, onError? }): () => void`.
- Its watch set is every existing directory and file in `BUILD_UNITS[*].inputs`, deduplicated. Watch with
  `fs.watch` and `{ recursive: true }` on directories.
- Debounce to idle (300ms is conventional; note whatever is chosen). Coalesce: never run two builds at
  once, and queue at most one follow-up.
- On fire: `stalePackageUnits()`; if empty, do nothing. Otherwise build, and report through `onBuilt`.
- A held build lock is not an error: retain pending work and re-check on release, without busy looping. A build that
  throws goes to `onError` and the watcher keeps running.
- **Done when:** a spec drives the module against a temp fixture — an edit triggers one build; two edits
  inside the debounce window trigger one; an edit during a build queues exactly one follow-up; a throwing
  build leaves the watcher live; a held lock does not fail the session and eventually refreshes output
  without another edit. Mutation: removing the
  coalescing makes the concurrent-edit spec fail; removing the deferred retry makes the held-lock spec fail.

### Phase 2 — `npm run dev`

- `packages/dev-mode.js` starts the watcher for the life of the session and stops it on shutdown,
  printing what it rebuilt in the same style as the rest of the dev output.
- Reuse the existing pack watcher and coordinate affected package/descriptor outputs under Decision 2;
  do not add a second pack watch loop.
- **Done when:** with `npm run dev` running, editing a `@apackdev/sdk` source rebuilds `packages/apack-sdk/dist`
  within a few seconds and prints one line; editing a `@apackdev/ui` source rebuilds only `@apackdev/ui`; the
  shipped pack is not fully rebuilt for unrelated implementation edits. A descriptor-affecting edit
  must still refresh its generated outputs coherently. Verified by hand and recorded in the Outcome with the observed
  timings.

### Phase 3 — `apack pack dev`

- `commands/run.ts` keeps its startup `ensureCheckoutPackages(root)` and adds the watcher for the session,
  for a pack whose packages come from a checkout (`checkoutFor`) and not otherwise.
- Re-audit the pack rebuild loop’s freshness barrier. Pack output publication must wait for affected
  package outputs; do not depend on a startup-only ensure or add a second competing builder.
- **Done when:** `apack pack dev` in a pack linked to a checkout rebuilds that checkout's stale package on an
  SDK edit; `apack pack dev` in a pack with installed packages starts no watcher. A spec covers the second.

### Phase 4 — the record

- Add the watcher to the doors table in `packages/apack-testing/CLAUDE.md` as a third kind, or as a
  fixer with its trigger named — it is the first door that is neither a command nor a check inside a
  test process.
- Rewrite "What a running dev app does and doesn't pick up": the packages' `dist` now follows source, and
  explain which pack outputs refresh for descriptor-affecting edits and which remain unchanged, with the reason.
- **Done when:** no sentence in that file describes the old behaviour, and the doors table's count
  matches the doors that exist.

## Constraints

**Never**: commit, stage or push without being asked; publish anything or trigger a workflow; open, copy
or modify a real user data dir (`~/Library/Application Support/apack*`); `pkill`/`killall` Electron or
node; run bare `tsc` in `packages/preload`; edit version or release metadata; add a backward-compatibility
shim or re-export; loosen a failing assertion instead of investigating it; leave a new guard or helper
without a mutation check.

**Also**: do not add a blanket full pack rebuild to the package watcher (Decision 2); don't add a second list of watched paths
(Decision 4); don't make the watcher spawn npm (Decision 5).
