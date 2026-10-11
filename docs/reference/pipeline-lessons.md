# What each of these rules cost to learn

The root `CLAUDE.md` carries these rules in their imperative form with one citation each — enough to follow
and enough to recognise when you are about to break one. This holds the full account: what was measured,
what was tried first, how many copies there were, and which commit closed it.

Read it when a rule's one-line citation is not enough to tell you whether your case is the same case, or
when you are about to argue that a rule does not apply here.

Things that waste the most time, in order:

- **Running anything at all after a comment, a doc or a CLAUDE.md edit.** Nothing means nothing: not
  `typecheck`, not the package's suite, not "just to be safe". Prose cannot break a build, and no step
  declares `docs/` among its inputs, so the chain agrees — `npm run chain -- --dry` after a doc edit reports
  every step cached. A `CLAUDE.md` is free wherever it sits, which took a change: five of them live inside
  a declared `src/` or `tests/` tree rather than at a package root, so a sentence of prose used to re-run
  up to four steps, `compile` among them. `fingerprintUnit` skips them by name now, and repo-checks'
  *"prose costs nothing"* holds the claim this paragraph makes. The two exceptions are a spec that asserts the text and a code fence someone will
  copy: check that one command. This is first on the list because it is the one most often ignored, and a
  full `typecheck` is 11s against a doc edit's 0s.
- **Optimising a step that is not on the critical path.** The chain admits steps in parallel, so the only
  durations that add up are the ones along its longest chain of dependencies — `npm run chain -- --dry --all`
  prints it, and as of 2026-10-06 it is **157s: `packages:ensure` -> `compile` -> `build:app` ->
  `test:packaged-authoring`**, which matches the 158.3s cold run above. Nothing else is a saving.
  `test:unit:pack` is the worked example and the warning: it is **89% setup overhead** — 115s of module
  evaluation against 13s of tests, the most alarming ratio in the repo — and it is off the path, so halving
  it buys zero chain wall and about a second of `npm run spec`. The diagnosis and the three dead ends are in
  `packages/apack-testing/CLAUDE.md`; what makes it worth revisiting is appearing on that path, not the
  ratio getting worse. **Read the path before measuring a ratio**, which is the mistake this bullet is made
  of: two sessions went into that pool's overhead before anyone asked whether it was on the path.
- **Running `npm run build` to test a change no build output depends on.** The renderer and API build
  from source; a CLI or SDK change does not need them rebuilt to be tested.
- **Running an E2E suite to find a bug you have a stack trace for.** A minified frame with a line and
  column is a solved problem: build once with `sourcemap: true` in the renderer's Vite config, decode
  the mapping, read the source. Do that before you grep, not after.
- **Re-running the full chain after a fix to a thing the chain already covered.** If the CLI suite
  caught it, the CLI suite proves the fix.
- **Reading the source twice to explain a bug the running app would show you.** A hang or a dropped
  event in the real app is worth one instrumented E2E run — a `console.error` in the failing path,
  `npm run build:be`, `DEBUG_E2E=1 npm test -- <spec> --grep "<title>"` — and the run you already did wrote
  the app's whole output to `tests/results/app-<workerIndex>.log`, so read that before re-running. Two carefully argued
  explanations have been wrong where one such run was decisive. `tests/e2e/CLAUDE.md` has the method,
  including what to rebuild first and how to put the instrumentation back.
- **Reading a chain step's `cached` as "the thing it guarantees is true".** It means only that the step's
  declared inputs have not moved. `packages:ensure` used to be cached that way, and what it guarantees —
  that the built packages are current — is recorded in `node_modules/.cache/apack-packages-build`, which
  its fingerprint cannot see and `fingerprintUnit` excludes from the content hash by design. Measured
  2026-09-26: with those stamps cleared and `dist` still present, the step reported `cached` while
  `packagesBuiltOrRefuse()` refused, so every step reading the built packages failed at collection (five
  files, thirty-three tests skipped). It carries a `neverCachedBecause` now — 0.3s warm, against a second record of one
  fact that can disagree with the first. Two caches over one body of work is the bug, not the cost.
  **The three pool steps keep two on purpose, and the reason is that theirs cannot disagree.** A pool step's
  inputs are `inputsForSuites`, the union of the same `suiteInputs` each project inside it is keyed on, so a
  cached step cannot hide a stale project — where `packages:ensure` guaranteed something its fingerprint
  could not see. What the two layers buy is granularity: a one-package edit runs that package's project
  rather than the pool. What they cost was measured 2026-10-06 — median of 3 on a box another process was
  using, so each figure is an upper bound and the proportions are what the conclusion rests on — and a
  fresh host pool step is 0.90s, of which
  **0.38s is `tsx` starting, 0.30s is the nested `packages:ensure` spawn and ~0.22s is the prune and the
  sweep over 2,372 files**. So the re-read of what the chain just hashed is the smallest of the three and
  0.6-1% of a step doing real work. Collapsing to one layer was priced too: uncaching the pool steps puts
  three ~0.9s steps on a 0.7s floor and fixes nothing, since the pool would still trust its own stamps.
  What they *could* disagree about is who established the pass, and that is closed separately —
  `CHAIN_RUN_ENV` in `scripts/lib/unit-pool.ts`, which keeps a pass under the chain apart from one
  established alone.
- **Running suites concurrently *before the packages are built*.** The hazard is the build itself, not
  the suites: `ensurePackagesBuilt()` returns before taking the lock when nothing is stale
  (`apack-host/src/build/packages-built.ts`), and only `stampedBuild` locks. So two suites that both
  find a stale package race each other's build and fail about the race rather than the code — which is
  what a background `test:unit` against a foreground `test:external-pack` used to do. Run
  `npm run packages:ensure` once first and every later call is a stat and a return, which is what makes
  a parallel chain safe; the 18 calls a serial chain makes are each paying that stat for nothing.

Rules that pay for themselves:

- **Measure before you optimise, and before you accept someone else's measurement.** Two proposals in
  this repo were rejected by one command each, and both had been argued for at length first.
- **Attribute a concurrent pipeline's cost with a CPU profile, not by timing its stages.** Rollup drives
  `transform` concurrently, so wrapping each Vite plugin hook and summing the wall clock of its calls
  reported **120s of hooks inside an 11.5s build** — a tenfold double-count that still read as a table with
  a plausible winner, `vite:vue:transform` at 1049% of the phase. The instrument for a single-threaded
  pipeline is `node --cpu-prof` with self time aggregated per package, which put the pack frontend bundle's
  **12.8s of CPU** at **6.1s inside rollup's tree-shaking walk** (`includeCallArguments`, `include`,
  `includePath` and the two path trackers), 1.6s GC, 0.7s tailwind and **0.3s compiling every SFC** — so
  the stage the first table blamed held a twentieth of the cost, and both intuitive optimisations ("make
  Vue faster", "cache the SFC transforms") were aimed at it. Subtract two profiles to isolate one phase
  (`apack build` against `--skip-fe`), and read what the subtraction attributes rather than trusting it:
  it charged the frontend phase 0.75s of `spawnSync` that was `packages:ensure` running in both arms.

  **What the profile bought was a rejection, which is the usual return on one.** `treeshake: false` for the
  non-release build measured **22.2s to 18.2s, -19%, for 443 KB more output** on 8.5 MB — paired A/B, median
  of 3, 75% idle, 2026-10-08, with the size change as the positive control that the knob had turned. It is
  reverted, because `fe-bundler-host-registry.integration.spec.ts`' *"drops the generated EARS facade from
  FE code that only uses the EARS constants"* fails under it, and that case generalises: every pack's
  `#generated/ears` pairs the constants with a `/*#__PURE__*/ defineEars()` call, so without the shake a
  frontend importing one constant carries that call into the renderer and **runs** it. Off is a divergence
  in what executes between a dev build and a release rather than only in what ships, and the dev build is
  what that spec and the E2E suite cover. The first comment written for the change claimed the opposite —
  that retaining code cannot crash what a release would not — which is wrong in the one way that matters:
  retained code runs.

  **Pre-bundling the vendor dependency is the other 3.0s, and it is spiked rather than built.**
  `build.opaqueDeps` stops rollup *walking* elkjs; it still parses and emits 3.3MB of it every build.
  Taking it out of the graph entirely — resolve the specifier to `{ external: true }` with a relative id,
  convert the UMD bundle to ESM once with esbuild (0.35s, cacheable on the dependency's content hash) and
  `emitFile` it beside the chunk — measured **20.8s to 17.8s, -14%**, paired A/B, median of 3, 71% idle,
  2026-10-08. The output is a real layout: a 3.32MB ESM asset and `import("./elk.prebuilt.js")` in the
  entry chunk, which resolves next to it over `pack://`. With the shipped `opaqueDeps` that is 23.3s to
  17.8s, **-24% of the original**.
  **It is not built because the machinery carries a risk nothing here would catch.** The conversion
  becomes ours: esbuild turning a UMD bundle into ESM is a semantic transformation, and if it is wrong
  elkjs fails at first layout — which no check runs, the chain never opening a flow canvas. Against that,
  `opaqueDeps` only ever *retains* code, so it cannot break what it is applied to. The cache, the asset
  and the specifier rewrite are the cheap part; being answerable for a vendor bundle's semantics is not.
  Revisit when the phase skip below has landed and this still matters, or when a second prebuilt
  dependency makes the mechanism pay for itself twice.
  **Pre-converting while still bundling is the worst of the three, and it took two measurements to say
  why.** The first read +20% against the shipped arm, and it was confounded: the spike's resolver returned
  before `opaqueVendorPlugin` could, so that arm silently lost `no-treeshake` too — two plugins matching
  one specifier, both `enforce: 'pre'`, and rollup calls only the first to return. Measured again with both
  arms in the same regime (the spike returning `moduleSideEffects: 'no-treeshake'` itself), handing rollup
  the pre-converted ESM is **-1.0s and -1.1s, about -5%**, consistent over 3 and 5 interleaved pairs; the
  output is the same size to within 662 bytes either way, because the CommonJS interop was expanding the
  UMD to the same thing. So the whole of that +20% was the lost shake, and the format is a small saving
  rather than a cost — the decomposition first written here, +2.6s of shake plus +1.4s for a bigger input,
  was wrong in the second term's sign.
  **What that buys is a sharper conclusion, not a candidate.** It needs the same conversion, so it carries
  the same risk, for a third of what externalising gives: whoever takes on being answerable for a vendor
  bundle's semantics should take the -3.0s and not the -1.0s. The lesson about the arms is the reusable
  half — the byte count tells the two regimes apart (8,511,670 shaken against 8,549,845 opaque), it had
  already caught one dead plugin in this same spike, and it was not run on this arm.

  **Skipping the phase is not the other lever.** `apack build` records what each phase read, and that
  record's own header says it is *"never a cache key"* — it is a dep file, so it can be stale about a read
  nobody has made yet. The chain already caches `compile` on declared inputs, so an unchanged tree never
  pays the 11.3s in the first place, and the gate would only serve a hand-run build. What is left is making
  the two builds cheaper, or leaving it.
- **A mutation check is worth more than a re-run.** Breaking the thing on purpose and watching the
  right test fail proves more than running the whole suite again.
- **A check that reports nothing may have looked at nothing**, and a green run cannot tell you which. This
  repo has shipped both kinds: a step that skipped every test and returned green, a cached stamp for work
  that was stale, an extractor that found no paths in the one manifest it was written for, a probe naming a
  file that does not exist. A rule table already has the answer — *"a rule with no firing case is a gate
  nothing has watched fail"* — and an ad-hoc check needs the same thing and rarely has it. Two habits, both
  cheaper than the review that catches it otherwise. **Derive the subject from the declaration that defines
  it, and assert it is not empty** — in that order, because the first is the half that keeps failing. A walk
  of the tree cannot name something fictional, but it can miss an edge, and then it is a hand-written list
  that looks derived: seven places listed `packages/` where the root `workspaces` field decides what a
  workspace is, and a lint check expanded each `npm run` once and never saw the `-ws` fan-out. Neither was
  empty, so an emptiness guard says nothing about either. **Where the input is data — a pattern list, a manifest, a
  rule table — mutate it in the test**: drop the thing under test from a copy, assert the answer flips, and the
  check proves it can fail on every run for microseconds. `repo-checks/tests/packaged-app-files.spec.ts` is the
  worked example; its two mutation cases corrected two wrong beliefs about the patterns they check on the first
  run, before the commit.
- **A result that is partial says so, and there are four shapes for that — copy one rather than invent a
  fifth.** The rule above is about a check that looked at nothing; this is about one that looked at *some* of
  it and has to report the gap. Picking the right shape is picking what the caller can do about it:
  **refuse**, where the evidence is missing and running on anyway is worthless (`packagesBuiltOrRefuse`,
  `@apack/host/build/packages-built`, with an `APACK_ALLOW_UNBUILT` hatch — it exists because thirteen spec
  files, nine of them a whole package, reported green having checked nothing); **a distinct exit code**, where
  "nothing covered this" and "everything covering it passed" are different answers a script has to tell apart
  (`npm run spec`'s 3); **a named bucket beside the total**, where some of the input was unpriceable and only
  part of it is anyone's to fix (`pricedSpecs`' `unpriced`, `scripts/lib/spec-dry.ts`, which names the specs
  no run on this machine has measured rather than summing them as free); and **a
  clause on the success line**, where the work happened but one claim in the sentence did not hold
  (the chain's own `(N of M cached)`, and `spec-cost:check`'s *"placement unchecked for 1 of 12"* before it
  was deleted). A skipped test takes its reason in the name instead, so a run that covers less says why
  rather than quietly reporting fewer cases. What none of them is: silent.
- **A check that cannot fail today is a gate or an assertion, and they want opposite things.** A gate's
  subject is input, which can be wrong, so it needs a firing case — the rule above. An assertion's subject is
  the program's own construction, and being unreachable is the point: no input reaches it, so no case can, and
  writing one means faking a state the program cannot be in. What it needs instead is a comment naming the
  *edit* that would make it fire, because that edit is what you mutate to watch it. The worked example was
  `spec-cost`'s `plans.length === 0`, deleted with that command: its argument parser refused the inputs that
  could empty the list, so it read as dead code and was filed as a defect on exactly that reasoning — but
  appending `.filter(() => false)` to the chain that built the list left every spec passing while the command
  reported "every record is current" over no work at all. Judging one as the other costs a round trip at
  best and deletes the only thing standing under a future edit at worst.
- **A list and its type are one declaration.** Write the list and derive the type from it
  (`const XS = [...] as const; type X = (typeof XS)[number]`), or the other way round where the type is the
  definition — never both by hand. Four pairs in this repo were written twice, and each had a different failure:
  `PackRuleKey` beside `PACK_RULES` made adding a pack rule two edits; `APP_ENVS: readonly AppEnv[]` accepted a
  list missing an environment, which its one consumer would have rejected at startup as invalid; `ALL_COLORS` and
  `TabGroupColor` had already drifted into different orders, and a colour in the union but not the list is one the
  picker never offers. Deriving turns each of those into a compile error at the site that would have broken. The
  cost is that the widened form has to be exported separately when consumers read optional members — which is a
  line, and it is written where it is done.

- **A cache needs a key that cannot go stale, or a scope in which it cannot — and a reset hatch is neither.**
  Three adjacent modules answer this differently and the reasons are worth knowing.
  `publishedEntryPoints` (`apack-cli/src/build/pack-features.ts`) keys on its manifest's path, mtime **and**
  size, "so there is no cache to remember to clear" — the size because a filesystem with 1-second granularity
  reads a rewrite inside one tick as unchanged. `readSource` (`pack-sources.ts`) is keyed by path alone behind
  a `resetSourceCache()`, and a hatch is a thing to forget: two specs call it, the repo's largest spec did not
  and worked around the stale reads by building a pack directory per cell, which made that test quadratic in
  its own data until `7c4b8aacc`. `packDirs` (`scripts/lib/import-populations.ts`) can be keyed neither way —
  a directory's mtime moves when its own entries do, not when something three levels down changes — so it is
  memoised **only for this repo's root**, where nothing adds a pack mid-process and no test can reach it,
  because every test builds under `mkdtemp`. That is a scope standing in for a key, and it took
  `check:specifiers` from 4.6s to 2.5s and 103 286 `readdirSync` calls to 5 366.
  So: content-key where the input is a file, scope where it is a tree, and if you reach for a hatch anyway,
  give it a case that fails when it is forgotten — which is the one thing the hatch here never had.

- **A comment is for whoever opens the file cold, not for whoever reads the diff.** What changed, how many
  copies there used to be, what you measured to decide, why some other value would be worse — that is
  commit-message material, and the commit message is where someone looks when they ask why. The test: will
  this sentence still be true, and still worth reading, a year from now, to a reader who never saw the
  change? "Three modules did X" needs rewriting the first time a fourth one does, and usually goes stale
  before it lands. "This replaces the default rather than capping it" does not. Keep what the code cannot
  say: why a non-obvious choice was made, what breaks if you undo it, and the condition that would make a
  recorded tradeoff worth revisiting.

- **A comment justifying something by a past failure must name what prevents that failure now.** If it is
  this code, say how it fails; if it is something else, name the file; if it is nothing, say nothing checks
  it. `packages-built.ts`'s *"correct by luck rather than by construction"* and `dep-files.integration`'s
  *"which a reads-are-declared check cannot notice by construction — that failure is caught by the phase
  set"* are the shape. The failure mode is inheriting the justification from a plan: `packFixture` was
  documented as what stops a fixture too thin for a rule to fire, which is a real defect that
  `import-specifiers.integration` had already closed five days earlier by asserting each rule fires. A
  repo-wide rule mandating the fixture was then built on that premise and deleted (`487a8c115`). "X is the
  whole point" cannot be checked; "Y fails when Z" can.

## A stamp directory has one writer

**The rule.** A cache of "this passed against these inputs" is only sound while one process writes it. Two
writers make `cached` mean *"some run with these inputs passed"* rather than *"this tree passed"*, and
nothing downstream can tell the difference.

There are four such directories under `node_modules/.cache`, and as of 2026-10-07 two are guarded:

| directory | written by | guarded by |
|---|---|---|
| `apack-packages-build` | `packages:ensure`, `packages:build` | `withBuildLock` (`@apack/host/build/packages-built`) |
| `apack-chain` | `npm run chain` | `holdChainLock` (`scripts/lib/chain-lock.ts`) |
| `apack-unit-pool` | `test:unit:host`, `test:unit:pack`, `test:integration` | `holdPoolLock` (`scripts/lib/unit-pool.ts`), **per pool** |
| `apack-spec-durations` | `npm run spec`, the pools' reporter | nothing, deliberately — see below |

**The unit is the entries, and the directory is only usually the right proxy for them.** The pool stamps are
locked per *pool*, not per directory, because a stamp's name carries its pool's half and provenance — so two
pools write disjoint files, and `prunePoolStamps` derives what is live from *every* pool's keys, so one pool's
prune cannot take another's. Two runs of the **same** pool is the case that collides. `unit-pool.spec.ts`
asserts that partition rather than assuming it, since it is what licenses the narrower lock.

**`apack-spec-durations` is not locked, and should not be.** It holds a ten-run window of measured file
durations, which informs one column of a report and gates nothing. A lost write loses a data point. Locking
it would be apparatus around a sample, and `spec-cost.json` — 1,884 lines of band, window, tie rule, machine
field and two idle floors, to place a spec in one of two config files — is what that costs. If something ever
*decides* on those numbers, that is the moment to revisit, and the decision is the thing to question first.

**The fix for an unguarded one is three lines**, and it is the same three: `holdExclusiveLock` from
`@apack/host/exclusive-lock` with a lock file beside the stamps, a refusal naming the holder, and a release
the mechanism already does for you on `exit` and on four interrupts. `scripts/lib/chain-lock.ts` is the
worked example and is 90 lines including its prose. **Do not write a fourth lock**: that module's header is
explicit that the mechanism is shared and only the policy — the file's name, the refusal's words — belongs to
the caller.

**Two traps, both paid for once already.**

The lock file must not end in `.json`. `pruneStamps` (`scripts/chain.ts`) removes every `.json` in the stamp
directory that is not a live step's stamp, so a lock named that way is deleted by the *next* run while the
first still holds it, and both then run — the exact failure the lock exists to prevent, arrived at through
the lock. `chain-lock.spec.ts` asserts the name against `pruneStamps`' own predicate rather than against the
string, because a case pinning `'chain.lock'` passes while the coupling rots.

A spec for one of these cannot take the real lock. `repo-checks` runs inside `test:integration`, which the
chain runs, so a case taking `CHAIN_LOCK` is refused by the run that is running it. Take a `file` parameter
defaulting to the real path — `withBuildLock(label, run, file = LOCK_FILE)` and `runningPackageBuild(file =
LOCK_FILE)` already do — and assert the real path's *properties* separately.

**What this cost to learn.** Four chain runs on 2026-10-07 produced three failures, none attributable to
code, while two sessions worked in one checkout. Each guard reported truthfully and none could name the
writer: `PackagesWentStale` said *"something rebuilt or edited them"*, the classifier said *"contention or a
flake, not the code"* having removed a variable it never identified, and the freshness sweep filed a step
whose inputs moved mid-run as a step that will not be cached next time — a caching note over a correctness
fact, printed after both runs had spent the time. Two hypotheses were investigated and disproven first (tsc
union ordering; a codegen skip ignoring its own generator), and two fixes were proposed that already existed.
The lesson is not that a guard was missing. It is that these guards assume one writer, and say nothing useful
when that assumption is the thing that broke.

**What closed it, and the shape all three took.** Each report held the fact it needed one frame up and printed
a guess instead, so each now names what it has and says what it could not rule out:

- **`PackagesWentStale` names the writer.** `waitForPackageBuild` already returned the holder it waited for and
  `ensurePackagesBuilt` discarded it — and that return is the *only* evidence in the ordinary case, because by
  the time staleness is read the writer has finished, which is what let the run past the wait. So reading the
  lock at that moment, which this doc used to suggest, answers for almost nothing. `packageWriter` has three
  arms: the build this run waited for; a lock still on disk, with whether its holder is alive, which covers a
  crash, a wedge and a writer arriving after the wait; and neither, which means something that does not take
  the lock did it.
- **A step whose inputs moved *while it ran* says its result is void**, and `--strict` fails the run on it.
  Only that reading of `whenChanged` counts: a change *after* the step is the ordinary cache miss, and two of
  the four readings cannot be placed at all. Proven on a live run where five steps were stale and exactly one
  was voided.
- **The classifier claims no cause.** It names the steps `ScheduleResult.peers` recorded beside the failing one
  — what happened, rather than the admission limit, which was the recorded reason it used to guess — and says
  it cannot choose between one of those, a writer outside the chain, and the step being nondeterministic.

**The one thing none of them can close** is a writer that records nothing: an editor, a tool that takes no
lock, another session. All three now say that in the arm where it is the answer, which is the difference
between a report a reader can act on and one they learn to skip.
