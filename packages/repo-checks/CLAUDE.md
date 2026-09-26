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

- **`npm test -w @app/repo-checks`** — the fast half (`tests/**/*.spec.ts`): 16 specs, about 3s of file
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
| `suite-split`, `suite-timeouts`, `slow-tests` | the recorded spec costs, the per-tier timeout budgets, and the slow-test report |
| `orchestrator-exit`, `with-source`, `import-specifiers-script` | the scripts themselves: no `process.exit()` in one that reprints captured output, the `@abuddy/source` wrapper, and `check-import-specifiers` run as a process |
| `import-specifiers`, `component-contracts`, `published-imports`, `api-report-stamp` | the analysis scripts behind `check:specifiers`, the component reports and the API stamp |
| `unit-pool` | the pool's per-project cache: what a project's freshness is measured against |
| `spec-plan` | what `npm run spec` decides to run for what you gave it, asserted without running any of it: the plan per target shape, which pack suites a change reaches across the `dist` seam, that no plan runs one suite twice, and how the arguments split |
| `doc-links` | that a relative link between the repo's documents resolves: archiving a goal turns its own `../archive/goals/x.md` into `archive/archive/goals/x.md`, and a dead link fails nothing on its own |
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
