> **Written in session** `1d53eb9c-d886-49f8-bc5a-90793d43315e` (Claude Code, 2026-09-24). Resume it with `claude -r 1d53eb9c-d886-49f8-bc5a-90793d43315e`.

```
# Goal: a test knows what it needs, so the pipeline can act on it

Implement docs/goals/goal-test-tiers.md on master, at or after 7eb5aa1e5 — the base its Background was
surveyed at.
Before Phase 1, confirm the base: tests/scripts/test-external-pack.sh runs `abuddy validate`, `abuddy
build`, `tsc --noEmit`, `vitest run` and `abuddy test --app-root` in one loop, and scripts/chain.ts skips
the whole chain on an unchanged tree. If they don't, stop and say so — the plan was surveyed elsewhere.
Read Background, Decisions, Phases and Constraints first. Decisions are final: implement them, don't
reopen them or stop to ask.
Where a detail isn't specified, pick the conventional option, note it in the final summary, and keep
going. No backward compatibility in code: change signatures, move modules, migrate every in-repo caller,
test, fixture, template and doc in the same change, and fix forward. Stored user data is the exception:
it moves with migrations.

Finished when:
- Phases 1–5 are implemented and each meets its "Done when"; every new guard, helper or test is
  mutation-checked.
- Every check in the chain declares its tier, and no tier-1 or tier-2 check launches Electron.
- `npm run chain` runs tier 1 and tier 2 before `build`, and tier 3 after it.
- A tier-2 check skips when its own declared inputs are unchanged, and a spec fails if a tier-2 input
  set names the renderer, main, preload or a built app path.
- npm run chain --all passes; npm run typecheck; npm run test:unit.
- Measured before and after, in the doc: the chain's wall time, and each tier's.
- No suite sets a timeout above its tier's budget, retries exist only in tier 3, and no test drives an
  interactive prompt.
- A final summary: phase → done/deferred, evidence, and the conventional choices made.

Commit as you go:
- Commit each phase when its "Done when" holds and the checks are green — not once at the end. A
  phase is landable on its own; a commit is how that stays true. Conventional message, no
  Co-Authored-By or session lines, `git commit -- <paths>` naming only that phase's files.
- Check `git diff --cached` first: something outside the session stages files, and a pathspec commit
  leaves the rest of the index alone.
- Don't push, tag, or open a PR unless the user asks.

Never:
- push, tag or open a PR unless the user asks in this session.
- npm publish, create GitHub releases, or trigger workflows (dry runs only).
- open, copy or modify ~/Library/Application Support/abuddy* or any real data dir.
- pkill/killall Electron or node; launch the app outside the test env without an isolated
  ABUDDY_USER_DATA_DIR.
- run bare tsc on packages/preload, `npm install` in the example pack, or edit version/release
  metadata.
- change the typed EARS types' behaviour (packages/abuddy-sdk/TYPED-EARS.md) to make a call site compile.
- add backward-compat shims or loosen a failing assertion instead of investigating.
- delete a test to make a tier boundary hold. A test that needs the app is tier 3; that is an answer,
  not a failure.
- run the suites concurrently. Measured twice: total work goes from 348s to 567s and @abuddy/cli starts
  failing, because every suite already uses all the cores.
```

# Goal: a test knows what it needs, so the pipeline can act on it

Nothing in this repo records what a test depends on. Every attempt to make the pre-merge chain cheaper
has failed on the same discovery, four times in one session: the expensive checks each end by launching
the app, so each one transitively depends on nearly the whole repo, and nothing can be skipped, reordered
or cached. This goal gives every check a declared tier and separates the checks that need a built app
from the ones that don't.

## Background (2026-09-24, at 7eb5aa1e5 on master)

`npm run chain` (`scripts/chain.ts`) runs eight steps serially, 354s measured:

| Step | Time |
|---|---|
| `packages:ensure` | 0.3s |
| `compile` | 11.9s |
| `typecheck` | 55.8s |
| `test:unit` | 100.9s |
| `build` | 41.3s |
| `test:external-pack` | 39.4s |
| `npm test` (E2E) | 26.2s |
| `test:packaged-authoring` | 57s (was 78s before `7eb5aa1e5`) |

### One step, five concerns

`tests/scripts/test-external-pack.sh` loops over two fixture packs doing five different things:

| | Step | What it needs |
|---|---|---|
| 1 | `abuddy validate` | `@abuddy/cli`, `@abuddy/sdk` |
| 2 | `abuddy build` | those, plus default-setup's snapshot (the fixture depends on it) |
| 3 | `tsc --noEmit -p` | the CLI's generated output, `@abuddy/sdk`'s `dist` |
| 4 | `vitest run --root` | `@abuddy/sdk`, `@abuddy/host`, `@abuddy/testing` |
| 5 | `abuddy test --app-root "$ROOT"` | **the whole built app** — renderer, main, preload, api, default-setup |

Steps 1–4 need no app. Step 5 does, and because they share a script the whole step depends on the app.
`tests/scripts/test-packaged-authoring.sh` has the same shape: packing, installing, authoring, building
and typechecking a pack outside the monorepo, then `abuddy test` against this checkout.

`abuddy test` is Playwright only (`abuddy-cli/src/commands/test.ts:63` requires `playwright.config.ts`),
so a pack author asking "did my seeds compile correctly" has no way to find out without Electron.

### The tiering already half-exists

The fixtures are already split by kind, and the split is not honoured:

- `tests/fixtures/external-pack/tests/unit/` — ten specs over the in-memory harness (`startShell`), no
  Electron
- `tests/fixtures/external-pack/tests/e2e/` — four Playwright specs
- `tests/fixtures/bundled-ui-pack/tests/e2e/` — one

The repo's own tests are split the same way (`test:unit` against `npm test`), and the pack-facing scripts
run both halves in one step.

### What that cost, measured

Four attempts at a cheaper chain, each defeated by the same coupling:

| Attempt | Result |
|---|---|
| Run the steps in three lanes | Failed. `test:packaged-authoring` ran `packages:build`, rewriting `dist/` under the other lanes |
| Run them in lanes with that step alone | Failed. Work 348s → 567s, `@abuddy/cli` 56s → 118s: every step already uses all the cores |
| Drop `compile` as redundant with `build` | Wrong. No workspace declares a dependency on `@app/default-setup`, so `build -ws` gives no ordering guarantee, and the renderer's build reads the pack entry `compile` writes |
| One `vitest run` over eight projects | 105s against 100.9s, no gain — startup was only ~4s of 104s — and it broke `@app/api`'s `boot-recovery.spec.ts` |
| Per-step input caching | Not viable. Every expensive step reads the built app, so its honest input set is the whole repo |

Only the coarse gate survived: the chain skips itself when no tracked file under `packages/`, `scripts/`
or `tests/` has changed (of the 20 commits before this, three touched none).

### What is cheap, and already built

- `fingerprintInputs(paths)`, `unitStaleReason`, `stampFile`, `STAMP_VERSION`, `withBuildLock` —
  `@abuddy/host/build/packages-built`. A content-addressed task cache, used today for five package builds
  and nothing else. 1972 tracked files fingerprint in 160ms.
- `ensurePackagesBuilt()` returns before taking the build lock when nothing is stale, and
  `ABUDDY_PACKAGES_PREBUILT=1` makes staleness an error rather than a racing rebuild (`b76190721`).

### Industry practices this repo does not follow

Each of these was found in this survey, not taken from a list.

- **Nothing owns concurrency.** Eight suites each start their own scheduler and each claims every core, so
  the chain has eight independent opinions about parallelism and no budget. That is why running the steps
  in lanes made total work rise from 348s to 567s and `@abuddy/cli` fail. A build system has one job pool;
  this has N.
- **No test target declares its inputs**, so nothing can compute what a change affects. Bazel, Nx and
  Turborepo all start here, and this goal's Decision 1 is the same idea at the granularity the repo can
  reach today.
- **Timeouts are not sized to the tier.** `packages/api` and `packages/default-setup` both set
  `testTimeout: 120_000`. A unit test allowed two minutes means a hang is indistinguishable from slowness —
  and under load that is exactly how `@abuddy/cli` presented, as errors rather than a fast, clear failure.
- **There is no flake policy.** `playwright.config.ts` sets `retries: 0` and vitest sets none, while the CLI
  suite demonstrably fails under CPU pressure. The answer is not blanket retries: retrying a unit test hides
  a bug, and retrying an app E2E is ordinary. The distinction needs the tiers to exist first.
- **A test drives an interactive prompt.** `tests/scripts/test-packaged-authoring.sh:91` runs
  `env -u CI ... expect` to *unset* `CI` so the CLI will prompt, then answers "Choose 1 or 2: " with
  `send "1\r"`. The app choice should be injectable, with the prompt itself covered by a unit test of the
  prompt.
- **Per-test cost is invisible.** `@abuddy/cli` reports `tests 249s` inside a 56s wall; which tests those
  are is unknown. Every mainstream runner reports slowest-N, and it is how the 20% that costs 80% gets found.
- **One external input is not hermetic.** The same script reuses the developer's real npm cache
  (`npm_config_cache="$(npm config get cache)"`) so installs do not re-download. Pragmatic, and worth
  keeping, but it means a corrupted local cache changes a verdict; it should be a declared exception rather
  than an unremarked one.

## Decisions

Final.

**1. Three tiers, and a check declares which it is.**

| Tier | May read | May not | Examples |
|---|---|---|---|
| **1 pure** | its own package's source, the in-memory runtime, fakes | any build output, any app | most of the 3036 unit tests |
| **2 contract** | the built `@abuddy` packages, a pack's build output | the built app; Electron | `abuddy validate/build`, a pack's `tsc`, fixture unit specs, the CLI suite |
| **3 app** | the built app | — | the repo's E2E, `abuddy test` |

The tier is a property of the check, not of the package: one package may own checks in two tiers.

**2. The chain orders by tier, not by habit.** Tier 1 and tier 2 run before `build`, tier 3 after it.
`build` exists to serve tier 3, and today two tier-2 concerns wait on it for no reason.

**3. A tier-2 check may not depend on the app, and a guard says so.** A spec reads each tier-2 check's
declared inputs and fails if one names `packages/renderer`, `packages/main`, `packages/preload` or a built
app path. This is the invariant that keeps the tiers from collapsing again, and it is the one thing that
would have caught the coupling this goal exists to remove.

**4. Splitting the scripts is the work; deleting coverage is not.** `test-external-pack.sh` becomes two
entry points over the same fixtures — the contract half and the app half. Every assertion that exists today
still runs. A check that genuinely needs the app is tier 3 and stays there.

**5. Tier 2 gets per-check caching, tier 3 does not.** Once tier 2's inputs exclude the app they are narrow
and honest, so `fingerprintInputs` over them is worth a stamp. Tier 3 reads the built app, whose inputs are
the repo; the coarse gate already covers the only sound skip for it.

**6. One thing owns concurrency, and a suite takes a budget.** The chain decides how much of the machine
is in use; a suite does not assume all of it. Until a suite can be given a worker budget, the chain runs
them one at a time — which is what it does now, for the measured reason.

**7. Timeouts are per tier, not per package.** Tier 1 in seconds, tier 2 in tens of seconds, tier 3 up to a
minute. `testTimeout: 120_000` on a unit suite turns a hang into a slow pass, which is how a load-induced
stall reached the summary as two unexplained errors.

**8. Retries belong to tier 3 only.** An app E2E may retry; a unit or contract test may not, because there
the flake is the finding. A quarantine list is written down, with the date and the reason, or it is not
quarantined.

**9. `abuddy test` gains a way to run a pack's tier-2 checks without Electron.** A pack author testing
compiled seeds should not need a browser. The CLI already runs `vitest` for the fixtures from a shell
script; that belongs in the command.

## Phases

### Phase 1 — Name the tiers, and prove nothing in tier 2 needs the app

- Add the tier taxonomy to `docs/goals/README.md`'s neighbours — `tests/CLAUDE.md` if it exists, else the
  root `CLAUDE.md` beside "What to run after a change" — as Decision 1's table.
- Give `scripts/chain.ts` a `tier` per step, and print it in the summary. No reordering yet.
- Add the guard from Decision 3 over the tier-2 steps' declared inputs.

**Done when:** `npm run chain` prints each step's tier; the guard passes. **Mutation:** adding
`packages/renderer` to a tier-2 input set fails the guard.

### Phase 2 — Split the two welded scripts

- `tests/scripts/test-external-pack.sh` becomes `test-external-pack-contract.sh` (steps 1–4) and
  `test-external-pack-app.sh` (step 5), with npm scripts `test:external-pack:contract` and
  `:app`. `test:external-pack` stays as both, for anyone running it by hand.
- `tests/scripts/test-packaged-authoring.sh` does **not** split into two independent halves, and the plan
  should not pretend otherwise. It is a linear scenario: its 9 numbered steps build on each other, step 8
  (`abuddy test`) needs the archive step 6 produced, and step 9 reads the data step 8's app seeded. Give it a
  mode instead — `--contract` runs every step but 8 and 9 and the first-run prompt at line 89, which is only
  there to configure the app for step 8. That does not reduce the work when both run; what it buys is a half
  that can run in tier 2, before `build`, and be skipped on a commit that touches no app code.
- `test-external-pack.sh` is the one that splits cleanly, and is where the value is: its `validate`, `build`,
  `tsc` and `vitest` each assert something on their own and none of them feeds the Playwright step anything
  it could not rebuild.
- The chain runs the contract halves in tier 2 and the app halves in tier 3.

**Done when:** every assertion that ran before still runs; `npm run chain --all` passes; the contract
halves pass with the app **not** built (delete `packages/renderer/dist` and run them). That last check is
the point of the phase. **Mutation:** the contract half fails if its fixture's manifest is broken.

### Phase 3 — Cache tier 2 on its own inputs

- Extend `scripts/chain.ts` with a per-step input set for tier-2 steps, stamped under
  `node_modules/.cache/abuddy-chain/`, reusing `fingerprintInputs` and a `STAMP_VERSION`. Each step's
  declared paths are part of its own fingerprint, as `BUILD_UNITS` does, so editing the list invalidates
  that step alone.
- `--all` ignores every stamp.

**Done when:** a commit touching only `packages/renderer` skips every tier-2 step and still runs tier 3;
a commit touching `packages/abuddy-cli` runs them. Both measured and recorded. **Mutation:** removing a
path from a step's input set, then editing a file under it, still invalidates the step (because the list
is hashed).

### Phase 4 — `abuddy test` runs a pack's contract checks

- `abuddy test --contract` (name at implementer's discretion) runs the pack's `vitest` where it has one
  and skips Playwright, so a pack author can check compiled output without Electron. The fixture scripts
  use it instead of calling `vitest` directly.
- `abuddy init-tests` scaffolds both halves.

**Done when:** `abuddy test --contract` passes in both fixtures with no app built; `npm test -w @abuddy/cli`
covers the new flag; `test:packaged-authoring` uses it.

### Phase 5 — The practices that are work, not policy

- Size the timeouts per Decision 7, tier by tier, and delete the two `testTimeout: 120_000`.
- Make the app choice injectable so `test-packaged-authoring.sh` stops unsetting `CI` to drive a prompt with
  `expect`; cover the prompt itself in `@abuddy/cli`'s suite.
- Report slowest-N per suite in `scripts/chain.ts`'s summary, so the next person profiling `@abuddy/cli` has
  it without instrumenting anything.
- Record the npm-cache exception where the script uses it, as a declared non-hermetic input.

**Done when:** no suite sets a timeout above its tier's budget; `test-packaged-authoring.sh` contains no
`expect` script and no `env -u CI`; the chain prints the slowest five tests per suite. **Mutation:** a test
made to hang fails at its tier budget rather than at two minutes.

## Deferred

- **Per-package caching of tier 1.** `test:unit` is 101s and `@abuddy/cli` is over half of it. Splitting
  tier 1 by package needs a dependency graph between packages, which nothing declares today — the same
  gap this goal fixes one level up. Worth doing after Phase 3 proves the stamp mechanism on tier 2.
- **`@abuddy/cli`'s own cost.** It reports `tests 249s` across workers because it runs real `abuddy build`s.
  A shared built-fixture cache is the lever; profile which tests dominate first.
- **tsc project references** for `typecheck`'s 55.8s. Only `packages/renderer/tsconfig.json` uses
  `composite`/`references` today, so the other projects cold-start. Independent of this goal.
- **Declaring `@app/default-setup` as a dependency of the packages that build against it**, which would let
  `build -ws` order it and retire `compile`. Blocked on the renderer discovering packs rather than
  importing one.

## Constraints

The repo's standing rules (root `CLAUDE.md`) apply:

- commit each phase as it finishes, no attribution lines, `git diff --cached` first; pushing, tagging and
  PRs are on request;
- no publishing, releases or triggered workflows;
- no real data dirs, no broad pkill, E2E in the `abuddy-test` namespace;
- preload, example pack and release metadata rules;
- typed EARS types are change-controlled (`packages/abuddy-sdk/TYPED-EARS.md`);
- published packages: no `any`, the TypeScript floor, `api:update` after export changes with `etc/` committed;
- migrations follow `packages/abuddy-host/src/migrations/CLAUDE.md`;
- investigate failing tests, mutation-check new guards;
- external packs are first-class: the fixture packs, the example pack and `test:packaged-authoring` keep
  passing, and a pack author's path stays the one this repo tests;
- **measure before and after every phase.** Four proposals in the session that wrote this were rejected by
  one command each, and each had been argued for at length first.
