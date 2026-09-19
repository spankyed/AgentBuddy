> **Written in session** `36f122d9-3a1e-40ef-988d-40b2574fc098` (Claude Code, 2026-09-18). Resume it with `claude -r 36f122d9-3a1e-40ef-988d-40b2574fc098`.

```
# Goal: a running dev app keeps the @abuddy packages' dist current

Implement docs/goals/goal-dev-loop-freshness.md on a branch cut from master once
AS/single-mode-packs (#192) lands. Read Background, Decisions, Phases and Constraints first.
Decisions are final: implement them, don't reopen them or stop to ask. Where a detail isn't
specified, pick the conventional option, note it in the final summary, and keep going. No backward
compatibility in code: change signatures, move modules, migrate every in-repo caller, test, fixture,
template and doc in the same change, and fix forward.

Finished when:
- Phases 1–4 are implemented and each meets its "Done when"; every new guard, helper or test is
  mutation-checked.
- Editing a source of @abuddy/ears, @abuddy/sdk or @abuddy/ui while `npm start` runs rebuilds that
  package's dist on its own, within a few seconds of the edit, without rebuilding the built-in pack.
- The watcher's watch set is derived from BUILD_UNITS rather than listed again, so adding an input to
  a unit extends the watcher with no second edit.
- A build that fails mid-edit, and a build the lock is already held for, both leave the dev session
  running.
- The freshness doors table in packages/abuddy-testing/CLAUDE.md lists the new door, and the "What a
  running dev app does and doesn't pick up" section says what changed.
- npm run typecheck; npm test -w @abuddy/cli; npm test -w @abuddy/host; npm run build; npm test.
```

## Background

`npm start` leaves the built-in pack on two clocks, documented in `packages/abuddy-testing/CLAUDE.md`
under "What a running dev app does and doesn't pick up". The renderer's Vite config and the API's tsup
build both declare the `@abuddy/source` condition, so editing `@abuddy/sdk`, `@abuddy/ears` or
`@abuddy/ui` hot-reloads the browser and the pack's running code follows source. What does not follow is
anything read from those packages' **`dist`**, which is built on demand in a checkout and refreshed only
when a command with a freshness door runs (the six doors are listed in that same file).

The symptom people hit: **the editor type-checks `packages/default-setup` against the packages' `dist`**,
because default-setup's `tsconfig.json` correctly declares no condition — it is a pack config. Change an
SDK type and the editor keeps showing the old one until something rebuilds. `npm start` builds it once at
startup and then never again for the life of the session.

Two earlier proposals for this were rejected on measurement, and the numbers are recorded so they are not
re-derived:

| Proposal | Why not | Where |
|---|---|---|
| Stat-before-hash, so the check is cheap enough to run continuously | The check is already 24ms; the 345ms of `packages:ensure` is npm spawn and node/tsx startup. Saving ~20ms is not worth a cache key that is right unless a file changes content while keeping its size and timestamp. | comment on `fingerprintInputs`, `@abuddy/host/build/packages-built` |
| Rebuild the built-in pack whenever the SDK changes | `abuddy build` for default-setup is ~14s, and what it refreshes (compiled seeds, the facade dependents consume, the step build, the seed runtime) is not what bites the person editing SDK and default-setup together. | Decision 2 below |

### Measurements (this machine, warm)

| | |
|---|---|
| `stalePackageUnits()` in-process | **24ms** (417 files, 2.5MB) |
| `npm run packages:ensure`, everything fresh | **345ms** (24ms of work, ~320ms process startup) |
| `build:package -w @abuddy/ears` | 1.10s |
| `build:package -w @abuddy/sdk` | 2.47s |
| `build:package -w @abuddy/ui` | 4.99s |
| `build:package -w @abuddy/testing` | 2.58s |
| `abuddy build` for default-setup | ~14s |

`ensurePackagesBuilt` builds only the stale units, so an SDK edit costs 2.5s, not the 12s a full
`packages:build` takes.

## Decisions

- **Solve the packages' `dist` going stale; leave the pack's build output alone.** These are two
  different problems with different consumers. The editor, and any later `abuddy build`, read the
  packages' `dist` — that is the everyday pain and it costs 1.1–5.0s to fix. The pack's own build output
  (compiled seeds, `dist/types/pack-types.d.ts`, `dist/build/*`) is consumed by dependent packs and by
  seeding, not by someone editing SDK and default-setup together, and costs ~14s.
- **Nothing rebuilds the built-in pack on an `@abuddy` source change.** The existing trigger stays as it
  is: default-setup's own sources, through `dev-build.mjs --watch`. Keeping `dist` current means the pack
  rebuild that does fire consumes a fresh SDK, which is the ordering win without the cost.
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
  building" and re-checks on the next change.
- **A failed build never ends the dev session.** Half-typed source is normal while editing. Report it
  where the dev output goes and keep watching.
- **`abuddy dev` gets the same treatment as `npm start`.** It has the same shape — a long-running session
  over a pack linked to a checkout — and today it ensures once at startup (`commands/dev.ts`).

## Phases

### Phase 1 — the watcher

- A module in `@abuddy/host` beside the freshness rule (`src/build/`), exporting something like
  `watchPackageFreshness({ onBuilt?, onError? }): () => void`.
- Its watch set is every existing directory and file in `BUILD_UNITS[*].inputs`, deduplicated. Watch with
  `fs.watch` and `{ recursive: true }` on directories.
- Debounce to idle (300ms is conventional; note whatever is chosen). Coalesce: never run two builds at
  once, and queue at most one follow-up.
- On fire: `stalePackageUnits()`; if empty, do nothing. Otherwise build, and report through `onBuilt`.
- A held build lock is not an error: skip the round, leave the next change to pick it up. A build that
  throws goes to `onError` and the watcher keeps running.
- **Done when:** a spec drives the module against a temp fixture — an edit triggers one build; two edits
  inside the debounce window trigger one; an edit during a build queues exactly one follow-up; a throwing
  build leaves the watcher live; a held lock is skipped rather than raised. Mutation: removing the
  coalescing makes the concurrent-edit spec fail; removing the lock skip makes the held-lock spec fail.

### Phase 2 — `npm start`

- `packages/dev-mode.js` starts the watcher for the life of the session and stops it on shutdown,
  printing what it rebuilt in the same style as the rest of the dev output.
- It does not touch `dev-build.mjs`: default-setup's watcher keeps its own trigger (Decision 2).
- **Done when:** with `npm start` running, editing a `@abuddy/sdk` source rebuilds `packages/abuddy-sdk/dist`
  within a few seconds and prints one line; editing a `@abuddy/ui` source rebuilds only `@abuddy/ui`; the
  built-in pack is not rebuilt by either. Verified by hand and recorded in the Outcome with the observed
  timings.

### Phase 3 — `abuddy dev`

- `commands/dev.ts` keeps its startup `ensureCheckoutPackages(root)` and adds the watcher for the session,
  for a pack whose packages come from a checkout (`checkoutFor`) and not otherwise.
- The rebuild loop still calls `build()`, which does not ensure — the reason is in `buildCommand`'s
  comment and does not change.
- **Done when:** `abuddy dev` in a pack linked to a checkout rebuilds that checkout's stale package on an
  SDK edit; `abuddy dev` in a pack with installed packages starts no watcher. A spec covers the second.

### Phase 4 — the record

- Add the watcher to the doors table in `packages/abuddy-testing/CLAUDE.md` as a third kind, or as a
  fixer with its trigger named — it is the first door that is neither a command nor a check inside a
  test process.
- Rewrite "What a running dev app does and doesn't pick up": the packages' `dist` now follows source, and
  what stays frozen is the pack's own build output, with the reason.
- **Done when:** no sentence in that file describes the old behaviour, and the doors table's count
  matches the doors that exist.

## Constraints

**Never**: commit, stage or push without being asked; publish anything or trigger a workflow; open, copy
or modify a real user data dir (`~/Library/Application Support/abuddy*`); `pkill`/`killall` Electron or
node; run bare `tsc` in `packages/preload`; edit version or release metadata; add a backward-compatibility
shim or re-export; loosen a failing assertion instead of investigating it; leave a new guard or helper
without a mutation check.

**Also**: don't put the pack rebuild in any loop (Decision 2); don't add a second list of watched paths
(Decision 4); don't make the watcher spawn npm (Decision 5).
