> **Written in session** `75ab9455-5ee8-4b50-8043-6d5f22284a4a` (Claude Code, 2026-10-09). Resume it with `claude -r 75ab9455-5ee8-4b50-8043-6d5f22284a4a`.

```
# Goal: dev holds the app, drive attaches to it — and the two words stop colliding

Implement docs/goals/goal-attachable-dev-session.md on master, at or after 3d5b21d45 — the base its
Background was surveyed at.
Before Phase 1, confirm the base: packages/abuddy-cli/src/app/instances.ts, src/commands/instances.ts,
src/app/app-target.ts's parseAppFlags, and packages/abuddy-testing/src/engine/{server,marker,session}.ts
all exist at HEAD. If they don't, stop and say so — the plan was surveyed somewhere else.

Read Background, Decisions, Phases and Constraints first, then the three plan docs they cite:
docs/plans/profiles-not-instances.md, one-storage-axis.md and attachable-dev-session.md. Those hold the
detail; this doc holds the order, the decisions and the stop condition. Decisions are final: implement
them, don't reopen them or stop to ask.

Where a detail isn't specified, pick the conventional option, note it in the final summary, and keep
going. No backward compatibility in code (root `CLAUDE.md`, "Backward compatibility" — a standing rule,
not this goal's choice): change signatures, move modules, migrate every in-repo caller, test, fixture,
template and doc in the same change, and fix forward. Stored user data is the exception and moves with a
migration — which here means the profiles directory (Phase 1), nothing else.

Finished when:
- Phases 1-7 are implemented and each meets its "Done when"; every new guard is mutation-checked.
- `--instance`, `--ephemeral`, `--app` and `--app-root` name nothing in the CLI; `--profile`, `--fresh`,
  `--fresh --rm` and `--build` do. No profile is named after a build.
- `abuddy dev` exists, `abuddy run` does not, and `dev` runs in a checkout with no pack.
- **If and only if Phase 6 ran** (its measurement is the condition): drive's `--serve`/`--attach` are gone
  with abuddy-testing/src/engine/{server,marker}.ts and abuddy-cli/src/app/drive-{engine,one-shot}.ts. If
  it did not, this goal is still finished, and the Outcome says so with the number that decided it.
- A live `dev` or `npm start` publishes <dataDir>/session.json; `drive` attaches to one, refuses when
  there is none and starts one with `--spawn`; `abuddy test` publishes none.
- The debug port is on in `development` only, and a spec fails if a packaged or test context gets it.
- Decision 8's lock question is settled by observation, and all three places say the same thing.
- `npm run typecheck`, `npm run spec` over each touched package, `npm run chain`, plus `npm test -- smoke`
  and a real `abuddy dev` with `drive --eval` against it.
- Every `drive` path says whose app it joined, or what it started and how to end it; `abuddy profiles`
  shows which data dirs have a live app; cli.md carries the "Which app, and how long it lives" table.
  The attach plan's "Telling the user" is the spec for all three.
- A final summary: phase -> done/deferred, evidence, and the conventional choices made.
- The three plan docs and this doc are in docs/archive/plans/ and docs/archive/goals/, each with its
  status blockquote, this doc with an Outcome section, committed.

Commit as you go: each phase when its "Done when" holds and the checks are green, conventional message,
no Co-Authored-By or session lines, `git commit -- <paths>` naming only that phase's files. Check
`git diff --cached` first — another session stages files in this checkout.

Never:
- the standing list in Constraints (git and publishing, real data dirs, broad process kills, preload,
  example pack, release metadata, typed EARS, compat shims, loosened assertions).
- enable the remote debugging port anywhere but a `development` build.
- delete the Playwright test runner or the `drive/` script path: `drive <script>` stays a Playwright run.
- rename `abuddy build`, or give it a build flag.
```

## Background (2026-10-09, at 3d5b21d45 on master)

Three commands launch the app and each owns the one it launched. `run` is a supervisor plus the pack
watch/rebuild/reload loop and a Vite dev server; `drive` launches its own app through Playwright's test
runner, because Electron allows one app per data dir and `run` already has it; `test` launches its own
hermetically. `drive --serve` exists to work around that — an HTTP server, a token, a file in
Playwright's `outputDir`, a ready-line protocol and a `/close` verb, so that one app survives between an
agent's questions.

Underneath it, one word does two jobs. `resolveAppContext` (`packages/abuddy-sdk/src/env/index.ts:107`)
derives an app's **identity** from `env` (`APP_NAMES[env]`, which decides the app name and so Electron's
own storage) and its **location** from the same value, as a default that `ABUDDY_USER_DATA_DIR`
overrides. They come apart for every instance, every drive session and every E2E worker, and the CLI
already selects them two different ways: `-d`/`-b` name a *data dir* on `db`, `install`, `list` and
`uninstall`, while `--app beta` names a *binary* on `run`, `drive` and `test`.

The three plan docs hold the detail, the measurements and the rejected alternatives:

| Plan | What it is |
|---|---|
| [`profiles-not-instances.md`](../plans/profiles-not-instances.md) | the rename, no behaviour |
| [`one-storage-axis.md`](../plans/one-storage-axis.md) | `--build` and `--profile`, two axes two words |
| [`attachable-dev-session.md`](../plans/attachable-dev-session.md) | `dev` publishes, `drive` attaches |

## Spike results (2026-10-09)

Recorded in full in [`attachable-dev-session.md`](../plans/attachable-dev-session.md) ("The spike"). The
spike code is thrown away; everything a phase needs is in that table. The row that decides the design:
**reconnect after a full disconnect, 11ms, pages still live** — a launched Playwright `Page` dies with
its window, where a CDP client re-attaches, which is why a long-lived session rots and an attachable app
does not.

Not covered by the spike, so a phase proves each: `--spawn` under contention, the idle timeout, the
environment gate, and the end-to-end cost of a one-shot.

## Decisions

Final.

1. **Three changes in this order: rename, then attach, then vocabulary.** The rename comes first, because
   it gives `--profile` its name before the attach work changes what that flag *means*. The vocabulary
   change goes **last**, which is a correction: it sat third of seven, and nothing in the attach work
   reads a build — the session file is `<dataDir>/session.json`, the reclaim is per data dir, the idle
   reap is per profile — while it is the one phase that reopens `-d`/`-b`. Third, it could block the
   goal's own content behind a flag argument; last, it blocks nothing. The cost of moving it is that the
   `development`-only debug gate is written against `resolveAppContext`'s current signature and then
   once more against the new one — **one call site, one line**, which the attach plan's Security section
   already commits to ("one call site, one gate"). Accepted.
2. **`instance` becomes `profile`** throughout — flag, command, module, directory — and `--ephemeral`
   becomes `--fresh --rm`. The profiles directory is renamed on disk, once, when the old root exists and
   the new one does not.
3. **`--build` replaces `--app` and `--app-root`, as one flag.** A value in the known-name set is a
   build, anything else is a path. "Channel" is rejected: `development` and `test` are not releases.
   `ABUDDY_APP` and `ABUDDY_ROOT` collapse the same way, into one variable holding either shape.
4. **`-d`, `-b` and `--production` stay, as `--build` shorthands** — `--build development`,
   `--build beta`, `--build production` — on every command that has them today. They keep working and
   change what they *mean*: a build rather than an environment.
5. **No profile is ever named after a build.** The four environments do not become built-in profiles;
   a build keeps its own default storage, and `--profile` is the only override.
6. **`abuddy build` keeps its name and gains no build flag.** `compile`, the only alternative, collides
   with `compilePack`, the content-compile step inside a build.
7. **The Playwright test runner stays**, and so does what it launches (Decision 15). `drive <script>`
   goes on being a Playwright run;
   `playwright-core` and `@playwright/test` are both optional peers of `@abuddy/testing`, imported
   lazily, with an install hint.
8. **What scopes Electron's single-instance lock is settled by observation, not by picking a doc.**
   `packages/main/CLAUDE.md` says the app name, `abuddy-cli/src/commands/drive.ts` says the data dir,
   and `SingleInstanceApp.ts` says "them". Determine it — two apps with the same name and different data
   dirs, then the reverse — and make all three say the same thing.
9. **No commits are squashed across phases.** A phase is separable only while it is finishing.
10. **What `--spawn` starts *is* `dev` — the same code path, watcher and all — never the Playwright
    fixture.**
    Two reasons, and the second is why "spawns it as `dev` does" was not enough. (a) `appLaunchEnv` sets
    `PLAYWRIGHT_TEST = 'true'` unconditionally (`abuddy-testing/src/launch-env.ts:16`), which
    `_inferElectronAppEnv` answers `test` to — so a fixture-launched app can never be `development`, the
    environment gate would refuse it the debug port, and it would be unattachable. Nothing the app can
    see distinguishes a `drive` app from an `abuddy test` app, so there is no second axis to gate on.
    (b) **The fixture is also the only thing that installs the pack under test.** With `PACK_DIR` set it
    builds the pack and installs it into the data dir (`abuddy-testing/src/index.ts:357`), which is
    exactly why `drive` does none of that itself (`drive.ts:477`: *"No build here: the fixture builds the
    pack itself"*). A spawn that copied dev's *environment* would hand a pack author an app without
    their pack, or with a stale copy of it. `dev` already does it — `installToApp` (`run.ts:61`, called at
    `:259`) is the pack install, and `ensureCheckoutPackages` beside it is the different job of building
    the `@abuddy` packages' `dist` that a pack compiles against — so spawning `dev` gets both for nothing.
    **No `dev --no-watch`.** A flag whose only purpose is to let one caller skip a step is the thing that
    drifts, and a watcher costs nothing while nothing is edited. It also keeps the "session file's writers
    are derived, not listed" population at the two the design already has, `dev` and `npm start`, rather
    than a third that nobody would think to look for.
    **Two things this requires of `dev`, and the first is a restructure rather than a flag.** `dev` gains a
    **launch-and-hold core**, with the whole pack loop conditional on there being a pack: today
    `findPackRoot` (`run.ts:156`) throws at a checkout root, so without this Decision 10 leaves this repo's
    own `npm run drive:eval` able to attach and unable to start one. With no pack, what is skipped is the
    build, `installToApp`, the watchers, the reload path, the Vite server and the `pack-dev-servers`
    marker — six things, not a branch — leaving the launch, the session file and the hold. **That is a new
    decision, not a reading of the attach plan's design block**, whose "the supervisor it already is"
    affirms the existing supervisor and is describing the delta from the engine (no HTTP, no engine, no
    Playwright) rather than a core with the pack work removed. The Files table is the accurate description
    of the work. Second, `--spawn` **spawns `dev` detached** (`.unref()`), because `dev` never returns and
    its own teardown closes the app it holds; the attach plan has both, with the signalling rule.
11. **`--spawn` with no profile named starts the `development` app, and `dev` reclaims one a tool
    started.** (With `--profile` it starts one there instead, and that one is reapable — Decision 12.)
    When an app *is*
    asked for, it is the developer's own data rather than a blank one, because a blank app cannot answer
    most of what `drive` is asked and because `drive --eval` should keep one meaning rather than one per
    whichever app happened to be up. (Whether an app is started at all is Decision 16's: it is not, unless
    asked.) What makes starting the development app safe is
    the reclaim: on the development dir, `dev` reads the session file and, for `startedBy: drive`,
    SIGTERMs its `supervisorPid`, waits for exit and launches, saying what it took; for `startedBy: dev` it refuses
    as today, because a person's app is not a tool's to take. Without it an agent's one-shot would hold
    the dir and the developer's `npm start` would fail, blaming itself.
12. **The idle reap keys on `startedBy: "drive"` and a dir that is not `development`** — so it takes any
    profile a spawn used, whichever its name. The development app is exempt because it is the one somebody
    may be looking at, and a reclaim is what ends it instead (Decision 11). **Stating the key this way is a
    correction**: "a profile `drive` was asked to use" and "the `drive` profile" are different rules, and
    under the narrow one a `--spawn --profile myproject` app is reaped by nothing and reclaimed by nothing —
    the reclaim is per data dir, so `dev` would have to be pointed at `myproject` — which is the
    leave-a-process-behind problem Decision 16 exists to prevent, back on a non-default path.
    So **`--profile drive` is a convention and not a reserved name**: it is what the docs suggest calling a
    scratch, it needs no refusal in `profiles new`, and it idles out exactly as any other spawned profile
    does. A name is reserved only when something enforces it, and nothing here should.
13. **Every `drive` run says which path it took** — for a one-shot that is the answer's `state` field
    (Decision 17), and for `dev` it is prose, since a person is watching. **A run that started an app also
    says the app is still running and how to stop it**, because `--spawn` leaves a detached process behind
    and nothing on `development` reaps it (Decision 12): in a pack repo that is Electron, a file watcher
    and a Vite dev server, and in a checkout with no pack it is Electron alone. Decision 16 is what keeps
    this rare — it only ever happens because someone asked. The two ways
    out are `abuddy dev`, which reclaims it, and the `supervisorPid` in the session file. **An attach says
    whose app it joined**, as the answer's
    `startedBy` field (Decision 17) rather than as a sentence — "a previous question started it" is the
    case where nobody is minding the app, so it is the one that must not be silent.
    **And because a line printed once is not documentation**, `abuddy profiles` gains a *running* column —
    `supervisorPid`, `startedBy`, uptime, debug port, with the environments' data dirs beside the profiles — over
    `profileInUse` and `recordIsStale`, which already answer liveness. The run says it and the listing
    finds it later; that pair is the remedy, and an idle reap on `development` is not, for the reason
    Decision 12 gives. The attach plan's "Telling the user" has the exact lines and the user-facing table.
14. **Onboarding is dismissed on every path, and there is no policy flag.** The readiness wait becomes one
    extracted function, `waitForAppReady(page)`, called by the fixture, by `--spawn` and by attach alike:
    a single `waitForFunction` for `running === 'connected'` that calls `window.__disableOnboardingUI()`
    from *inside* the predicate. In-poll rather than check-then-dismiss, because onboarding can arrive at
    any point during the boot — `engine/index.ts:105` already learned that for `reloadWindow`, and the
    fixture's two-step form (`index.ts:495-507`) has the race it was fixed for. The hook is defined
    unconditionally (`renderer/src/main.ts:80`), so a CDP-attached page reaches it with no env gate in
    the way. **The accepted cost**: attaching to an app whose owner is sitting in onboarding completes
    the wizard for them. It is rare, it is a wizard rather than data, and Decision 13 makes it visible
    rather than silent. **The terminal state is a parameter with a default**, not a literal in the
    predicate, which is the whole of what keeps the deferred item below a line rather than a rewrite.
15. **A question attaches; a program gets a dir.** `drive --eval` attaches, and `drive <script>` goes on
    launching its own app through the fixture, in whichever profile it was given. That is a decision and
    not a leftover: a script is a sequence of clicks and reads whose result would otherwise depend on
    whatever plugin was left open and whatever rows were half-edited, which is undeclared input. A script
    that wants the developer's *data* already has it — `--profile` hands the fixture that dir
    (`E2E_DATA_DIR`, `drive.ts:495`); what it cannot share is the *process*, costing a launch and the
    chance to watch it in the window already open. Making the fixture yield a connected page instead
    would change `electronApp`/`appPage`, the file every repo spec, both fixture packs and every external
    pack's suite imports, and would need a gate proving `abuddy test` can never take that path. Revisit
    from a measured complaint, never from the asymmetry alone.
16. **A one-shot refuses when no app is running, and `--spawn` is how you ask for one.** This replaces
    starting one on every miss and is the user's call, for the reason that settles it: the intuitive reading of
    `drive --eval` is *"ask the app"*, so with no app the answer is to say so — exit non-zero, naming
    `abuddy dev` and `--spawn` — rather than to acquire a process the question did not ask for. It is also
    what makes Decision 13's hygiene problem small: **nothing is left running that nobody asked for.**
    Spelled to match the `state: "spawned"` the answer carries, so the flag and the field are one word.
    **Two consequences of "refuses" worth stating**: a refused run must leave nothing behind, so the
    session file is read *before* a profile is resolved — `openProfile` creates-or-reuses, so the old
    order would mint an empty dir and then decline to use it; and `--fresh --spawn` is accepted as a
    no-op, since `--fresh` already implies `--spawn` and the two flags disagree about nothing.
    It does not weaken the case for deleting `--serve`: a spawned app stays, so a cold checkout costs one
    flag on the first question and an attach on every one after — `--serve`'s own bargain, with a flag in
    place of a long-lived foreground process. Everything Decisions 10-13 say about *how* an app is started
    and reclaimed still holds; only *when* has changed, from "on a miss" to "on request".
17. **A one-shot's stdout is one JSON object and nothing else**, so it pipes:
    `{"value": …, "state": "attached" | "spawned", "startedBy": "dev" | "drive", "supervisorPid": N}`.
    **No `ok` field — the exit code is the status, and there are three**: `0` with a value on stdout, `3`
    for *no app is running*, `1` for *the verb failed*. That removes `oneShotOutcome`'s trap (an
    `ok: false` inside a 200, so reading the status exited 0 on every real failure) and keeps the two
    non-zero answers apart, which matters because a miss is retryable with `--spawn` and a failed verb is
    not — the root `CLAUDE.md` rule *"a distinct exit code where 'nothing covered this' and 'everything
    passed' are different answers"*, at the code `npm run spec` already uses for it. Both non-zero paths
    put **nothing** on stdout, so a pipe never receives half an answer. `state` and `startedBy` belong in
    the data rather than in a
    sentence: the first says whether this question acquired a process, the second whose app answered — and
    `attached` + `startedBy: "drive"` is the case Decision 13 singles out, an app a previous question left
    that nobody is minding. `supervisorPid` is what ends it; prose goes to stderr, and only where something was left
    behind. **Two things count as left behind**: an app that is still running, and a *write to the user's
    data* — which is why completing onboarding (Decision 14) gets a line as surely as spawning does. An
    attach that changed nothing says nothing.

## Phases

### Phase 1 — profile replaces instance

[`profiles-not-instances.md`](../plans/profiles-not-instances.md), in full. Decisions 2 and 5.

**Done when:** `npm run spec packages/abuddy-cli` passes; no `instance` remains in a flag, a command
name, a printed string or a directory path; `--fresh --rm` removes what `--fresh` keeps; the old
profiles root is renamed once, and a second run with both present does nothing rather than merging them.
Mutation: skipping the rename leaves a profile unreachable and the spec fails.

### Phase 2 — the lock question

Decision 8, before anything depends on it. Determine what scopes the single-instance lock, and correct
whichever of the three places is wrong.

**Done when:** the observation is recorded in this doc's Outcome, and `packages/main/CLAUDE.md`,
`abuddy-cli/src/commands/drive.ts` and `SingleInstanceApp.ts` agree.

### Phase 3 — the port

[`attachable-dev-session.md`](../plans/attachable-dev-session.md), its phase 1. `appHelper(page,
resultsDir)` and `waitForAppReady(page)` extracted (Decision 14); `SessionPage` over a connected `Page`;
both paths live, neither deleted.

**Done when:** the launched and the connected session answer the same verb **identically** — the case
that proves one `SessionPage` serves both; the fixture reaches `connected` through `waitForAppReady` and
`npm test -- smoke` passes on it, which is what says the extraction kept the fixture's own behaviour;
`waitForAppReady`'s terminal state is a default-valued parameter rather than a literal, per Decision 14.
`npm run spec packages/abuddy-testing` passes.

### Phase 4 — the session file

That plan's phase 2. `dev` and `npm start` publish `<dataDir>/session.json` with the `supervisorPid` that
ends them; `drive` attaches to a live one and, **on a miss, keeps today's behaviour — it launches its own
through the fixture**; `test` publishes none. The refusal and `--spawn` are Phase 5's, deliberately: this
phase adds a fast path in front of what `drive` does today and takes nothing away, so landing it alone
leaves a cold `drive --eval` working exactly as it does now rather than regressed until Phase 5.

**Done when:** every "Done when" of that plan's phase 2; the environment gate's firing case passes (a
packaged or `test` context never gets the flag); `abuddy test` publishes no session file; **`abuddy dev`
at a checkout root publishes one**, which today throws before it can (Decision 10), while a run in a pack
repo still builds and installs that pack; the new `npm run dev` carries
`tsx scripts/drive-preflight.ts &&`, which `drive:serve` had and its replacement would otherwise lose —
a pack-less `dev` launches a built app without building it, so the stale-build nudge is the one thing
standing between that and opening yesterday's app in silence.

### Phase 5 — `--spawn`, and the answer's shape

That plan's phase 3, under Decisions 16 and 17. `--spawn` spawns `dev` (Decision 10) detached under
`holdExclusiveLock`, re-reading after acquiring, and that `dev` publishes the session file; **without the
flag a miss refuses**. A spawned app on a `drive` profile idles out; a `dev` one does not.

**Done when:** a miss **without** `--spawn` exits **3**, leaves **no profile directory behind** (the
mutation is resolving the profile before reading the session file, which is today's order and passes every
other case), writes nothing to stdout and names both
`abuddy dev` and `--spawn` — a gate over input, so the empty stdout is the half to assert, and 3 rather
than 1 is the half a caller needs (Decision 17), with a failed verb at 1 as the paired case; the answer is
`{value, state, supervisorPid}` and nothing else, with `state` reading `attached` and `spawned` in the two cases and
no `ok` field (the mutation is reintroducing one beside a non-zero exit); `dev` reclaims a
`startedBy: drive` app and refuses a `startedBy: dev` one — both halves, since that rule is what makes
`--spawn` safe (Decision 11), reclaiming unconditionally is the mutation, and the case must **spawn and
then reclaim** rather than hand-write a session file, or it passes while `startedBy` is never set to
`drive` at all; a spawned app is **attachable**, carrying a `debugPort` and answering a verb, which is the
case that fails the moment it routes through the fixture (Decision 10); **a `--spawn` in a pack repo
installs the pack**, the other half of Decision 10, which fails if it copied dev's environment rather than
spawning `dev`; two concurrent `--spawn` calls start **one** app (assert one `supervisorPid` — the lock's firing
case); onboarding is named when it was completed (Decisions 13 and 14), which a never-onboarded profile is
the case for; a spawned app on a profile **not named `drive`** idles out, a `dev` app on that same profile does not,
and a `development` one never does — three cases, since the key is two fields (Decision 12) and the
conventional name is the one value that cannot discriminate between the two readings;
`abuddy profiles` shows a running app with its `supervisorPid` and `startedBy`, and stops showing it once that app has
gone (both halves — a listing that cannot go back to empty is a stale record, not a status). Then measure
the end-to-end one-shot (`npm run measure`, per that plan's Verification) and record it in the Outcome.

### Phase 6 — the deletion

That plan's phase 4, **and only if Phase 5's measurement shows `--spawn` plus attach carries `--serve`'s load**. If
it does not, skip this phase, leave `--serve` in place, say so in the Outcome and go on to Phase 7:
phases 1-5 stand on their own, which is the property the phasing exists to give.

**Done when:** `--serve`, `--attach` and the four files are gone — the flag, not the word, which Deferred
reserves for the one choice that would still be real; the runner and `drive <script>` are
untouched (Decision 15); `npm run chain` passes; `npm test -- smoke` passes; a real `abuddy dev` answers
a `drive --eval` against it.

### Phase 7 — `--build`, one flag

[`one-storage-axis.md`](../plans/one-storage-axis.md). Decisions 3, 4, 5 and 6. **Last rather than third,
per Decision 1**: nothing in Phases 3-6 reads a build, and this is the one phase that reopens `-d`/`-b`.
It runs whether or not Phase 6 did.

**Done when:** `--build <name|path>` is the only build selector; `--app`, `--app-root`, `ABUDDY_APP` and
`ABUDDY_ROOT` name nothing; `-d`/`-b`/`--production` resolve through it; `resolveAppContext` takes a
build and an optional profile; the `development`-only debug gate is moved to the new signature with its
firing case still passing; `npm run spec packages/abuddy-cli packages/abuddy-sdk` and `npm run typecheck`
pass. Mutation: a bare value that is also a known name resolves as the name, and `./<name>` as the path.

## Deferred

Nothing here renames `abuddy build` (Decision 6) or reimplements the script runner (Decision 7). The
host-backend edit loop — no HMR, `npm run build:be` and a restart — is out of scope, and the attach plan
names it so this is not read as having addressed it.

**Driving the onboarding flow is deferred, and it is not this plan's gap.** The fixture dismisses
onboarding unconditionally and always has, so nothing can drive or test those screens: a search of
`tests/e2e/` finds no spec that does, and the one `onboarding` hit there is a `data-onboarding-id` used as
a selector for something else. Decision 14 keeps that behaviour and does not worsen it. What the real
caller wants is onboarding **left up** rather than refused — for someone working on those screens, the
onboarding screen *is* the ready state — so the shape is a terminal state on `waitForAppReady` and a
user-facing `drive` flag (and a fixture option) that selects it, never an inverted `dismissOnboarding`.
Decision 14 requires the default-valued parameter so that this stays an addition. Pick it up when someone
is actually editing onboarding.

**An attach mode for the fixture is deferred, not rejected** (Decision 15). It would let `drive <script>`
run against a live app instead of launching one, and the reason it is not here is cost and order: it
changes `electronApp`/`appPage`, needs a gate keeping `abuddy test` off that path, and trades per-script
isolation for it. The condition for picking it up is a script someone wanted to run against the app in
front of them and could not — not the observation that the two halves of `drive` behave differently.

**Its spelling is `--attach`, opting in**, and Phase 6 deletes that flag without retiring the word: for a
one-shot it has nothing left to select, which is a different thing from the concept going away. Two
corollaries. It must **not** be spelled as an inverse of `--fresh` — `--fresh` mints a clean data dir, and
making it also mean "launch your own app" fuses the storage axis with the app axis, which is the fusion
[`one-storage-axis.md`](../plans/one-storage-axis.md) exists to undo. And it must not acquire a second
word (`--live`, `--own-app`) for a concept these docs already name throughout: the churn of deleting a
flag and later restoring it is cosmetic, where two vocabularies for one idea is not.

## Constraints

The standing rules: commit each phase as it finishes, no attribution lines, `git diff --cached` first,
pushing and PRs on request; no publishing, releases or triggered workflows; no real data dirs, no broad
process kills by pattern, E2E in the `abuddy-test` namespace; preload, example pack and release-metadata
rules; typed EARS types are change-controlled; published packages take no `any` and need `api:update`
after an export change; `packages:build` before the CLI suite; migrations follow
`packages/abuddy-host/src/migrations/CLAUDE.md`; investigate failing tests and mutation-check new
guards; external packs stay first-class.

This goal's own:

- **The debug port is `development` only**, computed from `resolveAppContext()`, never from a flag or a
  file's contents, and bound to `127.0.0.1`. The session file is mode-0600 through `writePrivateFile`.
- **Keep renderer errors structured** when attached: a live listener from connect for new errors, the
  log for history, and an answer that says which. Do not collapse both into log text.
- **`setViewport` refuses when attached** rather than emulating, and says why.
- Run the narrow checks during a phase and the chain once at its end, per the root `CLAUDE.md` table
  ("What to run after a change").
