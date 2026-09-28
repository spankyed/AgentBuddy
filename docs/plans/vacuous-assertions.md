# No assertion over a subject nobody checked

*Supersedes `docs/plans/shared-pack-fixture.md`, which was part 3 of this.*

## Context

A spike asked whether Gherkin belongs here and concluded its *format* does not: 4× the lines, a runtime typo where
the compiler gives `TS2820`, and a table cell containing ` | ` that silently truncated and let a run report
"8 of 7 scenarios pass". Two of its three structural ideas the repo already has — Scenario Outline + Examples is
`it.each` (118 tables across 57 specs), and scenario-as-a-sentence is the house style.

Chasing the third turned up something bigger than a missing helper. **The repo has invented "an assertion that
cannot be vacuous" four separate times, privately each time, and it reaches four files.**

| where | what it guarantees | reach |
|---|---|---|
| `FIRES` + exhaustiveness, `repo-checks/tests/import-specifiers.integration.spec.ts` | every rule has an input that makes it fire | 10/10 rules |
| `FIRES_ON_A_FILE`/`FIRES_ELSEWHERE` + exhaustiveness, `abuddy-cli/tests/build/pack-rules.spec.ts:233` | the same | 11/11 rules |
| `population(what, files)`, `repo-checks/tests/packaged-app-files.spec.ts:87` | the subject is not empty | **1 file** |
| two mutation cases, same file | the check is able to fail | 2 cases |

The third is three lines long, private to one file, and its doc comment already states the principle:
*"a population it cannot read is a case that proves nothing."* CLAUDE.md documents the habit. Nothing shares the
code, so the habit reaches whoever remembers it.

**Measured, where it is not applied.** 41 spec files make 79 raw directory reads. Between them they make **81
assertions of the shape `expect(<walked>).toEqual([])`** — green over an empty walk. **15 of those files never
check the walk found anything**, and four of the fifteen walk a *build output* (`published-specifiers`,
`published-ui-dist`, `scaffold-templates`, `dependency-runtime.integration`), where emptying is not hypothetical:
a layout that moves or a build that wrote elsewhere, and the check passes.

Two corrections from the measuring, both of which change the rule worth encoding:

- A first count of "5 of 27 guarded" was wrong — `import-is-the-verb.spec.ts` guards with a message argument the
  pattern missed. Re-counted per assertion, not per file.
- **A `toEqual([])` is not itself a defect.** `api/tests/source-layout.spec.ts` asserts no `.vue` under `src/`, and
  empty is the right answer. What makes it honest is that the set it *filtered from* is known non-empty. The rule
  is "name the subject and confirm it was read", not "guard every walk".

This is the same failure as the pack fixture too weak to make `contract-leaves` fire, and the same failure as a
scenario passing over a truncated string: an assertion evaluated over an input that could not have failed it.

**Outcome: one shared vocabulary for "this check looked at something real", and no spec that can skip it.**

## Where it lives

A new private workspace, **`@app/fixtures`** — not `@abuddy/host`, which was the first choice and does not work.

`findUpwardImports` (`scripts/check-import-specifiers.ts`) reads each layer's `src`, `tests` *and* `scripts`, and
separately refuses a non-permitted `@abuddy/*` in the manifest at all. So `@abuddy/sdk`, `/ears`, `/ui` and
`@app/default-setup` specs — **8 of the 41 files** — can neither import `@abuddy/host` nor declare it. The rule
polices only `@abuddy/*`, so an `@app/*` devDependency is outside the layer graph by construction, which is what
makes one home reachable from all 41.

Precedent and cost are both known: `@app/repo-checks` and `@app/publish-checks` are private spec workspaces, and
`@abuddy/host` already publishes an exports map pointing straight at `./src/**.ts` that other packages' vitest runs
resolve today — so `@app/fixtures` needs no build step and no vitest `deps.inline`. Wiring is five places, from
the `publish-checks` precedent:

- `scripts/lib/unit-suites.ts` (the suite list the chain reads)
- `scripts/lib/chain-steps.ts` (its inputs)
- `vitest.config.ts` (the projects list)
- root `package.json` — `typecheck:scripts`
- the workspace itself: `package.json`, `tsconfig.json`, `vitest.config.ts`, `CLAUDE.md`, `etc/spec-cost.json`

Plus a devDependency line in the 11 consuming packages. It is the first `@app/*` consumed by other workspaces; it
needs its own suite anyway, because `spec-placement` requires one and because a helper with no firing case is the
thing this plan exists to stop.

## 1. The vocabulary

Three exports, no vitest dependency — `population` **throws** rather than asserting, which is why it can sit in a
package nothing test-framework-shaped depends on, and vitest reports the throw with its message just as loudly.

```ts
population(what: string, xs: readonly T[]): readonly T[]   // throws naming `what` when empty
filesIn(what: string, dir: string, options?): string[] | Dirent[]   // read + population
filesInAllowingNone(what: string, dir: string, options?)            // the twin, for when empty is the answer
packFixture({ at?, files?, manifest? }): string                      // a complete pack on disk
```

`filesIn`'s options mirror `readdirSync`'s (`recursive`, `withFileTypes`) with overloads so the return type stays
exact — it is that call plus a named subject and a refusal, not a new walker to learn.

**The twin is what removes the exception table.** The option chosen for this plan priced in "1–3 exceptions, each
with a reason"; naming the unchecked half instead costs zero table entries and puts the decision at the call site,
where the repo already puts it (`qx`/`untypedQx`, `openPlugin`/`untypedOpenPlugin` — one name per concern, the
unchecked half named for being unchecked).

`packFixture` is complete by default: a `package.json` with both subpath maps (`#generated/*`, `#features/*`), an
`abuddy.json` declaring one feature with **both** halves' entries and contracts, and the files those paths name.
`files` merges over the base, so a malformed-pack case writes `files: { 'abuddy.json': '{}' }`. `at` defaults to a
fresh `mkdtemp`; `import-specifiers.integration.spec.ts` passes a path, because its rules' populations are
`packages/*`-shaped.

**No helper for the firing tables.** `import-specifiers` gets exhaustiveness free from `FIRES: Record<RuleId, …>`
— the compiler refuses a missing key. `pack-rules` splits across two tables and checks it at runtime instead. The
fix there is to merge them into one `Record<PackRuleKey, { onFile?: …; elsewhere?: … }>` and delete the runtime
half, keeping only the staleness direction. A shared function would be weaker than the type system and is not
worth a fourth export.

## 2. The migration

- **79 raw reads across 41 files** become `filesIn` / `filesInAllowingNone`, each naming its subject. 24 files have
  a single call site. The four walking build output — `published-specifiers`, `published-ui-dist`,
  `scaffold-templates`, `dependency-runtime.integration` — are the ones where this changes an outcome rather than
  the wording.
- **Five local pack-fixture variants collapse into `packFixture`**: `packWithImports` and the inline-manifest case
  in `abuddy-cli/tests/build/pack-rules.spec.ts`, and `packFixture` plus the contract-leaf describe's local
  `pack(files)` in `repo-checks/tests/import-specifiers.integration.spec.ts`. `pack()` stays only where a case is
  *about* a malformed or minimal pack.

  `Given a pack that …` is currently written privately in **35 spec files across six packages** — `pack`,
  `makePack`, `writePack`, `packFixture`, `packWithImports`, `packWithDefaults`, `packSource`, `packRepo`. Five is
  where the shape is load-bearing: `pack-rules.spec.ts` alone carries three, one of them a manifest written inline
  because neither of the others could express a contract leaf, and
  `import-specifiers.integration.spec.ts` records what the weak shape already cost — *"there used to be two and
  the difference was invisible … `own-modules` and `contract-leaves` cannot fire there at all — measured. Half the
  sweep's fixtures were that shape, so for those rows those two rules' 'and no other rule claims it' said nothing:
  they were not able to claim."*
- **The three private copies of the principle** move onto the shared one: `population()` in
  `packaged-app-files.spec.ts`, and the two firing tables (`pack-rules` merges to one `Record`).

The ~30 other pack builders across the repo stay. They build installers, releases, bundler inputs and E2E trees;
forcing those through one builder is how a four-option helper becomes a twenty-option one.

## 3. The guard

`packages/repo-checks/tests/population-guards.spec.ts`: **no spec calls `readdirSync` directly.** The population is
derived exactly — every `*.spec.ts` in the repo, scanned for the call — which is the point: an earlier design tried
to scope the rule to "repo walks only" and was abandoned when the call sites turned out to name local variables
(`dir`, `SRC`, `path.join(…)`) at nearly all 79, so no static rule can tell a repo walk from a tmp walk. A
heuristic population is the exact failure this plan is about.

With the `AllowingNone` twin there are no exceptions, so the assertion is `toEqual([])` against a population the
guard itself passes through `population()` — the check proves it looked at the specs before reporting none
offending.

## Verification

Each one is a mutation, per the repo's rule that breaking the thing on purpose proves more than a re-run.

| | |
|---|---|
| the vocabulary bites | point `filesIn` at a directory that does not exist: it throws naming the subject, and `filesInAllowingNone` returns `[]` |
| the guard bites | put one raw `readdirSync` back in a spec: reported, naming the file and line |
| the guard is not vacuous | make the spec scan match nothing: it fails by name rather than reporting zero offenders |
| the fixture bites | delete the manifest from `packFixture`'s default: the `contract-leaves` cases must fail. Today two of the three shapes cannot make that rule speak at all |
| the four build-output walks | run their suites against a tree with the output removed: each must now fail naming its subject, where today `published-specifiers` and `published-ui-dist` pass |
| the merged firing table | delete a key from `Record<PackRuleKey, …>`: a compile error, not a test failure |
| nothing else moved | `npm test -w @abuddy/cli`, `npm run test:integration -w @app/repo-checks -w @app/publish-checks`, with expectations unedited |
| the gate | `npm run check:specifiers`, `npm run typecheck`, `npm run chain` |

## Risks

- **79 call sites is one large mechanical diff.** Commit it per package so a bisect lands somewhere useful, and
  keep the vocabulary and the guard in separate commits from the migration.
- **A more complete pack fixture can surface findings the old one could not.** That is the intent, and also how it
  breaks: `offender()` in `pack-rules.spec.ts` asserts over every rule's findings. Run the suites; do not reason
  about it.
- **`@app/fixtures` is the first `@app/*` consumed across workspaces.** Host's exports map already points at raw
  `.ts` that other packages' vitest runs resolve, so this should need no build and no `deps.inline` — verify it
  with one sdk spec before migrating 41 files.
- **A new workspace adds a chain step's worth of inputs.** Five wiring points, measured against the
  `publish-checks` precedent; if `spec-plan`'s partitioning needs an entry, its own spec will say so by failing.
- **Mutation checks must not run in the working tree** — a broken line reached the index once already. Use a
  worktree or a copy.
- **Another agent is committing on this branch.** Explicit pathspecs per commit, and re-run the mutations after a
  rebase rather than trusting the merge.

## Commit chunks

1. `@app/fixtures`: the workspace, `population`/`filesIn`/`filesInAllowingNone`, its own suite, the five wiring
   points. Delete `docs/plans/shared-pack-fixture.md`, superseded by this.
2. `packFixture` in the same workspace, and the five variants in the two specs that collapse onto it.
3. The migration, one commit per package: 79 sites, 41 files.
4. `pack-rules`' two firing tables merge into one `Record`; `packaged-app-files` drops its private `population`.
5. The guard, and its firing case.
