# Test inventory

What tests this repo has, where they live, and how to tell where a test *belongs*. Kept current: it
describes the suite as it is, not a plan.

> **Surveyed** 2026-09-25 at `e055d73ee`. Spec-file counts and costs come from each package's
> `etc/spec-cost.json`, which `npm run spec-cost:check` holds to the tree. Test counts are not recorded
> here on purpose — they move on every commit, and nothing decides anything from them.

## Scale

365 spec files: 335 in nine package suites, 15 fixture-pack specs, 14 E2E, plus the root's own
`tests/scripts` shell checks.

| Suite | Specs | Fast half | Expensive half | Total |
|---|---|---|---|---|
| `@app/default-setup` | 86 | 13.8s | — | 13.8s |
| `@abuddy/host` | 77 | 18.9s | — | 18.9s |
| `@abuddy/cli` | 65 | 14.8s | 175.9s | **190.8s** |
| `@abuddy/sdk` | 56 | 15.1s | — | 15.1s |
| `@app/repo-checks` | 17 | 3.1s | 9.5s | 12.6s |
| `@app/api` | 15 | 5.6s | — | 5.6s |
| `@abuddy/ears` | 9 | 2.4s | — | 2.4s |
| `@app/renderer` | 8 | 0.1s | — | 0.1s |
| `@app/main` | 2 | 0.2s | — | 0.2s |
| | **335** | | | **259.4s** |

`@abuddy/cli` is 74% of the file time, and roughly 30s of that is specs whose subject is not the CLI — see
*Known misplacements*. Read its number as a suite total, not as a statement about the CLI.

**Two packages have source and no suite**, `@abuddy/testing` and `@abuddy/ui`; `packages/preload` has
neither specs nor a `test` script. `@app/electron-versions` and `@app/typescript-floor` hold no source.

## Where a spec lives

Every package keeps its specs in `tests/`, with one exception: `@app/default-setup` also has six under
`src/`, colocated with the code, and its `vitest.config.ts` names `src/**/*.test.ts` to pick them up.

Two suites have an expensive half, selected by measured cost rather than by what a spec does:
`@abuddy/cli` and `@app/repo-checks`, each with a `vitest.integration.config.ts` over
`tests/**/*.integration.spec.ts`. The rule is in [`scripts/lib/spec-cost.ts`](../../scripts/lib/spec-cost.ts):
a fast spec moves above 2.5s, an integration spec returns below 1.5s, and anything between stays — a dead
band, because a file's cost is its wall time under whatever else its half is running.
`repo-checks/tests/suite-split.spec.ts` fails a spec in the wrong half, has no recorded cost, or is
recorded and gone.

## Categories

Seven kinds are actually distinguishable in the tree. The tier is what a check may read
(root `CLAUDE.md`, *What a test may read*), and `npm run check:tiers` enforces it.

| Category | Where | Tier | Reads |
|---|---|---|---|
| **Package unit** | most of every `tests/` | 1 | its own package's source, the in-memory runtime, fakes |
| **Contract over build output** | `abuddy-cli/tests/build/`, `default-setup/tests/unit/seed-parity/` | 2 | the built `@abuddy` packages, a pack's `dist` |
| **Command / process** | `abuddy-cli/tests/cli/`, `tests/harness/` | 2 | runs real builds, installs and child processes |
| **Repo tooling** | `@app/repo-checks` | 1–2 | the chain table, the cost records, `scripts/` |
| **App runtime** | `api/tests/unit/` | 1 | boots the composed runtime over a temp data dir |
| **Fixture pack** | `tests/fixtures/*` | 2 and 3 | a pack built and tested as a third party would |
| **E2E** | `tests/e2e/` | 3 | the built app, real Electron |

## Verdict classes

From the 2026-09-19 survey, which swept the first four. They remain the vocabulary for judging a test.

| Verdict | Meaning |
|---|---|
| `KEEP` | guards a regression path nothing else covers |
| `TRIM` | guards behaviour, also pins incidental detail |
| `MERGE` | overlaps another test; fold them |
| `MOVE` | right assertion, wrong level or package |
| `DELETE` | cannot fail meaningfully, or something cheaper fails first |

`KEEP`/`TRIM`/`MERGE`/`DELETE` were acted on by
[`goal-test-cleanup.md`](../goals/goal-test-cleanup.md), whose Decisions 1–10 are the standing
criteria — in particular **Decision 10: a duplicate that names the level it adds is not a duplicate.**

`MOVE` is the class that accumulates on its own. The other four are written wrong once; a misplaced spec is
written *correctly* and then left behind when the code moves. That is why the tree records the repo's
history rather than its structure, and `default-setup/tests/unit/_hybrid/CLAUDE.md` says so outright: *"The
directory's name is historical: these specs once imported the API's EARS and repository modules too."*

### Mechanical signals

Cheap greps that flag a candidate. None is a verdict on its own — they narrow reading.

| Signal | What it catches |
|---|---|
| `msg-pinned` | an assertion on a string literal of 45+ chars: a whole message, not the part a user acts on |
| `count-pinned` | `toHaveBeenCalledTimes(n)` / `toHaveLength(n)`: a count that is not the behaviour |
| `no-product-import` | the spec references no product module at all |
| `tests-fixture` | asserts something about an allowlist, fixture or the spec's own scanner |
| `dupe-title` | the same test title in more than one file |
| `type-only` | `typeof x === 'function'`: the type system's job |

Provenance (`git blame` on the `it(` line) answers *what was this for* when intent is unclear. It is **not**
a filter: measured across 2,211 tests, the share carrying a signal was flat by commit type — `fix(` 16%,
`feat(` 16%, `refactor(` 14%, `test(` 11%.

## Known misplacements

Open at this survey. [`goal-test-placement.md`](../goals/goal-test-placement.md) acts on these;
[`goal-published-package-checks.md`](../goals/goal-published-package-checks.md) is the largest, split out
because its subject belongs to no single package.

| # | What | Size |
|---|---|---|
| 1 | `@abuddy/testing` and `@abuddy/ui` have no suite; six specs about them live in `@abuddy/cli`, and `npm run spec` on either package's source crashes in vitest's project resolution | 6 specs |
| 2 | `@app/api`'s only test directory is `unit/`; 10 of its 15 specs boot a runtime | 15 specs |
| 3 | `api/tests/unit/secrets.spec.ts` mocks `abuddy-host/src/secrets/vault.ts` by relative path | 1 spec |
| 4 | `@abuddy/ui` has 33 recorded component contracts and no behavioural test; exactly one spec in the repo mounts a Vue component | coverage gap |
| 5 | `@app/default-setup` is the only package with colocated specs, and has a third `__tests__/` variant | 6 specs |
| 6 | twelve specs in `@abuddy/cli` are about the published `@abuddy` packages | 30.2s |

## Guards that hold placement

A guard is what makes a rule survive the next refactor; prose does not. These fail when a placement rule
breaks, and all of them live in `@app/repo-checks`:

- **`repo-check-boundary.spec.ts`** — a spec whose subject is a repo script lives in `@app/repo-checks`, and
  that package holds nothing else.
- **`suite-split.spec.ts`** — every spec is recorded and in the half its cost implies.
- **`suite-timeouts.spec.ts`** — no config or test buys itself more time than its tier allows.
- **`chain-inputs.spec.ts`** — the chain reads every tracked source file, and a pool step and its projects
  cache on the same inputs.

Two more are planned by `goal-test-placement.md` Phase 3: *a package with a `src/` has a suite*, and *no
spec imports another package's `src/` by relative path*.

## Running them

The commands, their shapes and what each costs are in the root [`CLAUDE.md`](../../CLAUDE.md) under
*Commands*. The short version: `npm run spec` while working, `npm run chain` before a merge.
