# @app/repo-checks

The specs whose subject is the repo itself rather than any package: the pre-merge chain's graph and cache
keys, the recorded spec costs, the timeout budgets, where specs live, and the scripts under `scripts/` that
the other checks run.

Nothing here is published, imported by the app, or part of a pack. It is a workspace because a spec needs
a package to live in — and because which package it lives in decides whether `npm run spec` can find it.

## Why it exists

These specs used to live in `packages/abuddy-cli/tests/build/`. Not because they were about the CLI —
none of them is — but because it was the package with a vitest config nearest the scripts. Two costs came
of that:

- **They were unreachable from what they check.** `npm run spec` asks which package a changed file belongs
  to, and a change under `scripts/` belongs to none, so it reported "nothing changed inside a package" and
  ran nothing. The repo's own tooling was the one part of the tree its own command could not check.
- **They were 9.2s of a suite meant to be a per-change loop.** `@abuddy/cli`'s fast half is the loop its
  contributors run; a sixth of it was answering questions about the chain.

`scripts/spec.ts` now routes `scripts/` and any `vitest.config.ts` here, and
`tests/repo-check-boundary.spec.ts` holds the other half: a spec that reads the repo's scripts belongs in
this package, and this package holds nothing else — bar the layout checks its `LAYOUT_CHECKS` names, which
read the tree and so have no `scripts/` module to import.

**The two halves ask different questions, and that is what keeps the lists empty.** The first is about
*reachability* — `scripts/spec.ts` routes a change under `scripts/` here and nowhere else, so a spec
importing one from another package will not run when what it covers changes — and it asks only about
imports, since only an import can create that. The second is about *cohesion*, and asks the wider question,
because a spec that spawns `scripts/with-source.mjs` is as much about repo tooling as one that imports it.
Asking one question for both cost an allowlist: `package-freshness` names a script path as an expected value
and tripped the reachability check it cannot affect. `check:specifiers` now refuses a package reaching into
`scripts/` at all, so the first check should stay empty by construction.

The same shape has since turned up twice more, which is why `tests/spec-placement.spec.ts` generalises it:
`@abuddy/testing` and `@abuddy/ui` had no suite at all and their specs lived in `@abuddy/cli`. Every package
extraction this repo has done left tests behind, and nothing noticed any of them until someone went
looking.

## Tests

Two halves, split by measured cost exactly as every other suite is — the rule and the band are in
`scripts/lib/spec-cost.ts`, and `etc/spec-cost.json` is this suite's record.

- **`npm test -w @app/repo-checks`** — the fast half (`tests/**/*.spec.ts`): 20 specs, about 3.5s of file
  time.
- **`npm run test:integration -w @app/repo-checks`** — the expensive half
  (`tests/**/*.integration.spec.ts`): 3 specs, about 9.8s. Each runs a compiler over a fixture tree.

Both run in the chain: the fast half inside `test:unit:host` (this is a host suite — it resolves workspace
`@abuddy/*` source through the `@abuddy/source` condition), the expensive half in `test:integration`, which
names every workspace that has a second config.

## What is here

| Spec | Subject |
|---|---|
| `chain-graph`, `chain-schedule`, `step-timing` | the chain's run order, its lane scheduler, and what a step costs |
| `chain-inputs` | every step's cache key: that the inputs cover the tracked tree, that a pool reads what its projects read, and that the two literal lists (`vitest.config.ts` projects, `test:integration`'s workspaces) match what they are derived from |
| `chain-output` | how a chain run puts a step on a line: a reason too long for its row is indented to the column it starts at rather than wrapping to column 0, where it reads as another step; every row's columns are composed from one name width and asserted against the **widest declared step name**, since the version that composed them from `'x'` held while three row shapes were a column out for the one step wider than the column. A cached step keeps its own line where it was skipped, and a suite's slowest tests sit in that step's own time column. And what it prints under a step that passed and is stale again: the inputs that differ from the digests its stamp recorded, each with what happened to it and whether it moved while the step ran or since, a declared-set change instead of a file list because for that cause there are none, and the file whose mtime moved while its bytes did not — named, because a count is not something anyone can act on, and the report used to call that file a cause because it walked mtimes rather than asking the fingerprint |
| `suite-split`, `suite-timeouts`, `slow-tests` | the recorded spec costs, the per-tier timeout budgets, and the slow-test report |
| `orchestrator-exit`, `with-source`, `import-specifiers-script` | the scripts themselves: no `process.exit()` in one that reprints captured output, the `@abuddy/source` wrapper, and `check-import-specifiers` run as a process |
| `import-specifiers`, `component-contracts`, `published-imports`, `api-report-stamp` | the analysis scripts behind `check:specifiers`, the component reports and the API stamp. A rule saying its pack-facing half is covered by a named pack rule has that shown, by running the named rule over a pack written to commit the offence — the claim was a key the compiler only spell-checked, and doing it found one of the three false: `own-modules` resolved a relative specifier against the wrong directory under this repo's runner, so the `.js` form it owns was refused for an external pack and for nothing here |
| `generated-behind-contract` | that `check:specifiers`' list of the generated modules a contract leaf may not reach through its closure is the set codegen really emits, and really imports a contract or an actor from. It runs codegen over a temp pack rich enough to emit all eighteen, because a module the fixture skips is one the check never looks at |
| `unit-pool` | the pool's per-project cache: what a project's freshness is measured against, and what its line says about why it is running — which of the four states a stamp can be in, and that a stamp from a protocol this run does not recognise is never diffed, since reading those digests printed a file name beside a reason saying the stamp could not be compared |
| `spec-plan` | what `npm run spec` decides to run for what you gave it, asserted without running any of it: the plan per target shape, which pack suites a change reaches across the `dist` seam, that no plan runs one suite twice, and how the arguments split |
| `pack-test-config` | that every pack's vitest config calls `definePackTestConfig` and declares no `test` block of its own, the scaffolded template included: there were three copies and they had drifted, and a fourth is a `cp` away |
| `specifier-fixes` | what `npm run specifiers:fix` may write: right-to-left splicing, and the three refusals — a span that no longer holds what the reader saw, two spans that overlap, a file with nothing to do. What makes a rewriter safe is the refusals, not the writing |
| `packaged-app-files` | what the installed app carries, asked of the matcher electron-builder builds from `electron-builder.mjs`: every packaged template, every staged tree, every package source, all walked rather than named. That config is named by no chain step, so nothing else reads it. Two of its cases **mutate the pattern list in memory** and assert the answer flips, which is how a check on a config proves it can fail at all — and how this one found that both includes carry the templates and only the `.ts` ones depend on them |
| `lint-scope` | the one exclusion in `lint:check`, the CLI's scaffold templates — whose parameter names are what a pack author reads rather than unused bindings. It runs oxlint twice, once with the gate's own parsed arguments and once with that pattern dropped, because "no findings here" is equally true of a pattern naming the wrong directory and of a scaffold with nothing to report. The third case holds `lint:fix` to the same exclusions: that half would not report the templates but rewrite them, restoring the underscores whose removal is why the exclusion exists. A fourth case is about the gate's *depth* rather than its scope: every oxlint call here is `-D correctness`, so a disable naming a rule outside that category suppresses nothing while reading as protection — one did, for months — and the exception is derived, a workspace whose own script also runs eslint, where a rule oxlint has no notion of is still real |
| `repro` | what `npm run check:repro` compares across two builds of one input — a diagnostic nothing runs on a schedule, deliberately, since the chain's own freshness sweep already watches everything in its population: the population, derived from `BUILD_UNITS` and `PACK_OUTPUTS` rather than listed, and refusing to be empty; the comparator, per kind; and that the script forces codegen, since `abuddy build` skips it on a matching `.inputs-hash` and the second build would otherwise re-hash output it never regenerated. The recorded exceptions are reported rather than failed — all three are races, so a run where one agrees says nothing — but each must still name a path the check looks at, or it is dead text reading as coverage |
| `doc-links` | that a relative link between the repo's documents resolves: archiving a goal turns its own `../archive/goals/x.md` into `archive/archive/goals/x.md`, and a dead link fails nothing on its own |
| `workspace-dirs` | what "the workspaces" means: `PACKAGE_DIRS` is derived from the root `workspaces` field rather than a listing of `packages/`, and refuses a glob whose workspaces it could not name — the alternative being to drop them and report green over the difference. The refusal runs at module load of something `chain` and `spec` both import, so it is pinned through the pure `workspaceDirsFrom`, which is the only way it gets watched failing |
| `unused-code-gate` | that every tsconfig compiling source sets `noUnusedLocals`, and that no package has TypeScript no config compiles. The flag catches what the linter structurally cannot: measured the day it landed, oxlint read 114 files in `@abuddy/ui` and reported zero where `vue-tsc` reported ten, because it does not analyse bindings inside an SFC's script block. Every config rather than one per workspace, because `typecheck:be` compiles `packages/api` through three of them and a narrower population would pass while one turned the flag off; what is excluded is derived, a config whose parsed file list is empty. Three mutation cases, since the interesting paths are ones it can construct: a dropped flag, an inherited and an overridden one, and the empty config |
| `repo-check-boundary`, `spec-placement` | where a spec belongs: this package's own boundary, that every package with source has a suite, and that no spec reaches into another package's tree |

`tests/spec-plan.spec.ts` itself checks that this table names every spec here, in both directions. It had to:
that spec was added without a row, and ten cases were added to it before a review noticed. A table of eighteen
that lists seventeen is the same failure as an exception list with a stale entry, which this package already
checks in three other places.

## Conventions

- **Find the repo root with `REPO_ROOT`** (`@abuddy/host/build/packages-built`), never by counting `..`
  from `import.meta.dirname`. Two specs arrived here with a hard-coded depth and broke on the move; the
  exported one is derived from a marker file and cannot.
- **A spec that reads the built `@abuddy` packages** calls `packagesBuiltOrRefuse()` from that same module,
  which skips when they are not built and refuses when they are stale. The suite's `pretest` builds them;
  that call is what catches a run which bypassed it.
