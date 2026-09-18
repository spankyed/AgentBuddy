> **Written in session** `36f122d9-3a1e-40ef-988d-40b2574fc098` (Claude Code, 2026-09-18). Resume it with `claude -r 36f122d9-3a1e-40ef-988d-40b2574fc098`.

```
# Goal: a change costs seconds to verify, not minutes

Implement docs/goals/goal-test-pipeline-speed.md on a branch cut from master once
AS/single-mode-packs (#192) lands. Read Background, Decisions, Phases and Constraints first.
Decisions are final: implement them, don't reopen them or stop to ask. Where a detail isn't
specified, pick the conventional option, note it in the final summary, and keep going. No backward
compatibility in code: change signatures, move modules, migrate every in-repo caller, test, fixture,
template and doc in the same change, and fix forward.

Finished when:
- Phases 1–3 are implemented and each meets its "Done when"; every new guard, helper or test is
  mutation-checked.
- `npm test -w @abuddy/cli` runs no build, install or child process, and finishes in under 15s.
- `npm run test:integration -w @abuddy/cli` runs the specs that do, and CI runs both.
- No test is deleted or weakened to make a number: every assertion that exists today still runs
  somewhere, and `npm run test:all` covers the same ground it covers now.
- npm run typecheck; npm run test:unit; npm run test:integration -w @abuddy/cli; npm run build;
  npm test; npm run test:external-pack.
```

## Background

Verifying a one-line change costs minutes, so it gets skipped or done wrong. Measured on this machine,
warm, one run each:

| Stage | Total | Longest step |
|---|---|---|
| `npm run typecheck` (11 steps) | 48.9s | `typecheck:pack` **16.4s** (vue-tsc over default-setup) |
| `npm run test:unit` (7 suites, sequential) | 92.3s | `@abuddy/cli` **53.1s** |
| `npm run build` | 44.0s | |
| `npm run compile` | 14.1s | |

Every other typecheck step is 1.2–5.3s. Every other unit suite is 1.9–18.4s. The cost is concentrated in
two places, and one of them dominates: **`@abuddy/cli` is 58% of all unit-test time.**

### Inside the CLI suite

61 files, 653 tests, **277s of file-time in 53s of wall clock** (vitest runs files in parallel).

| | Files | File-time |
|---|---|---|
| ≤5s each | 45 | 25.9s |
| >5s each | 16 | 251.1s |

```
51.1s  tests/build/facade-typing.spec.ts          real `abuddy build` ×2, then a 4-cell tsc matrix
38.2s  tests/cli/scaffold.spec.ts                 abuddy init → add feature → build → tsc → pack
23.5s  tests/build/fe-bundler-host-registry.spec.ts   real Vite library builds
21.0s  tests/build/types-bundler-determinism.spec.ts  two facade builds + npm pack
15.4s  tests/harness/harness-setup.spec.ts        vitest inside a temp pack
13.6s  tests/build/published-sdk-types.spec.ts    npm pack + tsc over the consumer matrix
13.2s  tests/build/import-specifiers.spec.ts      166 tests, pure in-process analysis
```

That last line is why the split cannot be by duration. `import-specifiers` is slow because it has 166
tests, not because it spawns anything, and it belongs in the fast suite.

**These tests are not the problem and must not be weakened.** The CLI suite is what caught the
declaration-emit break on `AS/single-mode-packs` — `tsc --emitDeclarationOnly` moved every published
`.d.ts` when an entry imported a file from outside the package — and it caught it precisely *because* it
runs a real build. The problem is that it runs on every change, not that it exists.

## Decisions

- **Split by what a spec does, not how long it takes.** A spec that runs a build, an install, or another
  process is an integration spec. A spec that runs in-process is a unit spec, however many assertions it
  has. Duration is the symptom; spawning is the cause, and it is the thing that stays true as the suite
  grows.
- **Use `*.integration.spec.ts`.** It is already this repo's convention
  (`default-setup/tests/integration/_hybrid/claude-code-permission-flow.integration.spec.ts`). Do not
  invent a second one, and do not move files between directories: `tests/build/`, `tests/cli/`,
  `tests/app/` and `tests/harness/` group by area, and the suffix is orthogonal to that.
- **The split is guarded, not just documented.** A spec asserts that no file in the fast `include`
  spawns a build or a child process. Without it the fast suite silently becomes slow again, which is the
  failure mode this repo keeps rediscovering.
- **Nothing is deleted, skipped or weakened.** Every assertion that runs today runs after this change.
  The only thing that changes is which command runs it and when.
- **CI runs both, and the pre-merge chain runs both.** The trade being accepted is that a developer who
  only runs the fast suite learns about an integration failure from CI. That is the normal trade for an
  integration suite; it is not acceptable for CI to lose coverage.
- **Parallelising `test:unit` comes after the lock is fixed, not before.** The suites share the package
  build stamps, and a build removes each stamp before rewriting it, so concurrent suites produce
  failures about the race rather than the code. This was observed, not theorised: a backgrounded
  `test:unit` racing a foreground `test:external-pack` failed two scaffold specs with "no build stamp".
- **No build-cache tool.** Turborepo or Nx would be a large dependency and a new mental model for a
  pipeline that Phase 1 alone takes under 10s in the common case. Revisit only if the numbers below are
  met and still not enough.

## Phases

### Phase 1 — split the CLI suite

- Rename each spec that runs a build, an install or a child process to `*.integration.spec.ts`. The
  candidates are the sixteen over 5s listed in Background, minus `import-specifiers.spec.ts`, plus any
  file under 5s that spawns — classify by reading, not by the timing table.
- `packages/abuddy-cli/vitest.config.ts`: the default `include` excludes `**/*.integration.spec.ts`. Add
  a `test:integration` script whose `include` is only that.
- Root `package.json`: `test:unit` keeps calling `npm test -w @abuddy/cli` (now the fast half). The
  pre-merge chain and `.github/workflows/ci.yml` gain the integration step.
- Update `packages/abuddy-cli/CLAUDE.md`'s Tests section: which suite holds what, and the rule for
  choosing.
- **Done when:** `npm test -w @abuddy/cli` finishes under 15s and runs no child process; the two suites'
  test counts sum to today's 653; a guard spec fails when a fast-suite file spawns a build. Mutation:
  renaming one integration spec back to `*.spec.ts` fails that guard.

### Phase 2 — let the suites run together

- `withBuildLock` currently fails immediately when another process holds the lock, which is right for a
  command and wrong for a reader. Give the freshness checkers a way to wait for an in-flight build
  instead of reporting its half-written stamps as stale. `runningPackageBuild`
  (`@abuddy/host/build/packages-built`) already identifies a live build; `assertCheckoutPackagesFresh`
  already reports it separately. The missing half is `published-packages.ts` and the fixers.
- Then make `test:unit` run its suites concurrently rather than as an `&&` chain.
- **Done when:** `npm run test:unit` and `npm run test:external-pack` started together both pass, ten
  times in a row; `test:unit` wall clock is under 25s. Mutation: reverting the lock change makes the
  concurrent run fail with a stamp error.

### Phase 3 — project references for the type checks

- `typecheck:pack` is 16.4s of vue-tsc over default-setup, a third of `npm run typecheck`. The
  `@abuddy/source` condition used to block `tsc -b`; pack configs no longer declare it, so references
  are possible. They need every package to go `composite` and `@abuddy/host` to gain a build.
- This is the largest change with the least certain payoff. Do it last, and stop if Phases 1 and 2 have
  already made the loop fast enough to stop being a complaint.
- **Done when:** `npm run typecheck` is under 30s with every check still running, or the phase is
  deliberately abandoned with the measurement that says it is not worth it.

## Constraints

**Never**: commit, stage or push without being asked; publish anything or trigger a workflow; open, copy
or modify a real user data dir (`~/Library/Application Support/abuddy*`); `pkill`/`killall` Electron or
node; run bare `tsc` in `packages/preload`; edit version or release metadata; add a
backward-compatibility shim or re-export; loosen a failing assertion instead of investigating it; leave a
new guard or helper without a mutation check.

**Also**: never delete, skip or weaken a test to make a number move (Decision 4); never let CI cover less
than it covers today (Decision 5); measure before and after each phase with the method in Background —
one warm run each, reported as a table — and put the numbers in the Outcome.
