# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

AgentBuddy is an Electron desktop app with an actor-based architecture. Both frontend and backend are built on XState state machines that communicate through typed events.

- **Backend** (`packages/api/`) — Node.js server (`node:http` + `ws`) using tRPC: transport, process boot and the composition of the app runtime (`@abuddy/host`: XState actor systems, packs, services) over LMDB persistence (`@abuddy/ears/lmdb`)
- **Frontend** (`packages/renderer/`) — Vue 3 + Tailwind CSS plugin system, each plugin is an XState actor with designated UI areas (canvas, panel)
- **Electron main** (`packages/main/`) — Module-based process manager that spawns the API server and manages windows
- **Preload** (`packages/preload/`) — IPC bridge exposing safe APIs to renderer
- **Default Setup** (`packages/default-setup/`) — the built-in pack: features, steps, and seed sources (actions, prompts, flows, library, notes, FAQs, settings) that `abuddy build` compiles into `packages/default-setup/dist/` from `abuddy.json` `boot.seed` (see `packages/default-setup/CLAUDE.md` and `docs/public-facing/seeds.md`)
- **Repo checks** (`packages/repo-checks/`) — the specs whose subject is the repo's own tooling: the chain's graph and cache keys, the recorded spec costs, and the scripts under `scripts/`. A workspace because a spec needs one, and because `npm run spec` routes a `scripts/` change here (see `packages/repo-checks/CLAUDE.md`)

Monorepo using npm workspaces. Requires Node >= 23.0.0.

## Release metadata

Do not edit release/version metadata unless the user explicitly asks for a release or version bump. This includes `package.json` version fields, `package-lock.json` root package versions, app version constants, release notes, changelogs, and generated release artifacts. The release process owns those changes.

## Backward compatibility

**There is none to keep, and assuming otherwise is the more expensive mistake.** Change a signature, a manifest key,
a published export or a stored field's name outright, and migrate every in-repo caller, test, fixture, template and
doc in the same change. No dual-read of an old key and a new one, no alias, no deprecation window, no shim.

That is not a stylistic preference, it rests on a fact: **no pack exists outside this repo.** Third-party
distribution is not built — `resolveFromRemoteRegistry` (`packages/abuddy-cli/src/commands/install.ts:17`) throws
for every name it is given — so every pack that exists is in this tree, where a rename is a change the typecheck
proves you finished. Weighing a design against packs that might be installed weighs it against nothing, and that
caution has a real cost: it is how a repo with no users takes on the constraints of one.

**The exception is stored user data**, which does exist on disk. A renamed `AppState` field, settings key or entity
attribute moves with a migration (`packages/abuddy-host/src/migrations/CLAUDE.md`); a renamed function or type does
not, because nothing has one saved.

**Revisit this when a third-party pack can actually be installed from a registry.** That is the condition. Until it
holds, "an installed pack might depend on this" has no subject, and a plan that treats it as a constraint should say
so out loud so the claim can be checked.

## What to run after a change

**`npm run chain` costs what you changed.** Each step declares what it reads
(`scripts/lib/chain-steps.ts`), is fingerprinted over exactly that, and is skipped when nothing under it
moved — so the table that used to live here, asking you to work out which suite covers your edit, is now the
graph's job. Run the chain and it runs the subset; it does not need you to have guessed right.

Measured on an idle machine, 2026-09-25, each one a real run rather than a sum of the parts:

| What you changed | What the chain runs | Cost |
|---|---|---|
| nothing tracked | the E2E suite, which is never cached | **26.8s** |
| a doc, a comment, a CLAUDE.md | nothing but that — no step declares `docs/` | **26.8s** |
| one package's source (the renderer) | `test:unit:host`, which runs only the renderer's project and `@app/main`'s (it depends on the renderer), `typecheck`, then `build:app` and all of tier 3, because rebuilding the app moves what tier 3 reads | **115.1s** |
| nothing is cached (a cold tree) | all 17 steps, two at a time | **190.1s** |

The one-package row is the one worth reading twice: editing a package that the *app* is built from costs four times editing one it is not, because `build:app` rewrites `packages/*/dist` and every tier-3 step reads it. A change under `@abuddy/ears` or a pack's tests does not pay that.

`npm run chain --dry` prints that plan without running it, and says why each step is or is not cached —
which is the way to find out why something you expected to be skipped is not.

**The inner loop is still `npm run spec`**, and it is still much cheaper than a chain run: with no
arguments it runs the specs your uncommitted changes affect, in every package they touch; with a source
file it runs the specs that import it. One spec file is 1-3s and a package's `tsc --noEmit` is 3s, against
the chain's 27s floor. Use it while you are working, and the chain when you are done. A change to
`scripts/` or to a vitest config counts too: it routes to `@app/repo-checks`, the package holding the
specs that check the repo's own tooling.

**The one answer `spec` cannot give from the module graph is a pack suite's**, because a pack resolves the
published `dist` while the host projects resolve source — so its specs never import a dependency's `src`,
and the edge from your edit to the spec that covers it exists only through a build. `npm run spec` says so
when it is true; `npm run spec:full` runs it, for a build plus 18s. Which is also why editing `@abuddy/sdk`
can be green under `spec` and red under `chain`: the chain declares that dependency
(`scripts/lib/workspace-deps.ts`) where a module graph cannot see it. The same seam is why a *pack's own*
source runs that pack's whole suite rather than a root `related` — nothing in the root projects imports it.

Two things the chain cannot work out for you, because they rewrite files you commit:

- **a public export of `@abuddy/ears`, `/sdk` or `/ui`** — `npm run api:update`, and commit `etc/`.
  `typecheck` fails until you do.
- **a pack's seed source (`src/seeds/`)** — when only `sourceHash`/`rowSha256` moved, re-record
  deliberately with `npm run seed-parity:update -w @app/default-setup`, and never edit a hash by hand.
  Re-recording rewrites a test expectation, not user data; what reaches users is the new `sourceHash`.
  `packages/default-setup/tests/seeds/CLAUDE.md` has the rule for what a golden records.

**`api:check` is not a chain step, on purpose.** `typecheck` runs `api:stamp`, which hashes the same
declarations the reports are generated from, in 0.6s against `api:check`'s 55. A report is a pure
function of those declarations, so a matching stamp means `api:check` cannot fail, and a moved
declaration fails `typecheck` until `api:update` runs. Run `api:check` before publishing, where it is
the authority; running it per merge re-proves the stamp and costs a minute. The one thing the stamp
cannot see is a hand-edited `etc/*.api.md` whose declarations never moved, which the publish path
catches.

The chain is the whole gate: **CI does not run, on purpose.** `.github/workflows/ci.yml` has its `push`
and `pull_request` triggers commented out while this is a single-contributor repo, so `gh run list` is empty
and always will be. That is not a failure to report, and CI is not a check to cite — the local chain is the
check. The workflow's header says when it goes back on.

Things that waste the most time, in order:

- **Running anything at all after a comment, a doc or a CLAUDE.md edit.** Nothing means nothing: not
  `typecheck`, not the package's suite, not "just to be safe". Prose cannot break a build, and no step
  declares `docs/` among its inputs, so the chain agrees — `npm run chain --dry` after a doc edit reports
  every step cached. The two exceptions are a spec that asserts the text and a code fence someone will
  copy: check that one command. This is first on the list because it is the one most often ignored, and a
  full `typecheck` is 53s against a doc edit's 0s.
- **Running `npm run build` to test a change no build output depends on.** The renderer and API build
  from source; a CLI or SDK change does not need them rebuilt to be tested.
- **Running an E2E suite to find a bug you have a stack trace for.** A minified frame with a line and
  column is a solved problem: build once with `sourcemap: true` in the renderer's Vite config, decode
  the mapping, read the source. Do that before you grep, not after.
- **Re-running the full chain after a fix to a thing the chain already covered.** If the CLI suite
  caught it, the CLI suite proves the fix.
- **Reading the source twice to explain a bug the running app would show you.** A hang or a dropped
  event in the real app is worth one instrumented E2E run — a `console.error` in the failing path,
  `npm run build:be`, `DEBUG_E2E=1 npm test -- <spec> --grep "<title>"`. Two carefully argued
  explanations have been wrong where one such run was decisive. `tests/e2e/CLAUDE.md` has the method,
  including what to rebuild first and how to put the instrumentation back.
- **Reading a chain step's `cached` as "the thing it guarantees is true".** It means only that the step's
  declared inputs have not moved. `packages:ensure` used to be cached that way, and what it guarantees —
  that the built packages are current — is recorded in `node_modules/.cache/abuddy-packages-build`, which
  its fingerprint cannot see and `fingerprintUnit` excludes from the content hash by design. Measured
  2026-09-26: with those stamps cleared and `dist` still present, the step reported `cached` while
  `packagesBuiltOrRefuse()` refused, so every step reading the built packages failed at collection (five
  files, thirty-three tests skipped). It is `cache: false` now — 0.3s warm, against a second record of one
  fact that can disagree with the first. Two caches over one body of work is the bug, not the cost.
- **Running suites concurrently *before the packages are built*.** The hazard is the build itself, not
  the suites: `ensurePackagesBuilt()` returns before taking the lock when nothing is stale
  (`abuddy-host/src/build/packages-built.ts`), and only `stampedBuild` locks. So two suites that both
  find a stale package race each other's build and fail about the race rather than the code — which is
  what a background `test:unit` against a foreground `test:external-pack` used to do. Run
  `npm run packages:ensure` once first and every later call is a stat and a return, which is what makes
  a parallel chain safe; the 18 calls a serial chain makes are each paying that stat for nothing.

Three rules that pay for themselves:

- **Measure before you optimise, and before you accept someone else's measurement.** Two proposals in
  this repo were rejected by one command each, and both had been argued for at length first.
- **A mutation check is worth more than a re-run.** Breaking the thing on purpose and watching the
  right test fail proves more than running the whole suite again.
- **A comment is for whoever opens the file cold, not for whoever reads the diff.** What changed, how many
  copies there used to be, what you measured to decide, why some other value would be worse — that is
  commit-message material, and the commit message is where someone looks when they ask why. The test: will
  this sentence still be true, and still worth reading, a year from now, to a reader who never saw the
  change? "Three modules did X" needs rewriting the first time a fourth one does, and usually goes stale
  before it lands. "This replaces the default rather than capping it" does not. Keep what the code cannot
  say: why a non-obvious choice was made, what breaks if you undo it, and the condition that would make a
  recorded tradeoff worth revisiting.

### What a test may read

Every check in `npm run chain` declares a tier (`scripts/lib/chain-steps.ts`), which says what it is allowed
to read. `npm run check:tiers` fails when a tier-1 or tier-2 step can reach the app.

| Tier | May read | Examples |
|---|---|---|
| **1 pure** | its own package's source, the in-memory runtime, fakes | most of `test:unit`, `typecheck` |
| **2 contract** | the built `@abuddy` packages, a pack's build output | `packages:ensure`, `compile`, `test:external-pack:contract` |
| **3 app** | the built app | `build:app`, the E2E suite, `test:external-pack:app`, `test:packaged-authoring` |

The rule that matters is that tier 1 and tier 2 do not need the app, because the moment one does it has to
run after `build:app`, its real inputs become the whole repo, and it can no longer be cached or reordered. Four
attempts at a cheaper chain each failed on exactly that, because nothing recorded it. A check that genuinely
needs the app is tier 3 — that is an answer, not a failure, and the fix is never to delete the check.

`test:external-pack` is split at that boundary: `:contract` validates, builds and typechecks each fixture
pack and runs its harness specs with no app, in tier 2 before `build:app`, and `:app` runs its Playwright suite in
tier 3. Two scripts rather than one with a flag, because `check:tiers` reads a step's scripts as text and a
branch it never takes still reads as a reach. `test:packaged-authoring` is still tier 3 whole: its nine steps
build on each other, so it takes a mode rather than a split.
[`goal-test-tiers.md`](docs/archive/goals/goal-test-tiers.md) has the rest, and what each of the four attempts at a
cheaper chain measured.

## Commands

**Script names say whether they write.** Three shapes, and the second word tells them apart:

- `<artifact>:check` / `<artifact>:update` — something recorded that can go stale, and the two halves
  carry the *same* noun: `api:*`, `facade:*`, `schema:*`, `exports:*`, `seed-parity:*`. `check` and
  `update` are reserved as suffixes, so a name ending in `update` is the only kind that rewrites a file
  you would commit.
- `<action>:<scope>` — an action over part of the repo: `typecheck:fe`, `test:unit`, `build:be`. The
  second word is a place, and nothing here writes a tracked file.
- `<action>:<variant>` — a variant of one action: `build:dev`, `test:watch`, `lint:fix`.

The point is that the name is derivable: knowing an artifact tells you both its scripts, without a grep.
Put a new recorded artifact in the first shape and give it both halves, even when one half is trivial —
an artifact with only an update is one nothing will notice has gone stale.

```bash
npm start                # Dev mode (builds the built-in pack without its FE bundle)
npm run start:gen        # Full built-in pack build (npm run compile), then dev mode
npm run build:be         # Build backend only
npm run build            # Build all workspaces. The chain runs build:app instead, which leaves the
                         # built-in pack to compile — building it twice rewrote the dist five steps read
npm run build-prod       # Full production build (build/build.sh)

npm run typecheck        # Every check below, plus check:specifiers
npm run typecheck:fe     # Frontend only (vue-tsc)
npm run typecheck:be     # Backend only (tsc --noEmit, plus the api's scripts)
npm run typecheck:ears   # @abuddy/ears only
npm run typecheck:sdk    # @abuddy/sdk only
npm run typecheck:host   # @abuddy/host only
npm run typecheck:ui     # @abuddy/ui only
npm run typecheck:cli    # @abuddy/cli + @abuddy/testing
npm run typecheck:scripts # scripts/ and tests/
npm run typecheck:pack   # @app/default-setup only
npm run exports:check -w @abuddy/ui  # Fails on a stale exports map or a component without an entry

npm run spec             # The specs your uncommitted changes affect, wherever they live
npm run spec:full [...]  # The same, plus the pack suites a rebuilt dist would reach — the answer the module
                         # graph cannot give. Takes every argument spec does. Costs a build when one is stale
                         # (14s) and the pack suite (18s), so a shallow @abuddy/sdk edit goes from ~24s to
                         # ~33s measured; it adds nothing when no pack depends on what you changed, and the
                         # pack pool skips on its own stamp when nothing it reads has moved. `--full` is the
                         # one argument spec.ts consumes and only in first position, which is what keeps
                         # "everything from the first - is vitest's" exact rather than nearly true
npm run spec -- <target> # You don't say what the target is; it works that out:
                         #   a source file  -> every spec that imports it, transitively, in ANY package
                         #   a spec path    -> that spec        a directory -> every spec under it
                         #   part of a name -> every spec whose path contains it — how you run one while
                         #                     working: `npm run spec -- chain-schedule` is 1.7s
                         # A source file is one vitest over every host project, because that is the honest
                         # answer to "what could this break" and the root vitest.config.ts already lists
                         # them. It used to run the file's own package: for a type every pack's data flows
                         # through that was 24 of the 104 specs covering it, reported green. The cost is the
                         # blast radius: a renderer module 1 file, the api's runtime 13, abuddy-sdk's entity
                         # types 104. Wall times of 4.1s, 6.0s and 23.7s were taken 2026-09-26 on a machine
                         # at load ~10 of 10 cores, so read them as upper bounds; the file counts are what
                         # the decision rests on and contention does not move those.
                         # A pack suite is not in that answer, because it resolves the published dist while
                         # the host projects resolve source, so its specs never import packages/<dep>/src and
                         # no import edge runs from the file you edited to the spec that covers it. The edge is
                         # real and runs through a build: src -> tsdown -> dist -> the pack's specs. The
                         # command says so when it is true, derived from the declared dependencies
                         # (workspace-deps.ts, the same function the chain keys its cache on) and including
                         # the transitive ones: @abuddy/host reaches the pack through @abuddy/testing, whose
                         # bundle inlines it. Which packages those are is not written down here — repo-checks'
                         # spec-plan.spec.ts partitions every one of them, so a new dependency edge fails a
                         # check instead of dating a sentence. It used to warn on every root run, a
                         # @app/renderer edit included, and a warning always on is one nobody reads.
                         # A pack's own source goes to its own suite: measured, no root project imports a
                         # pack's backend, frontend or generated FE entry, so the root run this used to plan
                         # found nothing and exited 0 for the repo's largest suite.
                         # Anything from the first `-` goes to vitest untouched, so `-t "a case"`,
                         # `--bail 1` and `--changed HEAD~1` work. A named spec runs through its package's
                         # own `test`, so a pretest guard and its vitest config still apply; a root run has
                         # no such hook, so packages:ensure goes in front of it. The routing is data
                         # (scripts/lib/spec-plan.ts) and asserted by repo-checks' spec-plan.spec.ts
                         # Where a spec belongs: its path under tests/ mirrors the source it covers, no
                         # directory names a level or a cost half, and support dirs take a _ prefix
                         # (docs/reference/test-inventory.md; repo-checks' spec-placement.spec.ts)
npm run chain            # Before a merge: every check in dependency order, cold 190s and warm 27s.
                         # Reports each step's time and its slowest five tests, buffers its output and
                         # prints only a failing step's. It leaves out api:check, which typecheck's
                         # api:stamp already covers. Afterwards it says which steps a run contradicted:
                         # one whose measured time has left its declared `seconds`, and one that passed
                         # but is already stale again, which means something wrote into its inputs.
                         # Each step is cached on the inputs it declares (scripts/lib/chain-steps.ts)
                         # through the package builds' stamp protocol: an unchanged step reports `cached`
                         # and does not run, so a doc edit runs nothing and a one-package edit runs that
                         # package's suite. The E2E suite is never cached, with its reason on the step.
                         #   --dry     the plan and why each step is or is not cached, running nothing
                         #   --all     run every step regardless of its stamp, and force a step that
                         #             keeps a cache of its own — it appends that step's `forceArgs`, which
                         #             is how the two unit pools are made to re-run every project. Without
                         #             that, overriding the chain's stamps said nothing to the pool's, so
                         #             --all ran the step and the step skipped 2654 tests and returned green
                         #   --lanes N how many steps run at once. Three by default, re-measured against
                         #             the pooled step shape: 1 lane 261s, 2 lanes 208/192s, 3 lanes
                         #             158/162/156s, 4 lanes 160s, none failing. Three reverses the
                         #             earlier cap, which was vitest's 5s default failing the third lane
                         #             rather than the cores; per-tier timeouts removed it. Re-measure
                         #             when the step shape changes: this is tuned to eleven steps
npm test                 # Playwright E2E tests
npm run test:unit        # Vitest, as two pools: the host suites as one root run under the
                         # @abuddy/source condition, and the pack suite on its own resolving the published
                         # dist. Serial, measured — a second lane buys 3% for 87% more work.
                         # The list is scripts/lib/unit-suites.ts, which the chain reads too
npm run test:integration # The expensive half of every suite that has one (@abuddy/cli, @app/repo-checks).
                         # Which packages those are is derived from the configs each has; the script's
                         # -w flags are the half that is checked rather than derived
npm run test:unit:host   # One pool, running only the projects whose own inputs changed (--project per
npm run test:unit:pack   # stale project, one process). These are the chain's two steps; per-package
                         # staleness lives inside them, so a one-package edit still runs one project.
                         # Both run packages:ensure first: npm pretest does not fire under a root run
npm run test:all         # test:unit, then the E2E tests
npm run bench -w @abuddy/ears    # EARS engine benchmark (baseline and tolerance: packages/abuddy-ears/CLAUDE.md)
npm run test:external-pack       # Both halves of the fixture-pack check, for running it by hand
npm run test:external-pack:contract  # validate, build, typecheck, harness specs — no app needed (tier 2)
npm run test:external-pack:app   # each pack's Playwright suite against this checkout (tier 3, needs npm run build)
npm run test:packaged-authoring  # Author, build, test and install a pack outside the monorepo from the packed @abuddy/* tarballs (needs npm run build)
npm run compile          # Build packages/default-setup (abuddy build: compiled seeds, snapshot, types; DSL defs; dist/runtime/index.cjs)

npm run db:query -- "<code>"   # abuddy db query on the dev app's data (also db:exec, db:repl, db:inspect,
                               # db:export, db:import, db:reset, db:clear-settings; the app closed for changes)

# Published API surface (from the root for all three, or inside one of the packages for just it)
npm run api:check        # CI: fails if a public entry's API changed without updating reports
npm run api:update       # Dev: regenerate etc/<entry>.api.md (and etc/<entry>.component.md for UI components),
                         # and record what they were generated from in etc/declarations.sha256
                         # Both read an @abuddy dependency's built declarations: npm run packages:build first
                         # All three take ~46s (ui is 33s of it), which is why api:check is a before-merge
                         # and CI check rather than a per-edit one
npm run api:stamp  # The cheap half, run by npm run typecheck: compares what the reports were
                         # generated from with etc/declarations.sha256 in ~0.6s and says "run npm run
                         # api:update" when it differs. Two inputs, because a report is a function of
                         # both. The declarations: dist/**/*.ts (.d.ts and UI's .d.vue.ts) and never the
                         # compiled .js, which changes when a function body does, each hashed through
                         # `apiSurfaceOf`, which drops doc prose and keeps TSDoc tags and whether a
                         # comment is there at all — measured, those are what a report carries, so prose
                         # is the other thing that cannot make one stale. And the set of published
                         # entries, because there is one report per entry: adding an export adds a
                         # report while no declaration moves. Then the producer — the API Extractor
                         # version and the tsconfig it is pointed at — either of which moves a report
                         # on its own. And a stamp-format version, so changing what a stamp *means*
                         # (apiSurfaceOf, the rows) invalidates every one.
                         # The key is still a list, and a list of someone else's inputs is a guess:
                         # the entry set was missing until 2026-09-25, when adding `./packs` to a map
                         # passed this check and the whole chain and was refused by api:check. So
                         # api:reports now checks the proxy against itself — if a report moves while
                         # this said it was current, it fails naming both causes, a missing input or a
                         # hand-edited report. That is what catches the input nobody listed, and it is
                         # why api:check stays the authority rather than this

# Built-in pack facade types (after `abuddy build`; from packages/default-setup or with -w @app/default-setup)
npm run facade:check     # CI: fails if dist/types/pack-types.d.ts changed without updating etc/pack-types.api.md
npm run facade:update    # Dev: regenerate etc/pack-types.api.md

# Manifest JSON schema (-w @abuddy/sdk)
npm run schema:update    # Regenerate packages/abuddy-sdk/abuddy.schema.json from manifest-schema.ts
npm run schema:check     # Fails if abuddy.schema.json is stale

# Seed goldens (-w @app/default-setup)
npm run seed-parity:check   # Compare seeded rows against tests/seeds/__golden__
npm run seed-parity:update  # Re-record them; deliberate, see "What to run after a change"

# Lint (root runs every workspace that has one; oxlint, plus eslint in the renderer)
npm run lint:check       # Reports; run by npm run typecheck, so it is in the chain. Both workspaces
                         # are at zero, and the few justified exceptions are inline disables that say
                         # why (an OSC parser matches control characters; a triple-slash reference keeps
                         # an ambient declaration global; a spread copies an array the loop shortens)
npm run lint:fix         # Rewrites what it can — oxlint has no fixer for no-unused-vars, so it will
                         # not clear those for you

npm run packages:build   # Build dist/ for @abuddy/ears, @abuddy/sdk and @abuddy/ui, bundle @abuddy/cli and @abuddy/testing
npm run packages:check   # publint + arethetypeswrong on the packed packages (after packages:build)
```

### E2E visual testing

Playwright tests launch the full Electron app and interact via `window.applicationState` (the XState actor). Use to visually verify UI changes.

```bash
npm test                              # Run all E2E tests
npm test -- smoke                    # Run just smoke tests
npm test -- tests/e2e/scratch        # Run ad-hoc scratch test (gitignored)
DEBUG_E2E=1 npm test                  # With Electron stdout/stderr logging
npm run test:headed                   # Show the app's windows, to watch a test drive it. Under Playwright
                                      # they are never shown or focused (PLAYWRIGHT_VISIBLE, the guard in
                                      # packages/main WindowManager, the splash and the protocol handler)
npm run test:explorer                 # Playwright's UI mode: its test explorer, with a timeline and DOM
                                      # snapshots. Playwright's own window, not the app's — the two are
                                      # orthogonal, and `--debug` is a third thing (the Inspector)
```

Screenshots save to `tests/screenshots/` (gitignored). The `app` fixture provides `navigate(pluginId)`, `screenshot(name)`, `sendEvent(event)`, `getState()`, `getContext()`, `waitForState(check)`, and `waitForPlugin(pluginId)`.

The fixture source is `@abuddy/testing` (`packages/abuddy-testing/src/index.ts`), re-exported by `tests/e2e/fixtures/app.ts`. It launches Electron, finds the main window via `window.applicationState`, bypasses onboarding, and provides the `AppHelper` API. External packs share the same fixture — `abuddy init-tests` scaffolds tests in a pack repo, then `abuddy test` runs them in a local checkout (`--app-root`) or a downloaded AgentBuddy Beta (`--app beta`). Set `PACK_DIR=/path/to/pack` to sync/build a pack and wait for its plugins.

For full fixture lifecycle, API reference, and ad-hoc testing pattern, see `tests/e2e/CLAUDE.md`. For external pack testing details, see `packages/abuddy-testing/CLAUDE.md`.

## Architecture

### Event-driven actor system

Every backend **system** and frontend **plugin** is an XState state machine. They communicate via a central event bus:

- **Backend → Frontend**: `broadcastToPlugin(name, event)`, in a system's actions or anywhere else; actions use `services.emitter.broadcastToPlugin`. It goes over the bus, so it reaches **every** window showing that plugin — a plugin runs once per window. The renderer's `sendToPlugin(name, event)` is the other half: straight to this window's actor
- **Frontend or backend → System**: `sendToSystem(systemId, event)`, typed with the events each system declares (own systems by feature id, a dependency's as `<dependency>/<feature>`; actions name every system `<pack>/<feature>`)
- **System → System**: `sendToSystem(name, event)`, the same typed send a plugin uses; no pack code looks up another system's actor. `sendToSystem({ role }, event)` reaches whichever system plays a role (`{ role: 'brain' }` with `TRIGGER_BRAIN_EVENT` fires a flow event), and `host/bus` takes `PACK_CHANGED` (`HostSystemEvents`)
- **Child actors are private**: a feature spawns its children with an `id` and no `systemId`, and reaches them through its own snapshot's `children`; another feature sends the feature an event, which it routes to the child (the code plugin routes `<child>.*` events by prefix)
- **Frontend**: a component reaches its own plugin with `usePlugin()` (`@abuddy/sdk/fe`); the host renders each plugin's canvas, panel and chat in a `PluginScope` for it, and the app's Settings view renders each plugin's settings form in one. No pack code looks up another plugin's actor, and no feature imports another's frontend at all (`check:specifiers`, `findCrossFeatureImports`): what a feature offers the rest is its plugin's `Contract` — the state it publishes, read with the `usePluginState`/`readPluginState` its `#generated/fe` generates, and the inbox others may send, which types the sends. `openPlugin` (`#generated/fe`) takes only the names the pack can write (`PluginName`: its own features, its dependencies' `<pack>/<feature>`), so a misspelled target doesn't compile; a target that arrives as data (a link block's) opens through `untypedOpenPlugin(ref, event?)` (`@abuddy/sdk/fe`), which refuses a string that isn't a ref and asks the shell to open the rest: the shell waits for a plugin whose pack's frontend is still loading, and tells the user about a ref no pack provides once loading has settled
- Pack code takes `broadcastToPlugin`/`sendToPlugin`/`sendToSystem` from `#generated/events`; `onConnected`/`onIncoming` come from `@abuddy/sdk/events`. `check:specifiers` rejects the host's raw event paths (its root event bus and API client) and the untyped sends in pack sources
- **Addressing is an envelope**: a send is a message, `{ to, event, from?, via? }`, and `event` arrives exactly as the sender wrote it, so an event may carry any field, `pluginId` or `systemId` included. `from` is the id of the pack that sent it, stamped by the sends `#generated/events` builds; `via` is what within that pack made the send when the pack alone doesn't say — `action:<label>` for an action, stamped by the emitter `createActionEmitter` builds per run, the same string that names the action's logger. `from` keeps one meaning, the pack, so nothing parsing it as a `<packId>/<featureId>` ref gets a wrong answer; `via` names a source, of which an action is one — `reportError`'s sends carry the source they were given and no `from`, having no pack to name. Between them every send carries a pack, a source, or both, except `services.emitter` reached outside an action, where neither is in scope. Nothing routes or refuses on either: every diagnostic that reports an undeliverable message names them — the bus's drops, `receiveClientEvent`'s errors, the shell's toast for an in-window send that reaches no plugin (however long it waited for its pack), and the shell's warning for a backend send that does. All of them go through one `senderSuffix` (`@abuddy/sdk/events`), so they word it the same. The API's `bus.send` schema names `from` and `via` so a client's send keeps them; every other field a client invents is still dropped there, so a field added to the envelope and not to that schema arrives as `undefined`. The bus, the API's `bus.send` and its subscription, and the renderer route on `to`; messages sent in go to systems, messages sent out to plugins.

A system's contract declares its `context` and its `incoming`, `internal` and `outgoing` event unions as one type, which `defineSystem<Contract>()` takes and `abuddy.json` names. System code lives in `packages/default-setup/src/features/<name>/be/system.ts`, its contract in `be/contract.ts` beside it; its identity is its feature's, from `abuddy.json`, which codegen passes to `packSystem`; a feature's designation comes only from `abuddy.json` `features[].designation`, and is a role rather than a name: it need not equal the feature id. The bus machine is `createBusMachine` in `packages/abuddy-host/src/bus`; `createAppBus(registry)` there composes it with the app's root event bus (the api's tRPC event sources), and `packages/api/src/runtime/index.ts` starts it. Systems register through the app's registry (`createPackRegistry()` in `packages/abuddy-host/src/packs/registry.ts`, its `registerPack()`). Every pack's systems and plugins run under `<packId>/<featureId>`, built-in packs included — the app itself is the pack `host` (`host/bus`, `host/application`, `host/packs`, `host/settings`), so there is no namespace of bare ids and a pack can't take the id `host`. Pack code names features — its own by id, every other (the host's too) as `<packId>/<featureId>`; the ref it runs under is spelled the same, so a bare name is only short for the pack's own: the sends (`broadcastToPlugin`/`sendToPlugin`/`sendToSystem`) and `openPlugin`, generated in `#generated/events` and `#generated/fe`, resolve the name (`resolveName`, `@abuddy/sdk/ids`, is the one rule; `splitRef` takes a ref apart). The registries resolve what registrations name: a pack registers its `features` keyed by feature id on both sides (`PackRegistration.features`: each one's system, plugin, role, services and settings; `PackFERegistration.plugins`), each registry runs every feature at its ref, and both refuse a key that isn't a feature id (`FEATURE_ID_PATTERN`, `@abuddy/sdk/ids`).

**One name per concern, `untyped` for the unchecked half.** A pack reaches most of the SDK through its generated
facades, which check the name and the payload against what the pack and its dependencies declare. Every such helper
has an untyped twin for a target that arrives as data or for host code, which has no pack to be typed against, and
the twin is the typed name with `untyped` in front: `qx`/`untypedQx` and `tx`/`untypedTx` (`@abuddy/ears`),
`usePluginState`/`useUntypedPluginState`, `readPluginState`/`readUntypedPluginState`, `openPlugin`/`untypedOpenPlugin`
(`@abuddy/sdk/fe`), `broadcastToPlugin`/`untypedBroadcastToPlugin` and `sendToSystem`/`untypedSendToSystem`
(`@abuddy/sdk/events`). The point is that a call site says whether the compiler checked it without anyone reading
the imports, so a new escape hatch takes the prefix rather than a new verb or the same name in another module.

The `_` prefix is a different axis and doesn't combine with it: `_sendToLocalPlugin` and `_rootEvents` are
host-only, which `check:specifiers` enforces by the underscore, and packs may not import them at all — where an
`untyped*` helper is something a pack may use and simply isn't checked on.

### SDK packages

`@abuddy/sdk` is the pack-facing API; host-only modules live in the private `@abuddy/host` (`packages/abuddy-host`). Packs, built-in or external, import only `@abuddy/sdk`, `@abuddy/ears` and `@abuddy/ui`; host code (api, renderer, CLI and testing) also uses `@abuddy/host`; default-setup, tests included, does not depend on it. `npm run check:specifiers` rejects `@abuddy/host` in pack sources and CLI templates, and `abuddy build` fails a pack bundle that imports it. Pack code reads relations with `findRelations`/`getRelationStats` and queries untyped with `untypedQx` (`@abuddy/ears`), reaches host-implemented data operations through `services.appData` (reset, backup export/import, whether the user finished onboarding), `services.traceStore` (the volatile trace store), `services.secrets` (the user's API keys as metadata: list, select, rename, delete; never values) and `services.filesystem` (files and folders on disk, as text), and calls models through `services.inference` (AI SDK 7's `generateText`/`streamText`, `createAgent`, `embed`/`embedMany`, `generateImage`, `generateSpeech`, `transcribe` and `rerank`, with `provider:model` ids checked against `providerCapabilities`, `output` as an `Output` or plain data like `{ type: 'object', schema }`, and the key the user selected per provider, never the environment; packs import pure pieces like `tool` from `ai`).

Layers, each importing only the ones above it (`check:specifiers`, `findUpwardImports`, and each `package.json`'s `@abuddy` dependencies):

| Layer | Holds |
|---|---|
| `@abuddy/ears` | the engine, the EARS types, the persistence port (`/lmdb`: the LMDB store) |
| `@abuddy/sdk` | the pack contract and pack runtime: registries of what packs registered, the services' contracts, event sends, logging and error reports over the bound bus, the SDK entities and their repositories, the `HostRuntime` port |
| `@abuddy/host` | the app runtime, and the app's own features: `features/` is the pack `host` (`application`, `packs` and `settings`, each `{be,fe}` as any pack's are), and beside it what every pack runs on — the six app services (`/services`), app state (`/app-state`), `/packs` and `/packs/runtime`, `/bus`, `/migrations`, `/secrets`, the frontend's plumbing (`/fe`) and its database opened outside it (`/database`) |
| `packages/api` | transport (`node:http`, `ws`, the tRPC routers, the log stream), process boot and composition (`runtime/index.ts`); `src/` is one folder per job — `boot/`, `runtime/`, `transport/`, `adapters/` — which `packages/renderer/src` mirrors with `views/` added |
| `packages/renderer` | the frontend composition: binds the frontend port, and composes the host's shell with the window's I/O (the API client, the pack loader, storage, the toast and error page); `src/` is the API's four job folders plus `views/` |

What crosses to the app follows one rule, **bind resources, derive behaviour**. A resource has identity per running app (the event bus, the engine and its data, the registered packs, services doing I/O on user data or keys) and is a `HostRuntime` member; behaviour over a resource is SDK code, written once for the app, tests and tooling. So event sends, logging and error reports are SDK code over the bound bus, not host implementations. `services` holds nine host services (`HostServices`, reserved names in host's `packs/registry.ts`): the SDK implements `logger` and `emitter` over the bound bus and `repository` from the bound engine, and the app implements six, `appData`, `traceStore`, `inference`, `secrets`, `filesystem` and `settings`: contract types in `@abuddy/sdk/services/<name>.ts`, implementation in `@abuddy/host/services/<name>.ts`, test doubles in `@abuddy/sdk/testing`'s in-memory runtime (`fakeInference`, `addTestSecret`). Host-only modules (`/app-state`, `/migrations`, `/packs/runtime`, `/bus`, `/secrets`) aren't reachable from the SDK.

- `@abuddy/ears` (`packages/abuddy-ears`, see its CLAUDE.md) — the EARS engine, published like the SDK and imported by no other `@abuddy` package: `untypedTx`, `defineEars`, `grantRole`, `repository`/`registerRepository`, the core `EARS` namespace (`Entity = { Relation }`), `BaseEntity`/`EntityShapes`/`ShapeOf`/`EntityNameArg`, etc. The engine is an instance: `createEarsEngine({ persistence?, isEntityType })` returns a new, empty engine that owns its stores, indexes and caches (no `@abuddy/ears` module keeps data at module scope, `tests/no-module-state.spec.ts`), with two faces: `query` (`qx`, `tx`, the finders, relation reads, graph walks, the repository registry) and `admin` (`clear`, `bulkLoadAttr`, direct attribute and relation writes, `edgeStore`, the relation index, the entity-type checker), which only its creator holds. The free functions (`untypedQx`, `untypedTx`, `repository`, the `defineEars` facades…) act on the engine installed with `installEngine(query)` and throw, naming the fix, when none is: `bindHost` installs the app's (`HostRuntime.ears`), `startTestRuntime` a test engine (`resetTestData` replaces it, keeping repositories), and tooling installs or passes its own (`exportFlowsToDSL(dir, { engine })`). A pack's repositories arrive in its registration (`PackRegistration.repositories`), and the host registry's `registerPack` registers them with the installed engine. It's a shared-instance package with the SDK: `SHARED_INSTANCE_PACKAGES` in `@abuddy/host/build/shared-deps` is the one list the bundler externals, the pack loader's bridge (generated `packs/runtime/sdk-modules.ts`, `npm run sdk-modules:update -w @abuddy/host`), the harness bridge and `bundle-package` derive from; `check:specifiers` rejects those consumers naming the packages themselves, and upward imports (`@abuddy/ears` imports no `@abuddy/*`, `@abuddy/sdk` only `@abuddy/ears`, `@abuddy/host` only those two and never the API).
- What the SDK adds to the engine: its `EARS` (the engine's types plus `SDK_ENTITIES`/`SDK_REL_KINDS`) and the SDK entity shapes, from `@abuddy/sdk/types` (and the root), and the SDK entities' repositories from `@abuddy/sdk/repositories` (`flowRepository`, `tnodeRepository`, `actionRepository`, `promptRepository`; default-setup's flows, actions and prompts repositories build their views over them). Packs get typed `qx`/`tx`/`find*`/`createEntityWithDefaults`/`updateEntity`/`getAttr` from `#generated/ears` (a literal entity name must be one the pack or its dependencies declare, its `EntityName`; a name typed `string` passes unchecked; ids from typed queries carry their entity type, a plain `EARS.EntityId` is accepted anywhere; `tx` checks declared fields' values when it knows the entity; the SDK owns Relation and the flow model (Flow, Node, TNode, Action, Prompt), defined in `abuddy-sdk/src/types/sdk-entities.ts`, and no pack declares them; the host declares `AppState` and `Settings`, which packs reach only through `services.settings`), `repository` (typed with the repositories declared in `abuddy.json` `features[].repositories`) from `#generated/repository`, and `broadcastToPlugin`/`sendToPlugin` (keyed by receiving plugin: its own feature's system's outgoing events, plus the inbox that plugin's `Contract` declares, which `abuddy.json` names at `features[].plugin.contract`) and `sendToSystem` (keyed by receiving system; a pack without systems sends to its dependencies') from `#generated/events`. A system's events come from the contract `abuddy.json` names at `features[].system.contract` — a declared type in a leaf module (`be/contract.ts`), read without resolving the machine — so how its entry is declared can't change them; the generated pack entry asserts that `defineSystem<Contract>()` names that same contract. `abuddy build` bundles a pack's facade types into `dist/types/pack-types.d.ts` (and its snapshot), so dependents' facades include them. `check:specifiers` rejects raw `broadcastToPlugin`/`sendToPlugin`/`sendToSystem` imports and `registerRepository` from `@abuddy/ears` in pack sources.
- `@abuddy/ears` also holds the persistence port (`PersistenceSink`, `Partition`/`PartitionPolicy`/`makePolicy`, `makeShardedPersistence`). `@abuddy/ears/lmdb` is the LMDB store: `openLmdbStore({ paths, policy })` returns the store (`sink`, `envs`, `hydrate`, `query`, `close`, `reopen`, `reset`); nothing opens on import. `lmdb` is an optional peer of `@abuddy/ears` that the app installs (`packages/api` keeps it as a dependency for the packaged app). Only `/lmdb` imports `lmdb`: the api's composition (`openAppStore()` in `runtime/index.ts`) opens the store with the app registry's `partitionPolicy` (and `engine: () => engine.admin`, which the store hydrates into and reads relation details from), creates the engine with `store.sink` as its persistence, and binds `createHostRuntime({ store, engine, packs, … })`; host code (`@abuddy/host/services`, `/backup`) takes the store, and the engine's `admin` face, as arguments; packs, pack tests and the pack bridges never load it (`APP_ONLY_EXPORTS`); `check:specifiers` (`findLmdbImports`) enforces it. No code reaches engine state except through an engine's `admin`, which the package's exports enforce: an admin write is a member of an engine's admin face and no entry exports one, so `import { edgeStore } from '@abuddy/ears'` doesn't compile.
- `@abuddy/sdk/events` — messaging: `sendToPlugin`, `sendToSystem` (a system by ref, or `{ role }`), `onConnected`, `onIncoming`, `defineEvents` and the event map types (`HostPluginEvents`, `HostSystemEvents`). Frontend-safe; shared with pack frontends as the `sdkEvents` global. It sends over the bound app's bus (`HostRuntime.transport`), or in the renderer over the frontend port's `client`. `broadcastToPlugin` (and `services.emitter.broadcastToPlugin`) goes through the bus actor, so it's dropped until a client connects, and reaches every window; the renderer's `sendToPlugin` goes straight to this window's actor.
- `@abuddy/sdk/logger` — `createLogger(source, { debug? })` (debug gated per source by `setDebugEnabled`), `reportError` (a system error, sent to the app as `SYSTEM_ERROR`, or with `step` a flow step's error recorded on its TNode) and `onLog`. SDK code over the bound bus: a logger emits redacted log events there (the api prints each once), and with no app bound (the CLI, tooling) writes to the console. Backend pack code doesn't call `console.*` (`check:specifiers`).
- `@abuddy/sdk/templates` — `executeTemplate`, `createTemplateResolver`. `@abuddy/sdk/env` — `resolveAppContext`, `getAppVersion`. `@abuddy/sdk/runtime` — the one port to the app: `HostRuntime` (`transport.rootEvents`, `ears`, `packs`, `appVersion`, `services`: `appData`, `traceStore`, `inference`, `secrets`, `filesystem`, `settings`, and the optional `redaction`, which tells log redaction which runs of characters are key values this process used — absent in a runtime with no secrets of its own), bound once per process with `bindHost` (the api binds `createHostRuntime(...)`, `startTestRuntime` an in-memory one), and the renderer's `bindFeHost({ application, secrets, client, packs })`; an unbound use throws naming them. The registered packs are an instance too: the program that assembles an app creates one (the api's composition root `createPackRegistry()`, the renderer `createFePackRegistry()`, the harness one per test file, the CLI one per build) and binds its read face (`PackRegistryView`, `FePackRegistryView`); the SDK's registries of what packs registered (designations, steps, artifacts, blocks, seed hooks, seeders, feature settings defaults, commands, pack services, and in the renderer tiptap plugins and DSL types) read the bound one, and no SDK or host module keeps them at module scope. Everything a pack contributes arrives in its `PackRegistration`/`PackFERegistration` (seeders and DSL types included); there's no registry for pack code to write to. Contexts without an app (SDK specs, a pack test filling a registry directly) use `testPacks` from `@abuddy/sdk/testing`. Also the `@internal` `_rootEvents` (the bound bus). `secretsClient` (`@abuddy/sdk/fe`) reads the frontend port's `secrets`; no general API client reaches the SDK.
- `@abuddy/sdk/fe` — pack-facing: `Plugin`, `PackFERegistration`, `safeEvents`, `usePlugin`/`PluginScope` (`fe/actor-system.ts`), `useUntypedPluginState`/`readUntypedPluginState` and `pluginIsRunning` (`fe/plugin-state.ts`: another plugin's state by ref, untyped — the escape hatch beside the typed readers `#generated/fe` generates from each plugin's contract, as `untypedQx` is beside `qx`. They hand back a value and never the actor, and `TSelected | undefined`, since a ref is a name and nothing about a name says the plugin is running; the reactive one follows the plugin arriving and reloading, not only changing), `useShell` (`fe/shell.ts`: the app shell's state and commands, typed by `HostShell`; no pack code holds the shell's actor), `untypedOpenPlugin` (`fe/navigation.ts`), `secretsClient`, the settings composables (`fe/settings.ts`: `useSettingsSection`, `useFeatureSettings`, `useSettingsSave` follow the settings until the calling scope is disposed, so they run in a component's setup and never inside a `computed`; `updateSettings` changes one from outside a scope, such as a machine's action). A change names a section by its own name or a feature by its ref, and the whole path is inside it, etc.
- `@abuddy/host/fe` — host-only: `createFePackRegistry()`, the renderer's registered pack frontends (`registerPackFE`, `getRegisteredPlugins`, app extensions); `createShellMachine`, the app shell over the I/O it's given (`ShellClient`, pack frontends, storage, notify, the event target), which the renderer composes with the window's and a test with fakes; and the `host/packs` feature's frontend (`fe/packs/`), beside the system that answers it — the Packs plugin's machine, pack-frontend loading over `PackFrontendIO` (the window's `import()` and stylesheets), the install a deep link asks for, and `runFrontendMigrations`, the window-storage counterpart of the app's migrations. It re-exports the `host/settings` feature's frontend too (`features/settings/fe/machine.ts`: `createSettingsMachine(io)`, over the restart and report the renderer gives it). `src/fe/index.ts` is where all three features' frontends are named — the package's export surface, which is why naming them there isn't the cross-feature import `check:specifiers` refuses; a port both the shell and the packs feature need (`ShellPackFrontends`) lives at the seam in `src/fe/` rather than in either.
- `@abuddy/host/settings` — the app's settings as a program composing the app needs them: `createSettingsStore({ defaults })` (the one row and its one writer, which checks each next document), `createSettingsService(store)` (what packs reach as `services.settings`), and `document.ts`'s pure operations. The host knows one section, `plugins`, keyed by feature ref; every other section is a pack's contribution (`PackRegistration.settingsSections`, `abuddy.json` `settingsSections`) and opaque to it. The system that answers the Settings view and the machine behind it live in `features/settings/{be,fe}`; the Vue is the renderer's (`packages/renderer/src/views/settings/`).
- `@abuddy/host/packs`, `/packs/runtime`, `/packs/dev-server`, `/backup`, `/build/discover`, `/build/shared-deps`, `/build/source-resolution` — pack registration (`createPackRegistry()`: the registered packs as an instance, with their partition policy and shutdown hooks), discovery, registry, installer, updater, pack layout and module bridge (the CLI imports this barrel, which never imports `/packs/runtime`); the pack runtime the app runs, on the registry it's given (loader, SDK bridge, lifecycle, reload, seeding, the host `packs` system); the `abuddy dev` server marker the `pack://` handler proxies to; backups of the LMDB store; build-time pack discovery and host-shared dependency lists; the `@abuddy/source` condition helpers and the check that a process resolves workspace source, not `dist`.
- `@abuddy/host/process-liveness` — what a running process left on disk and whether it is still there: `lockIsHeld`, `recordIsStale`, and `readApiEndpoint` for the port file a running API publishes. The app's own plumbing, so packs never reach it.
- `@abuddy/host/bus` — `createBusMachine`, the backend bus (spawns registered systems, routes events, pack activate/teardown/reload), `createAppBus()`, the app's composition of it, and `receiveClientEvent()`, the check, log and send behind the API's `bus.send`. It never imports the pack loader; the pack test harness runs the same machine.
- `@abuddy/host/migrations` — the app's migrations runners (`runAppMigrations`, `runPackMigrations`; see Migrations below). Host-only, never bridged to packs.
- `@abuddy/host/services` — the host's implementations of the services packs reach through `services` (`app-data.ts`, `trace-store.ts`, `inference.ts`, `secrets.ts`, `filesystem.ts`, `settings.ts`, each named after its contract and delegate in `@abuddy/sdk/services`). `createHostRuntime({ store, engine, transport, appVersion, packs })` (`services/index.ts`) is the only place the app's `HostRuntime` is assembled, over the LMDB store (`appData` and `traceStore` use it); the API's composition binds it. `appData.reset()` resets the whole app: stores and keys, each pack's `onInit` and boot seed, then the host's `runAppMigrations(registry)`. `src/services` holds only those six services and the index (`tests/boundaries.spec.ts`). A service's implementation never lives in the API, which keeps only transport, process boot and composition (`packages/api/tests/source-layout.spec.ts` lists its files); the API's tRPC procedures delegate to host (`receiveClientEvent`, `secretsStore`/`secretsSnapshot`, `getLoadedPackEntries`).
- `@abuddy/host/app-state` — host-only: the app's own state, one `AppState` row (`hasOnboarded`, `version`, `packVersions`, `packSeedHashes`, `seedHashes`, `seedStatFingerprints`) that only host code reads and writes (`appState`); the host registers the entity type next to the SDK's, with `Settings` (`HOST_ENTITY_TYPES`), and no pack may declare either. Packs learn whether the user onboarded through `services.appData.hasOnboarded()`/`completeOnboarding()`, the renderer through the application plugin's `CLIENT_CONNECTED`. Resetting settings doesn't touch it; `appData.reset()` empties it with the rest.
- `@abuddy/host/secrets` — host-only, never bridged to packs: the store of the user's API keys (metadata plain, values AES-256-GCM encrypted in `secrets.json`, the data key in a `KeyVault`: the OS credential store via `@napi-rs/keyring`, or a file in the test environment or after the user allows unprotected storage). Values reach it only through the API's `secrets.*` tRPC procedures, off the event bus (`forwardSecretsChanges()` tells every system that declares it takes `SECRETS_CHANGED` that keys changed, never their values); inference reads them with `secretsStore.keyFor(provider)`. The API logger and error reports redact key-shaped strings.
- `@abuddy/ui` (`packages/abuddy-ui`) — Vue components, editors and UI composables (`@abuddy/ui/design/button`, `@abuddy/ui/components/tiptap/TiptapEditor`, `@abuddy/ui/composables/useDebounce`). Published as compiled JS (tsdown, with vue-tsc declarations). Packs use the host's copy at runtime: the renderer exposes every export on `window.__abuddy` and the pack FE bundler proxies `@abuddy/ui` imports, unless `abuddy.json` sets `fe.bundleUi`. Contracts and host-shared state (`useShell`, menu state, the tiptap plugin and DSL type lookups) stay in `@abuddy/sdk/fe`; `@abuddy/sdk` must not import `@abuddy/ui`.
- `@abuddy/sdk/utils` — **Node-only**: re-exports everything (pure + Node-dependent). Backend code imports from here.
- `@abuddy/sdk/utils/pure` — **environment-agnostic**: pure utilities only (`compareVersions`, `detectChanges`, `BinaryOperator`, `toMap`, `randomId`, etc.). Frontend/renderer code must import from this path (or a specific sub-path like `@abuddy/sdk/utils/compare-versions`), never from `@abuddy/sdk/utils`.

The freshness rule itself lives in `@abuddy/host/build/packages-built`, and everything that needs it imports it by that name: a relative import of a repo-root script would put the repo root into `@abuddy/testing`'s declaration emit and move every declaration its bundle publishes. `scripts/ensure-packages-built.ts` is only the command over it. The packages' build scripts live in the repo's `scripts/` for the same reason — `build-package.ts` (`@abuddy/ears` and `@abuddy/sdk`, which build alike) and `build-ui-package.ts` — so that no package's own `scripts/` imports a package above its layer, and the layer rule holds as written rather than through a re-export. `check:specifiers` (`findPackageScriptImports`) holds the other half: a package's own `scripts/` imports that package's `src/` and its declared dependencies and nothing else, because a module under the repo's `scripts/` belongs to no package — so `npm run spec` cannot route a change to it back to a spec that covers it, and a package reaching in there is a spec that will one day not run, reported green.

Relative imports in `@abuddy/ears`, `@abuddy/sdk`, `@abuddy/host`, `@abuddy/ui` and `@abuddy/testing` name the `.ts` source (`./query.ts`); tsc (`rewriteRelativeImportExtensions`) and tsdown write `.js` into the output. `npm run check:specifiers` (part of `npm run typecheck`) rejects relative `.js` specifiers there. Workspace tsconfigs that compile this source need `allowImportingTsExtensions`. Generated pack code (`generate-entries`) keeps `.js`.

When adding new utils, put pure functions in the appropriate file under `utils/` and re-export from `pure.ts`. Node-dependent code stays in the existing Node modules and is re-exported only from `index.ts`.

`@abuddy/ears`, `@abuddy/sdk` and `@abuddy/ui` publish their workspace `package.json`. Each export resolves source under the `@abuddy/source` condition and `dist/` otherwise. **Two of the three maps are written, one is derived**, which is why only one has a staleness check: `@abuddy/ears` (3 entries) and `@abuddy/sdk` (31) list their exports by hand, so the map *is* the definition of public — a module nobody listed is private, and the first import of one fails at resolution with `ERR_PACKAGE_PATH_NOT_EXPORTED`, while `build-package`'s `assertExportTargetsBuilt` catches the other direction, an entry pointing at something that wasn't built. `@abuddy/ui` (69) computes its map from `src/` instead, since a component is public unless it is a spec or under `internal/`; that gives two things that can disagree, so `exports:check` compares them and `exports:update` rewrites the map. Adding a public module to `ui` means regenerating; adding one to `ears` or `sdk` means listing it. **A host config declares that condition outright; a pack's config declares none.** The host configs name it — tsconfig `customConditions`, Vite/Vitest `resolve.conditions`, esbuild/tsup `conditions`, `node --conditions` (the CLI bin's resolve hooks in source mode, the API process the app spawns from source) — and nothing infers it from an install. `npm run check:specifiers` fails a host config that omits it and a pack config that declares it. Two tables in `scripts/check-import-specifiers.ts` record the configs that do the opposite on purpose, each with its reason, and report an entry that has stopped applying: `RESOLVES_DIST_BY_DESIGN` (host configs resolving `dist`, such as the API Extractor tsconfigs) and `DECLARES_SOURCE_BY_DESIGN` (pack configs declaring the condition). The second is empty and meant to stay much the smaller of the two: it is for a host-side config that physically sits in a pack's tree, which is usually better moved out, and never for making a pack's own build work — that pack would then build unlike every pack author's, which is the failure the rule exists to prevent. Its doc comment has the full rule.

A pack — built-in (`packages/default-setup`), fixture (`tests/fixtures/*`) or external — is built and tested by `abuddy build` and `abuddy test`, which resolve the `@abuddy` packages' published `dist`: the one layout a pack author ever has. The app's own builds are host builds and compile that same pack's sources with the condition (`renderer/vite.config.ts`, `api/tsup.config.ts`), so in a checkout that `dist` has to exist and match the source beside it: `npm run packages:ensure` (`scripts/ensure-packages-built.ts` over `@abuddy/host/build/packages-built`) rebuilds it when `@abuddy/ears`, `@abuddy/sdk`, `@abuddy/ui`, `@abuddy/testing` or `@abuddy/cli` is stale, and `npm run typecheck`, `npm test`, `npm run build`, `npm run compile`, `npm run typecheck:pack` and `npm run test:external-pack` all run it first, as `abuddy test` and `abuddy dev` do for a pack linked to a checkout. `@abuddy/testing` resolves its built bundle whoever loads it, the repo's own E2E included, so the fixture a pack runs is the one this repo runs. While `npm start` is running, the renderer and the API follow your `@abuddy` source edits live (both declare the condition), but everything `abuddy build` produced for the built-in pack — its compiled seeds, facade types, step build and seed runtime — was made against `dist` as it stood when the command ran, and default-setup's own tsconfig declares no condition, so your editor type-checks it against that `dist` until something rebuilds it. `packages/abuddy-testing/CLAUDE.md` lists every entry point that does. Node commands that load workspace source run through `node scripts/with-source.mjs <command>`, which appends the condition to `NODE_OPTIONS` (`npm test`, the api's `db:*` scripts); run Playwright through `npm test -- <args>`, which carries the condition. The CLI and the API's dev boot fail when they would resolve a checkout's `dist` instead of its source. `npm run packages:build` writes `dist/`; `npm run exports:update -w @abuddy/ui` regenerates the UI exports map after adding or removing a module. To publish a `@abuddy/ui` component, add a `.ts` entry module next to it (`design/button.ts`: `export { default } from './button.vue'; export * from './button.vue';`) and run `exports:update`. TypeScript can't resolve an exports target that is a `.vue` file, so the entry is what consumers import. SFCs without an entry are internal: other `@abuddy/ui` files import them by relative path, and `exports:update` fails if code outside `@abuddy/ui` imports one.

When adding new EARS or FE exports, put them in the correct barrel. Tag exports only the host uses `@internal` and name them `_x`: the underscore is what makes the boundary checkable, so pack code importing one fails `check:specifiers` (and `abuddy build`, for an external pack). A pack that needs one needs it promoted to public API instead. After changing public exports, run `npm run api:update` in `packages/abuddy-sdk` (or `packages/abuddy-ears`, `packages/abuddy-ui`) and commit the updated `etc/*.api.md` reports. A UI component's props, emits, slots and exposed members are reported in `etc/<entry>.component.md`, so changing them needs `api:update` too. The pack-facing SDK exposes no `any` (`published-sdk-any.spec.ts` fails when an export does; use `unknown` or a generic); `@abuddy/ears`, `@abuddy/sdk` and `@abuddy/ui` support TypeScript 5.7 and later (`packages/typescript-floor`; `ai` 7's declarations need it).

**Typed EARS types are change-controlled.** `abuddy-ears/src/{entities,runtime,typed}.ts`, `abuddy-sdk/src/types/{entities,sdk-entities}.ts` and the generated `PackShapes`/`EntityName` are a specified contract that editor completions depend on. Don't widen or rewrap them to make a call site compile; fix the call site (explicit shape, `EntityName` constraint, `untypedQx` from `@abuddy/ears`). Read `packages/abuddy-sdk/TYPED-EARS.md` and follow its checklist, including checking completions, before any change.

### Data layer (EARS)

Custom entity-attribute-relation graph database (`@abuddy/ears`) backed by LMDB (`@abuddy/ears/lmdb`). All data lives in memory; the store persists writes and hydrates them at boot.

- `createEarsEngine()` — an engine instance (the app creates one at boot; tests and tooling create their own)
- `qx()` — query execution (synchronous, do NOT await)
- `tx()` — transaction execution (synchronous, do NOT await)
- Repository pattern: a feature's `be/repository/index.ts` exports `<name>Queries`/`<name>Commands` objects (usually from `queries.ts`/`commands.ts`), declared in `abuddy.json` `features[].repositories` as `"path#export"`; code reaches them through `repository` from `#generated/repository`
- A pack's repository can expose another package's repository methods (default-setup's `actionQueries.byId` is the SDK's `actionRepository.byId`), so its code reaches its data through `repository` alone. It takes them by reference (`byId: actionRepository.byId`), never wrapped in a function that re-declares the signature, and adds its own views beside them
- Each entity's repository lives with the package that declares it: the SDK's entities' in `@abuddy/sdk/repositories`, a pack's in its features, the host's `AppState` in `@abuddy/host/app-state`. No package reads another's repositories through a cast of the registry (`repository as unknown as` fails `check:specifiers`, `findRepositoryCasts`)

### Frontend plugin system

Each plugin registers: `id`, `label`, `icon`, `state` (XState machine), `canvas` (required), `panel` (optional). Plugins are spawned on demand by the application actor. State selectors use `useSelector` from `@xstate/vue`. Plugin code lives in `packages/default-setup/src/features/<name>/fe/`. Plugins come from `abuddy.json` `features[].plugin`: `generate-entries` writes them into `src/__generated__/pack-entry-fe.ts`, which the renderer imports through `virtual:built-in-packs` (external packs' load at runtime from `pack://<id>/runtime/fe.js`).

### Key patterns

- Every backend system must handle `CLIENT_CONNECTED` to send its plugin's startup data. The bus sends it to every system when a client connects, except systems of external packs with frontend code: those get it once the renderer has loaded the pack's frontend (`bus.packClientReady`), and again when its subscription reconnects
- The bus sends every running system `PACK_CHANGED { packId }` once a pack is activated, reloaded or torn down, or its seeds are imported; systems listing what packs register or seed send their data again
- When a feature's settings change (any way: a setting, the settings replaced or reset, a pack's defaults), the app's settings system (`host/settings`) sends its system `FEATURE_SETTINGS_UPDATED { settings, changes }` and its plugin `FEATURE_SETTINGS_UPDATED { settings }`. The SDK declares it for every system (`SystemEvents`) and plugin (`PLUGIN_EVENT_TYPES`), so no pack does, and the bus drops one to a feature running no such actor without a warning
- Use `safeEvents<ReceivableEvents>()` for typed event handling
- Use `breadcrumb()` / `breadcrumbWithParams()` for plugin navigation
- Frontend components should be "dumb" — emit events up to root components which forward to the plugin state machine

### App environment

Environment identity and data paths come from one resolver, `@abuddy/sdk/env` (`resolveAppContext()`). Don't read `NODE_ENV`, `PLAYWRIGHT_TEST` or platform paths to decide which data dir to use.

- The log directory is the one app path the resolver doesn't give you: only the Electron process can ask the platform for it. `packages/main/src/app-context.ts` resolves it once — `app.getPath('logs')`, or `<userDataDir>/logs` when the run was given its own data dir — and hands it to electron-log, to the API (`AGENTBUDDY_LOG_DIR`) and to the IPC that opens the log file, so none of them decides it for itself.
- The Electron main process infers the environment once at startup (`packages/main/src/app-context.ts`): Playwright → `test`; packaged builds → the channel stamped by `build/build.sh` (`production` | `beta`; an unstamped packaged build refuses to start); source runs → `ABUDDY_ENV` if set, else `development`. It passes `ABUDDY_ENV` and `ABUDDY_USER_DATA_DIR` to the API process.
- Anything started without them throws instead of falling back to production. Manual API boots must pass both, pointing at a copy of user data: `cd packages/api && ABUDDY_ENV=development ABUDDY_USER_DATA_DIR=<copy> NODE_ENV=development API_PORT=3099 BUILT_IN_PACKS_DIR=$PWD/.. node ../../scripts/with-source.mjs node dist/server.js`. Such an API makes up its own token and writes it to `<copy>/api-token`; send that to call it.
- The API takes calls only with a token. Electron main creates one per app run and passes it to the API (`ABUDDY_API_TOKEN`); an API started without one makes up its own; the app's windows read it through the preload (`api:token`) and send it when connecting, and in development (or when it made up its own) the API writes it to `apiTokenFile` for local tools (`abuddy dev`, default-setup's watcher), which send it in `API_TOKEN_HEADER`. That header and the address the API listens on (`API_HOST`, `127.0.0.1` only) are defined once, in `@abuddy/sdk/utils/pure`, so the renderer's client uses the same ones.
- CLI commands pass `{ env }` explicitly (`install`/`uninstall`/`list`/`open` default to production; `-d`/`-b` select dev/beta).

### Migrations

Migrations live with their pack; the host's own (the app's state) live in `packages/abuddy-host/src/migrations/app/`. default-setup's are in `packages/default-setup/src/migrations/`: each file exports a `PackMigration` (`@abuddy/sdk/framework`) with `target`, `description` and `up()`, listed in that folder's `index.ts` and registered with the pack. `@abuddy/host/migrations` (`packages/abuddy-host/src/migrations/index.ts`) holds only the runners, which the API's boot and host's `services.appData.reset()` call through `startPacks()` (after the packs' `onInit`, before the seeds), and a backup import after reloading the data:

- `runAppMigrations(registry)` — the host's own app migrations (moving the app's state, and every pack's stored plugin settings onto their plugins' refs), then the built-in packs' in the app's registry, run when `stored app version < target <= app version` (`getAppVersion()`, the bound runtime's); records `AppState.version`. A prerelease counts as its release (`0.3.15-beta.2` runs the `0.3.15` migrations, again on each new beta), and a development build (`ABUDDY_ENV=development`) runs every pending migration on every boot. A failed migration stops the rest and records nothing, and `startPacks()` then runs no pack migration or seed; the next boot retries. Data with no recorded version is new and at the app version (after the host's migrations moved any older one).
- `runPackMigrations(externalPacks)` — each external pack's migrations, against that pack's own version (`stored < target <= manifest version`); records `AppState.packVersions[packId]`. External migrations never run in `runAppMigrations()`.

Rules for default-setup migrations (details in `packages/abuddy-host/src/migrations/CLAUDE.md`):

- **Target the next release version** — name the file after the version it targets (e.g. `0.2.4.ts` runs when the app is released as 0.2.4+). Several changes for one release go in the same file.
- **Never bump `package.json` version manually** — the release process handles version bumps. Migrations are written ahead of time to target the upcoming release.
- **List it in `packages/default-setup/src/migrations/index.ts`** — import and append to the `migrations` array in version order.
- **Idempotent guards** — always check if the change is needed before applying (e.g. `if (!value) set(value)`), since migrations run again on every development boot, on each beta of their release, and after a reset.

### Path aliases

- Backend: `@/*` → `packages/api/src/*`

## Tech stack

XState v5 (state machines everywhere), tRPC v11 (typed RPC), Vercel AI SDK 7 (model calls through `services.inference`: Anthropic, OpenAI, Google, Groq, Mistral, Cohere), Zod (validation), Vue Flow (node-based editor), Monaco Editor, Tiptap (rich text), xterm.js + node-pty (terminal), LMDB (persistence), Vite (bundler), Oxlint + ESLint (linting).
