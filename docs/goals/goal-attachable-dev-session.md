> **Written in session** `75ab9455-5ee8-4b50-8043-6d5f22284a4a` (Claude Code, 2026-10-09). Resume it with `claude -r 75ab9455-5ee8-4b50-8043-6d5f22284a4a`.

```
# Goal: dev holds the app, drive attaches to it — and the two words stop colliding

Implement docs/goals/goal-attachable-dev-session.md on the current branch, at or after 3d5b21d45 — the base its
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
template and doc in the same change, and fix forward. Stored user data would be the exception, and there is
none here: the one on-disk thing this renames is the profiles directory, which carries disposable dev data
and is **not** migrated (Decision 2).

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
   becomes `--fresh --rm`. **No migration of the old directory**, on the user's instruction: a one-shot
   rename is the kind of code nobody finds to delete later, and a profile is a disposable data dir by
   definition (`profiles.ts`' own first line). The cost is stated rather than handled — dirs under
   `<cli data>/instances/` are not listed or opened any more, and a developer who wants one moves it.
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
    fixture.** Two reasons, and the second is why "spawns it as `dev` does" was not enough. (a) `appLaunchEnv` sets
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
    When an app *is* asked for, it is the developer's own data rather than a blank one, because a blank
    app cannot answer most of what `drive` is asked, and because `drive --eval` should keep one meaning
    rather than one per
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
    whose app it joined**, as the answer's `startedBy` field (Decision 17) rather than as a sentence — "a previous question started it" is the
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
    **And `--fresh --rm` on a one-shot means kill-then-remove**: `--fresh` implies `--spawn`, a spawned
    app persists, and `--rm` promises the dir is gone — so the app it just started is ended first. That
    is the only reading that keeps the flag's word; "the reap will get it" is a different promise. It is
    the one case where a one-shot ends an app outside the reclaim rule, on ownership rather than as an
    exception: it spawned that app itself and holds its `supervisorPid`.
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
    the data rather than in a sentence: the first says whether this question acquired a process, the second whose app answered — and
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
profiles root is `<cli data>/profiles/` with no code that reads the old one.

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

## Outcome

### Phase 1 — profile replaces instance (`e1992b632`)

Done. `--instance` → `--profile`, `abuddy instances` → `abuddy profiles`, `src/app/instances.ts` →
`profiles.ts`, `instance-secrets.ts` → `profile-secrets.ts`, `<cli data>/instances/` → `profiles/`, and
`--ephemeral` → `--fresh --rm`. `npm run typecheck`, `npm run spec packages/abuddy-cli` (209 cases) and
`npm run chain` (198.3s) all green.

Three choices the plan left open, taken here:

- **No migration of the old directory**, on the user's instruction mid-phase: a one-shot rename reading
  `instances/` is the kind of code nobody finds to delete later, and what it would carry is disposable by
  definition. Decision 2 and the rename plan were corrected to match. The migration and its four cases were
  written, mutation-checked and then removed; what replaced them is a sentence. Cost on this machine: the
  old root held one empty `.ephemeral/` and no named profile, so nothing was orphaned in fact.
- **`abuddy profiles --ephemeral` became `--all`**, since Finished-when requires `--ephemeral` to name
  nothing in the CLI. `--all` is the usual spelling for including what a listing hides, and the CLI already
  uses it that way in `clean --all`.
- **`ephemeral` stays as the property and the `.ephemeral/` directory.** The flag changed; the concept did
  not, and renaming the field would have been a second vocabulary for one idea.

No scan was committed for "no `instance` left in a user-facing string". It was run by hand and is what found
the last four sites, but as a gate it would fire forever on the single-instance lock — the other sense of the
word, which the corrected prose now discusses more rather than less. A check whose subject is a finished
migration is neither a gate nor an assertion (root `CLAUDE.md`, "A check that cannot fail today").

### Phase 2 — the lock question

**The data dir scopes Electron's single-instance lock. The app name does not.** Observed 2026-10-09 with a
two-process probe, the pair Decision 8 asked for:

| Probe | Result |
|---|---|
| same app name, **different** data dirs | both took the lock (`lock=true`, `lock=true`) |
| **different** app names, same data dir | the second was refused (`lock=true`, `lock=false`) |

And the mechanism directly, rather than inferred from the pair: while the lock is held the data dir contains
`SingletonLock` (a symlink naming `<hostname>-<pid>`), `SingletonCookie` and `SingletonSocket` — Chromium's
`ProcessSingleton`, which lives in the user data directory. So `app.setPath('userData')` is what decides it
and `app.setName` is immaterial.

What that means for this goal: the four environments run side by side because their **dirs** differ, not
their names; a profile is what lets two apps of one environment coexist; and every refusal `drive` and
`dev` make is about one data dir, which is what the attach design already assumed.

Corrected: `packages/main/CLAUDE.md` (two places, which said the app name) and `SingleInstanceApp.ts`
(which said "them"). `abuddy-cli/src/commands/drive.ts` was already right and is unchanged.

### Phase 3 — the port (`2cbb84479`)

Done, and the design's one technical risk is retired: a connected page answers identically to a launched
one, sees the same renderer's writes, and survives the connection being dropped and remade.

`appHelper(page, screenshotDir)` and `waitForAppReady(page)` are free functions the fixture calls;
`engine/cdp-page.ts` has `attachToApp`, `readDevToolsPort` and `findWindow`. **`asSessionPage` needed no
change at all** — it already takes a `Page` and an optional window, so there is one set of verbs rather than
the two the plan expected ("the same body the fixture's uses" turned out to be the same *function*).

Two things worth keeping:

- **The window predicate is held by a unit, not by the E2E spec.** `pages()[0]` is the right window in this
  app today, so the end-to-end assertion passes with the predicate replaced by "take the first" — measured
  by doing it. `abuddy-testing/tests/engine/cdp-page.spec.ts` presents several targets on purpose and fails
  five of six cases on that mutation. The E2E spec now says it does not hold that claim.
- **A dependency correction, which was blocking the whole phase.** The root pinned `@playwright/test`
  exactly and floated `playwright` on `^`, so two `playwright-core` copies were installed and a connected
  `Page` was *not assignable* to a launched one. The three ship in lockstep; pinning them together leaves
  one copy. tsc then writes the canonical `playwright/test` specifier into the published declarations, so
  `playwright` joins `playwright-core` as an optional peer that names it — found by `published-imports`,
  which is the check that exists for exactly this.

Not done here, deliberately: **the missing-`playwright-core` install hint has no firing case yet.** The
throw is written, but nothing takes that path until `drive` does, so the case belongs to Phase 5 rather than
being manufactured against a module that is present.

### Phase 4 — the session file (`fe963e92b`)

Done, and proven live rather than only in specs: `abuddy dev` at the checkout root with no pack held the app
and published a session, and `drive --state` against it answered in **1.15s**.

```
$ abuddy dev                       # at the repo root, no pack
  up on development data in <dir>
  attachable on debug port 60905 — `abuddy drive` can reach it
No pack here: holding the app. Ctrl-C to close it.

$ abuddy drive --state             # another terminal
Attached to the development app (pid 36307).
{"value":{"running":"connected"},"plugin":"default-setup/threads","plugins":[…]}
```

Four decisions the phase settled, each because the obvious placement was wrong:

- **The session module is `@abuddy/host/dev-session`, not the CLI's.** Two launchers publish one — `dev`, and
  the `npm start` loop that spawns Electron from `packages/main/vite.config.js` — so a CLI-owned module would
  have meant a second copy. The `pack-dev-servers` marker is in the host for that same reason.
- **`readDevToolsPort` went with it, after two wrong homes.** `@abuddy/testing` put a devDependency in the
  CLI's import graph, which `bundle-package.ts` refuses; `@abuddy/host/process-liveness` reads well but that
  module is about *whether a writer is still there*, and this answers *what port Chromium picked*.
- **`@abuddy/testing` is resolved at runtime by `drive`, never imported.** The CLI already reaches it that way
  for the Playwright binary, from the pack's own `node_modules` — so a pack drives with the harness it tests
  with. `attachedSession` was added there so the CLI asks for one thing rather than assembling five.
- **The pid means "the process whose death ends both"**, which differs in direction between the two
  launchers: `dev` records its own, because its teardown closes the app; `npm start` records Electron's,
  because that watcher exits *with* it.

Two gates caught real things, and both are the reason they exist: `published-imports` refused bare
`playwright` in the declarations (tsc writes the canonical `playwright/test` specifier), and
`sdk-bridge-drift` refused two new host exports that were neither bridged nor declared unbridged — both
host-only, now declared with the reason a pack must not have them.

**`--query` against the app I drove failed, and the failure was right.** The running app's *built* API
predates `host/drive`, so it broadcast where the session waits for a reply — which is what the stale-build
nudge on `npm run dev` exists to warn about, arriving unprompted as evidence that it is worth having.

Left for Phase 5, where Decision 17 defines it: the one-shot's **output shape**. The fast path currently
prints the engine's own result, so `--eval` without a `return` prints `{"ok":true}` rather than saying the
body returned nothing. `{value, state, startedBy, supervisorPid}` and the three exit codes replace it.

### Phase 5 — `--spawn`, the answer's shape, the reclaim (`5176a75a2`, `1a2ce7938`)

Done, and the bargain Decision 16 promised is measured rather than argued:

| | |
|---|---|
| no app, no `--spawn` | exit **3**, stdout **empty**, both ways forward named |
| `--spawn`, cold | **3.3s** — launch, attach, answer; `state: "spawned"`, and one stderr line |
| every question after | **0.9s** — `state: "attached"`, and **no stderr at all** |

`startedBy: "drive"` came back in the answer, which is the silent failure closed: `ABUDDY_SESSION_STARTED_BY`
reached the spawned `dev`, so the app is reclaimable. Had it not, nothing would ever have been, and the
developer's `npm start` would have refused while blaming them.

**The reclaim, proven live in both directions.** `abuddy dev` on a dir a question was holding printed
*"Reclaiming the app a question started (pid 74945)… it has gone; starting yours"*, and the session then read
`startedBy: "dev"`. A second `dev` on the same dir answered *"Using the development app already running"* —
a person's app is not a tool's to take. And the convergence held: the next question attached to the
developer's app and said so. The decision is a function (`mayReclaim`) so both halves have a case, and
reclaiming unconditionally fails exactly the one that protects a person's app.

**The listing is the other half of the hygiene answer**, and the one that survives a scrolled terminal:
each row with a live session names who started it and the pid that ends it, on the environment rows as well
as the profiles, since the development dir is where a spawn lands by default.

Deferred from this phase, with the reason:

- **The idle reap is not built.** Decision 12 scoped it to a profile a spawn used, and Decision 16 then
  removed most of what it was for — nothing is left running that nobody asked for, and a run that *was*
  asked says so and is findable in the listing. A timer that ends an app somebody may be looking at is the
  one thing Decision 12 argued against, and building it for the narrow remaining case would mean a new
  record (when it was last attached to) and a watcher in `dev` for a problem that is now opt-in.
- **`--spawn` in a pack repo installing the pack has no case of its own**, beyond `dev` doing the installing
  (which `dev-install.spec.ts` covers) and `--spawn` spawning `dev` rather than copying its environment
  (which is one line and a type). The end-to-end case would launch an app per run in a fixture pack; the
  cheaper proof is that there is one launcher.

#### The measurement Phase 6 turns on

`npm run measure --runs 7`, 2026-10-10, 67-72% idle — an **end-to-end one-shot**, CLI start included, which
is what a question actually costs rather than the 74ms the spike measured for the connect alone:

| Asking one question of a live app | |
|---|---|
| `drive --attach` against a `--serve` session (what Phase 6 deletes) | **0.7s** median of 7 (0.7-0.7s) |
| `drive --eval` attached over CDP to an `abuddy dev` app | **1.0s** median of 7 (1.0-1.0s) |
| `drive --eval --spawn` against nothing, cold | 3.3s |

**So the deletion costs 0.3s per question, and the verdict is to take it.** The engine's own attach is
quicker — it is an HTTP request to a process that has already connected, where this starts Node, resolves
the harness, imports `playwright-core` and connects. What the 0.3s buys is the removal of 851 lines, an
HTTP server, a token, a marker in Playwright's `outputDir`, a ready-line protocol, a `/close` verb and two
generated `.mts` files — and, more to the point, of **a second long-lived app beside one that already
exists**, which is the sentence the whole plan rests on. The old README's "~0.35s instead of ~3.5s" made the
gap sound like 3x; measured against each other on the same box it is 1.4x.

The one thing the engine still does better is hold a *warm connection*, and nothing here recovers that for
a per-question process. If an agent asking fifty questions in a row ever makes 15s matter, the answer is a
session that keeps the CDP connection — which is this design with a server in front of it again, and worth
building only when something has paid that cost and said so.

### Phase 6 — the deletion (`fd621dddf`)

Done, on the measurement above. 851 lines in four files, plus two generated scripts, a Playwright config
helper, three specs and the `--serve`/`--attach` flags.

What is left is smaller in the way that matters rather than merely shorter: `drive` has **one path for a
question** (attach, or refuse, or `--spawn`) and **one for a script** (the Playwright runner, untouched),
where it had three sharing a config, a scaffold and a one-shot client. `@abuddy/testing/playwright` has two
helpers rather than three, and neither locks a setting any more — the handshake they were protecting is
gone, so there is no setting left that a pack changing it would break.

Verified after the cut, all three paths: a miss exits 3 and names both ways forward, `--spawn` answers and
leaves the app, and the next question attaches.

**Two gates caught orphans nothing else would have found**: `scaffold-templates` found a template nothing
rendered any more, and `chain-inputs` found six steps declaring inputs that named no file — which is a step
caching over a gap. Both are checks whose whole subject is a thing going stale quietly, and both fired on
the first run after the deletion.

One correction worth keeping: the old `drive/README.md` claimed the engine's attach was *"~0.35s instead of
~3.5s"*. Measured against the new path on one box it is 0.7s against 1.0s. The 3.5s was a cold one-shot —
two different comparisons quoted as one, which is what a figure without its conditions does.

### Phase 7 — `--build`, one flag (`8f5a0ded5`, `5014dad03`, `eca8156c0`)

Done, in three parts, and the third turned up the one thing the plan did not anticipate.

**The flag.** `--app` and `--app-root` were never two concepts: they split on the *shape of the value*, and
the name half accepted exactly one word. One flag and one line of disambiguation replace both — a value in
the known-name set is a build, anything else is a path — with `./beta` as the escape hatch for the day a
checkout is named after a channel. `ABUDDY_APP` and `ABUDDY_ROOT` collapse into `ABUDDY_BUILD`, read before
anything can outrank it, which is what stops the two resolvers disagreeing about one value.

**The shorthands.** `-d`, `-b` and `--production` resolve through `--build` on every command that reads a
build's data, and `--build <name>` says the same thing in the one word the CLI now uses. Two things the old
flags could not do are now cases: a value that is not a build is refused *by name* with what the builds are,
and the shorthands are held to the long form pairwise.

**The resolver.** `resolveAppContext({ build?, profile? })`, and `AppContext.build` rather than `.env`, so
one resolver does not answer in two vocabularies. 27 argument sites, 12 context reads, `AppPlace` and
`DbTarget`; `api:update` regenerated `env.api.md` and every line of it is this change.

**The finding: `ABUDDY_ENV` does not collapse, and must not.** Decision 3 says `ABUDDY_APP` and
`ABUDDY_ROOT` become "one variable holding either shape", and the obvious next step is to make the app's own
`ABUDDY_ENV` that variable too. It is the wrong step. `ABUDDY_ENV` and `ABUDDY_USER_DATA_DIR` are the
**handoff** — how a parent process tells a child what it is and where its data is, written by the CLI and by
Electron main — where `--build`/`ABUDDY_BUILD` is a **selector** a person types. One is the question and the
other is the answer, and giving them one name is the same fusion this phase exists to end, one layer down.
So the selector collapsed and the handoff stayed, which is also why `ABUDDY_ROOT` and
`ABUDDY_APP_EXECUTABLE` survive as the fixture's inputs: those are two *kinds of answer*, not two spellings
of one question.

`npm test -- smoke` is what says the app still resolves its own identity and data dir after the rename — the
one claim no unit can make, since every path in a context is joined onto a dir the resolver chose.
