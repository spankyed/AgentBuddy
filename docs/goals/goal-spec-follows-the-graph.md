# Goal: `npm run spec` runs every package whose specs cover what you changed

> **Written in session** `1d53eb9c-d886-49f8-bc5a-90793d43315e` (Claude Code, 2026-09-26). Resume it with `claude -r 1d53eb9c-d886-49f8-bc5a-90793d43315e`.

```
# Goal: npm run spec runs every package whose specs cover what you changed

Implement docs/goals/goal-spec-follows-the-graph.md on AS/chain-inputs, at or after 8acdf6c69 — the base
its Background was surveyed at.
Before Phase 1, confirm the base: `npm run spec -- packages/abuddy-ears/src/query.ts` reports one package,
and scripts/lib/chain-steps.ts exports workspaceDeps. If either is already false, stop and say so — the
survey was taken somewhere else.
Read Background, Decisions, Phases and Constraints first. Decisions are final: implement them, don't
reopen them or stop to ask. The Open decision must be settled with the user before Phase 3; if it is still
marked open, stop and ask.
Where a detail isn't specified, pick the conventional option, note it in the final summary, and keep
going. No backward compatibility in code (root `CLAUDE.md`, "Backward compatibility" — it is a standing
rule, not this goal's choice): change signatures, move modules, migrate every in-repo caller, test,
fixture, template and doc in the same change, and fix forward.

Finished when:
- Phases 1–4 are implemented and each meets its "Done when"; every new guard or helper is
  mutation-checked.
- Editing a package's source runs every package whose specs cover it, not only its own, and a spec proves
  it against the dependency graph rather than against a list.
- The cost is measured and recorded: what the common edit costs before and after, and what the widest one
  costs.
- npm run typecheck; npm run spec-cost:check; npm test -w @app/repo-checks; npm run chain once at the end.
- A final summary: phase → done/deferred, evidence, and the conventional choices made.
- The doc is in `docs/archive/goals/`, with its status blockquote and an Outcome section, committed.

Commit as you go:
- Commit each phase when its "Done when" holds and the checks are green — not once at the end.
  Conventional message, no Co-Authored-By or session lines, `git commit -- <paths>` naming only that
  phase's files.
- Check `git diff --cached` first: another agent works in this checkout and stages files.
- Don't push, tag, or open a PR unless the user asks.

Never:
- push, tag or open a PR unless the user asks in this session.
- npm publish, create GitHub releases, or trigger workflows (dry runs only).
- open, copy or modify ~/Library/Application Support/abuddy* or any real data dir.
- pkill/killall Electron or node; launch the app outside the test env without an isolated
  ABUDDY_USER_DATA_DIR.
- run bare tsc on packages/preload, `npm install` in the example pack, or edit version/release metadata.
- delete or loosen a test to make a number move.
```

## Background (surveyed 2026-09-26 at `8acdf6c69`)

`npm run spec` answers *"what could my change break?"* by asking which package a file belongs to and running
that package's specs. For a file that only its own package tests, that is right. For everything else it is
**confidently wrong**: it reports a green run of the wrong specs.

Measured across the repo — a package's source, against every package whose specs import it by name:

| Edited package | Specs covering it live in | Packages `npm run spec` runs |
|---|---|---|
| `@abuddy/ears` | 8 packages | **1** |
| `@abuddy/sdk` | 7 | **1** |
| `@abuddy/host` | 6 | **1** |
| `@abuddy/ui` | 6 | **1** |
| `@abuddy/testing` | 4 | **1** |
| `@app/publish-checks`, `@abuddy/cli`, `@app/api` | 2 each | **1** |

**29 cross-package edges the command does not follow.** Editing the EARS engine — the module every pack's
data goes through — runs one suite of the eight that cover it.

### The chain already disagrees with it

`suiteInputs` (`scripts/lib/chain-steps.ts`) includes `workspaceDeps(dir).flatMap(dependencySource)`, so a
dependency's `src` is an input to every dependent's suite: the chain re-runs `@abuddy/host`'s projects when
`@abuddy/sdk`'s source moves. Two mechanisms in one repo hold different beliefs about what covers what, and
the cheap one — the one people run per change — holds the wrong one.

### What this is not

It is **not** the `scripts/` case. That one is worse and separate: `scripts/` belongs to no package, so
`packageOf` returns `null` and the command ran nothing at all, or crashed. `scripts/spec.ts` routes it
explicitly to `@app/repo-checks`, and
[`goal-tests-mirror-source.md`](goal-tests-mirror-source.md)'s sibling work closes the last leak that made
that route incomplete. This goal is the general case, and the two are independent: a file with no package
still needs the explicit route.

### What it costs to do right

`vitest related` resolves the module graph, including transitive imports, so the only question is *which
packages to run it in*. Measured on this machine, 2026-09-26: **an invocation that finds nothing costs
0.83s.** So a naive fan-out over all twelve packages is ~10s, and over the eight that cover `@abuddy/ears`
is ~6.6s — against a command whose whole value is being a 1–3s loop.

That is the tension this goal resolves: the answer must be right *and* the common case must stay cheap. The
common case is a package edited by someone working in it, where the candidate set is small or one.

## Decisions

Final.

1. **Candidates come from the declared dependency graph, not from a scan of import text.** A package cannot
   import what it does not declare — the build enforces it and `check:specifiers` checks the direction — so
   `workspaceDeps` is exact and already computed. A text scan would also see a name in a comment or a
   fixture string, which is the mistake this repo has now made twice.
2. **`vitest related` does the resolving.** Once a package is a candidate, vitest decides which of its specs
   actually reach the file, transitively. Nothing here reimplements a module graph.
3. **The dependency graph has one definition.** `workspaceDeps` lives in `scripts/lib/chain-steps.ts` and
   the chain uses it; `spec.ts` imports that, rather than computing its own. Two readings of the same graph
   is the class of defect this goal exists to remove, not to duplicate.
4. **A package with no covering spec still costs an invocation, and that is acceptable.** Narrowing further
   by scanning for imports would trade an exact answer for a fast one; the fan-out is already bounded by
   the declared graph, which is what keeps it from being all twelve.
5. **Measure before optimising, and record it.** The Outcome carries the before and after for a common edit
   and for the widest one. If the widest case is too slow, that is a finding to act on with numbers, not a
   reason to narrow the answer up front.
6. **`npm run spec` keeps its contract**: it groups by package and runs each package's own `test` script or
   `related`, so a pretest guard and each vitest config still apply. Fan-out changes which packages, not
   how one is run.

## Open decision

Settle with the user before Phase 3.

**Does the fan-out run serially or concurrently?** Phase 2's measurement decides whether it matters, and
the answer is not obvious either way.

- **Serially**, as `spec.ts` runs packages today, with the comment that they share the package build lock
  and the build stamps. Simple, and the hazard `CLAUDE.md` records — two suites racing each other's build —
  cannot arise. The widest edit pays the full sum.
- **Concurrently**, after one `packages:ensure` up front, which is exactly what `scripts/test-unit-pool.ts`
  does to make its own parallelism safe. Faster on the wide cases; a new place where concurrency has to be
  reasoned about, in the one command that is meant to be simple.

## Phases

### Phase 1 — make the graph reachable from `spec.ts`

Export `workspaceDeps` from `scripts/lib/chain-steps.ts` if it is not already, and add its inverse: given a
package, which packages declare it, transitively. One definition, used by both callers (Decision 3).

**Done when:** a spec asserts the inverse against the manifests — that every edge `workspaceDeps` reports is
reported back the other way — and it is mutation-checked by adding a dependency to a manifest fixture.

### Phase 2 — fan out, and measure

`packagesFor` returns the file's own package plus every package that declares it. Change the `related` call
site (`spec.ts:108`) to iterate rather than take one package. Then measure and record: a `@app/renderer`
edit (nothing depends on it), an `@abuddy/sdk` edit (7 dependents), an `@abuddy/ears` edit (8).

**Done when:** `npm run spec -- packages/abuddy-ears/src/query.ts` runs the eight packages whose specs cover
it; the three measurements are recorded; nothing else about the command's output has changed.

### Phase 3 — decide on concurrency

Settle the Open decision against Phase 2's numbers and implement it. If serial, say so in the code with the
measurement that made it acceptable. If concurrent, `packages:ensure` runs once before the fan-out, and the
reason is the one `test-unit-pool.ts` already records.

**Done when:** the widest edit's cost is recorded, and the choice carries its measurement.

### Phase 4 — the guard

A spec in `@app/repo-checks` that the two mechanisms cannot disagree: for every workspace edge in
`workspaceDeps`, `packagesFor` on that dependency's source names the dependent. That is the invariant —
the chain and the inner loop read one graph — and it fails if either grows a private copy.

Mutation-check it by making `packagesFor` return only the file's own package and watching it name the
edges it dropped.

**Done when:** the guard passes, has been made to fail, and `npm run chain` is green.

## Deferred

- **The E2E and fixture-pack suites.** `tests/e2e` and `tests/fixtures` cover the app and packs end to end
  and are reached by neither mechanism from a source edit. They are tier 3 and the chain runs them on
  `build:app`'s output; pulling them into the inner loop is a different trade and needs its own sizing.
- **A file with no package.** `scripts/`, the root configs and `docs/` keep their explicit routes. Deriving
  those from the graph is not possible — they are in no package — and the explicit route is correct.

## Constraints

- **Measure on an idle machine, and record what you measured on.** The 0.83s figure in the Background was
  taken 2026-09-26 with nothing else running; a fan-out measured under load says nothing.
- **A guard that cannot fail is worse than none.** Break Phase 4's guard on purpose and watch it fail, in a
  copy or a worktree — a mutation in this shared tree has reached the index before.
- **Another agent works in this checkout.** Check `git status` before committing and name paths explicitly.
- **Don't relitigate settled decisions.** Which package a spec lives in
  ([`goal-test-placement.md`](../archive/goals/goal-test-placement.md)), cost-based placement and the two
  pools are final. This goal changes which packages a command runs, and nothing about where a spec belongs.
