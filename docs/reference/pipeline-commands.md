# Pipeline commands: what each flag was measured against

The root `CLAUDE.md` has each command's purpose and its flag *names* — enough to use it. This holds the
rest: what a flag replaced, what was measured to choose it, and which cheaper thing was tried and did not
work. Read it when you are about to change one of these commands, or when a flag's behaviour surprises you.

It is here rather than there because the guide is loaded into every session and this is consulted when
someone reaches for a flag. Moving it was not a judgement that it stopped mattering: 1,095 lines of guide
was 75% two sections, and a lesson's rule belongs in the guide while its evidence belongs here.

## `npm run chain`

```bash
npm run chain            # Before a merge: every check in dependency order, cold 158s and warm 0.9s. Each
                         # step is cached on the inputs it declares (scripts/lib/chain-steps.ts), so a doc
                         # edit runs nothing and a one-package edit runs that package's suite; the E2E
                         # suite is opt-in (`--e2e`) rather than a gate, with its reason on the step: it
                         # was built to be driven, and taking it off the chain took a doc edit from 26s to
                         # 0.9s. It runs api:check and packages:check, both of which regenerate what they
                         # compare: neither has a cheaper proxy, and api:check's stopped being cheaper than
                         # the thing it stood for.
                         # **Never pipe a backgrounded run.** It buffers output and prints only a failing
                         # step's, so `| tail` discards the one thing a failure leaves behind, and that
                         # does not come back on a re-run that passes.
                         # Afterwards, on the machine its table was measured on, it names the steps a run
                         # contradicted: one past double its declared
                         # `seconds`, and one that passed and is already stale again — the second with the
                         # inputs that differ and whether each moved while the step ran (an ordering to
                         # fix) or since. And a step whose *measured* cost outgrew the timeout rung it
                         # declares: `declaredShare` gates on the declaration and the band above watches
                         # declarations at half-to-double, which is looser than the bound's own margin, so a
                         # run is the one place both numbers exist (`outgrownRungs`). That one needs the
                         # measured schedule too, and for a reason the others do not share: `declaredShare`
                         # projects a cost onto a machine `stretches` times slower, so a reading from a
                         # slower box counts the slowdown twice — 17 of 29 steps on a 4x-slower runner,
                         # every one of them inside its rung by declaration. A drift row is true wherever it
                         # was taken and only its advice is gated; this number is the projection.
                         #   --dry     the plan and why each step is or is not cached, running nothing —
                         #             and **what bounds it**: the critical path over the declared table,
                         #             which is the answer to "which step is worth making faster". A step
                         #             off that path runs inside the shadow of the ones on it, so its own
                         #             duration is not a saving. `--dry --all` gives the cold chain's path,
                         #             since `--all` plans every step; no second flag, the composition
                         #             already means it
                         #   --all     every step regardless of its stamp, forcing those that keep a cache
                         #             of their own; the run each step's `seconds` is checked on
                         #   --cores N how much of the machine to spend. **This machine's cores by default**,
                         #             and the only limit there is: a step declares what it takes
                         #             (`POOL_WIDTH`, scripts/lib/core-budget.ts) and admission is the sum,
                         #             so the eighteen single-threaded `tsc` legs run wide while the two
                         #             nine-worker vitest pools do not pile on each other. It replaced
                         #             `--lanes N`, which metered both as one unit each: measured
                         #             2026-10-02, interleaved `--all` pairs on ten cores, three lanes is a
                         #             median 202.8s and a ten-core budget 169.4s with half the spread.
                         #             `--cores 1` is serial, which is what `--lanes 1` was for. It caps
                         #             what to spend of *this* box rather than describing a box of N: the
                         #             widths stay machine-sized, so a value above the box is deliberate
                         #             oversubscription and one below it is a cap a wide step cannot fit
                         #             inside, where it runs alone
                         #   --e2e     run the E2E suite with the chain, ordered after test:smoke
                         #   --record  write each step's measured cost back into its table. Needs --all,
                         #             refuses a budget other than the one the table was measured at,
                         #             refuses a busy machine, and refuses a run where too much moved to
                         #             have been measuring the code. --force overrides the last two
                         #   --force   record anyway, and know the number is forced
                         #   --forget  with --all --record: write what this run measured for every step,
                         #             not only the rows past their band. The band is max(1s, 35%), which is
                         #             wider than a 10-20% staleness, so a row inside it cannot be corrected
                         #             by any other means — `--force` overrides the refusals, not the band.
                         #             It writes only rows whose value actually differs, so a run that agrees
                         #             with the table leaves no edit and moves no mtime. The same word
                         #             the deleted `spec-cost:update` took, for the same operation: ignore
                         #             what is recorded, keep what this run measured.
                         #             **For a change you know about — a bundler bump, a policy change — and
                         #             not to chase a drift you do not.** It replaces the whole table from one
                         #             run, so a run that measured the machine writes the machine into every
                         #             row: watched 2026-10-04 putting `build:app` at 78s against the ~39s six
                         #             other runs agreed on, which then failed `declaredShare`.
                         #             **The drift report now says which of the two you have**, so you need not
                         #             guess: `driftVerdict` recomputes the movement without the largest mover,
                         #             and a movement that does not survive that is one step's — reported with
                         #             `--forget --step <name>` as the remedy. Only a movement that does
                         #             survive is the table's, where the answer is to re-run on an idle machine
                         #             until it settles. `scripts/chain.ts` records the three cheaper guards
                         #             that were tried and do not separate the two cases
                         #   --step <name>  with --forget: write that one step and no other. **The usual
                         #             form**, and now the one the report names for you — a wrong number
                         #             confined to the row you named cannot reach the other twenty-eight, and
                         #             `declaredShare` catches the one. Bare --forget stays for a correlated
                         #             drift, which is all-rows by nature and is the other branch the report
                         #             distinguishes. Refused where it names no step in the run, which would
                         #             record nothing and report a quiet table
                         #   --adopt   record on another machine, writing `MEASURED_ON` with the costs.
                         #             The table and the box it was measured on are one fact, so one
                         #             operation writes both — without this the costs moved and the
                         #             constant did not, and every check scoped on it then skipped the box
                         #             whose numbers were in the file. Needs --all and this machine's cores
                         #             as the budget, since it records what this machine costs
                         #   --no-classify  a step failing while the machine is busy is re-run alone, to
                         #             tell the code apart from contention; the retry never stamps and the
                         #             chain still exits 1. This turns that off
```

## `npm run measure and measure:loop`

```bash
npm run measure -- "<cmd>"  # Times a command on a quiet machine and prints a number you can quote:
                         # `48.2s median of 5 (45.0s-49.3s), 92% idle, 2026-09-30`. A number without its
                         # conditions is an assertion; with them it is a citation, and the difference is
                         # three commit messages in goal-integration-pool that had to be corrected.
                         #   --runs N          how many (5)
                         #   --against "<B>"   an A/B, **interleaved**, reported as the median of the pairs.
                         #                     Blocked arms let a drifting box in: measured, that turned
                         #                     49.1s->48.2s into a reported 71s->46.1s.
                         #                     Prints **cores busy per arm**, which a lone measurement does
                         #                     not get: between two arms it is what says the treatment landed
                         #                     (`coresBusy` has the case). Nothing warns when the two agree —
                         #                     most null results are real, so a gate on that would be wrong
                         #                     more often than right. Reading it is the method's, below
                         #   --trials N        how often does it *fail*? The rate and its 95% upper bound —
                         #                     0 of 5 bounds it at 45%, 0 of 20 at 14%. Failures group by a
                         #                     normalised signature: it groups, it does not classify
                         #   --busy N          N CPU burners, so contention is induced rather than waited
                         #                     for. Implies --force and says so in the conditions
                         #   --idle PERCENT    lower the floor    --force  measure anyway
                         # It refuses below IDLE_FLOOR (70%) — the floor for a command that *prints*, where
                         # the output carries its own conditions; a command that records asks
                         # RECORD_IDLE_FLOOR (80%) instead. Read from os.cpus() rather than load average,
                         # which lags — measured, loadavg 3.20 on a box that was 78.7% idle. **Idle is
                         # sampled between runs, never during one**: a reading taken while the command runs
                         # measures the command, and a quiet box reads 0% while a suite uses it.
                         # Prints, never records — a timings file would be a sample, and the deleted
                         # spec-cost.json is what that costs (see the sample section above)
                         #
                         # **A null A/B is unfalsifiable until the independent variable is shown to have
                         # moved**, and the instrument cannot do that half for you: `measure` takes the
                         # command as an opaque string, so it never knows what configuration you meant to
                         # change. Three habits, in the order they pay:
                         #   - **Read the config before guessing at the knob.** The first failed attempt at
                         #     capping `test:integration`'s pool passed `--maxWorkers`, which
                         #     `vitest.integration.config.ts`'s own comment says `poolOptions.maxThreads`
                         #     overrides. The answer was on screen and the run was wasted anyway; no readout
                         #     prevents that one
                         #   - **Run the positive control first.** Set the knob to the value that *must*
                         #     change the answer and confirm it does, before trusting any null. Measured
                         #     2026-10-04, that run — the pool genuinely capped, 42.5s to 82.5s — arrived
                         #     third, after two nulls that had been read as "the pool does not scale"
                         #   - **Prefer the direct signal to the proxy.** Cores busy is the fallback that
                         #     covers most cases; where the thing under test reports its own state (vitest
                         #     names its worker count, a cache its hits), read that instead. A -1% delta
                         #     should read as "the knob did nothing", and only a second signal says which

npm run measure:loop -- "<cmd>"  # Not how long a command took, but how long each process it started went
                         # without turning its event loop, against the 60s window birpc gives a call and
                         # vitest hardcodes. Per process, worst block first:
                         #   worker  abuddy-cli/tests/…/types-bundler-determinism…  10.0s  6.0x slower  100%
                         # Headroom rather than the block alone, which reads as fine until it is not: 38s
                         # against 60s is one busy afternoon from failing. `elu` says *why* a process was
                         # quiet — 4% was waiting, 99% was working, and only the second can be shortened.
                         # It answers what `[vitest-worker]: Timeout calling` does not, which is which side
                         # failed; see the test:integration entry above for the mechanism and the fix
```

## `npm run spec, spec:dry and spec:full`

```bash
npm run spec             # The specs your uncommitted changes affect, wherever they live.
                         # **Three exit codes**: 1 a spec failed; 2 the name was wide enough to be a
                         # search, so the paths were listed rather than run; 3 the target exists and no
                         # spec covers it, so nothing ran and nothing passed. 3 is the one worth knowing:
                         # `vitest related` exits 0 when the graph reaches no spec, so a green run and a
                         # run that did nothing were the same answer until it existed. Only a route that
                         # promised coverage earns it — a whole-suite run, a `-t` matching no case and a
                         # doc target all report zero correctly and exit 0
npm run spec:dry [...]   # What the plan would run, and what the last run on this machine measured it at,
                         # running nothing. Takes every argument spec does; ~1.6s whatever comes back, since
                         # it is the project configs loading rather than a graph being walked. It prints
                         # **file time summed across workers, never a wall estimate** — the ratio between
                         # the two was 1.55:1 and 2.18:1 on one target three days apart — and when that run
                         # was, since that is how stale the answer is.
                         # **There is no record behind this and nothing to re-record.** It reads a cache the
                         # unit pools write (`node_modules/.cache/abuddy-spec-durations`, keyed by suite and
                         # half), so nothing is committed, nothing can describe another machine, and a spec
                         # no run here has measured is named rather than counted free. A fresh clone prices
                         # nothing and says so. It replaced `spec-cost.json`, which held a millisecond per
                         # spec in git and needed a window, a band and two idle floors to be comparable at
                         # all. The ordinary `npm run spec` collects nothing.
                         # **That cache keeps a window too, and the difference from the deleted one is what
                         # it is for**: ten runs per suite and half (`KEPT_RUNS`), uncommitted, feeding one
                         # `(was Xs over N runs)` column on five lines the pools already print. The old
                         # window *decided* a spec's half, and because that decision was impossible it
                         # needed hysteresis, a band, a tie rule, a machine field and two idle floors to be
                         # comparable. Nothing compares this one against an edge, so there is no threshold
                         # to get wrong — which is also why the output is bounded to a list that was already
                         # bounded rather than to whatever crossed a line
npm run spec:full [...]  # The same, plus the two answers the module graph cannot give: the pack suites a
                         # rebuilt dist would reach, and the integration halves behind a second config.
                         # Costs a build when one is stale (14s), the pack suite (18s) and the pooled
                         # integration run (47s), and adds nothing where neither depends on your change.
                         # `--full` is the one argument spec.ts consumes, and only in first position,
                         # which is what keeps "everything from the first - is vitest's" exact
npm run spec -- <target> # You don't say what the target is; it works that out:
                         #   a source file  -> every spec that imports it, transitively, in ANY package
                         #   a spec path    -> that spec        a directory -> every spec under it
                         #   part of a name -> every spec whose path contains it — how you run one while
                         #                     working: `npm run spec -- chain-schedule` is 1.7s
                         #   a pack's src/seeds/** or one of its build inputs (abuddy.json, package.json,
                         #                     tsconfig.json) -> the walk, plus the specs that read what
                         #                     building it produces. Named by default, run by spec:full
                         # A source file runs one vitest over every host project, because that is the
                         # honest answer to "what could this break". The cost is the blast radius: a
                         # renderer module 1 spec, the api's runtime 13, abuddy-sdk's entity types 104.
                         # **A pack suite is not in that answer.** It resolves the published dist while
                         # the host projects resolve source, so no import edge runs from your edit to the
                         # spec that covers it — that edge runs through a build. The command says so when
                         # it is true, derived from the declared dependencies (workspace-deps.ts) and
                         # including the transitive ones; repo-checks' spec-plan.spec.ts partitions which
                         # packages those are, so a new edge fails a check instead of dating a sentence.
                         # A pack's own source runs `related` inside that pack, since no root project
                         # imports a pack's backend or frontend: 1-3 files in 2-6s against the whole
                         # suite's 87 and 18s.
                         # **Nor is an integration half**, for a duller reason: it is a second config and
                         # the root projects exclude its specs. 22 modules in @abuddy/cli are imported
                         # directly by one. Named the same way, run by spec:full.
                         # Anything from the first `-` goes to vitest untouched, so `-t "a case"`,
                         # `--bail 1` and `--changed HEAD~1` work. The routing is data
                         # (scripts/lib/spec-plan.ts), asserted by repo-checks' spec-plan.spec.ts.
                         # Where a spec belongs: its path under tests/ mirrors the source it covers, no
                         # directory names a level or a cost half, and support dirs take a _ prefix
                         # (docs/reference/test-inventory.md; repo-checks' spec-placement.spec.ts)
```
