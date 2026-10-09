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
- `abuddy dev` exists, `abuddy run` does not, and drive's `--serve`/`--attach` are gone with
  abuddy-testing/src/engine/{server,marker}.ts and abuddy-cli/src/app/drive-{engine,one-shot}.ts.
- A live `dev` or `npm start` publishes <dataDir>/session.json; `drive` attaches to one and starts an app
  when there is none; `abuddy test` publishes none.
- The debug port is on in `development` only, and a spec fails if a packaged or test context gets it.
- Decision 8's lock question is settled by observation, and all three places say the same thing.
- `npm run typecheck`, `npm run spec` over each touched package, `npm run chain`, and — once Phase 7
  lands — `npm test -- smoke` and a real `abuddy dev` with `drive --eval` against it.
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

Not covered by the spike, so a phase proves each: autostart under contention, the idle timeout, the
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
10. **Autostart *is* `dev` — the same code path, watcher and all — and never the Playwright fixture.**
    Two reasons, and the second is why "spawns it as `dev` does" was not enough. (a) `appLaunchEnv` sets
    `PLAYWRIGHT_TEST = 'true'` unconditionally (`abuddy-testing/src/launch-env.ts:16`), which
    `_inferElectronAppEnv` answers `test` to — so a fixture-launched app can never be `development`, the
    environment gate would refuse it the debug port, and it would be unattachable. Nothing the app can
    see distinguishes a `drive` app from an `abuddy test` app, so there is no second axis to gate on.
    (b) **The fixture is also the only thing that installs the pack under test.** With `PACK_DIR` set it
    builds the pack and installs it into the data dir (`abuddy-testing/src/index.ts:357`), which is
    exactly why `drive` does none of that itself (`drive.ts:477`: *"No build here: the fixture builds the
    pack itself"*). An autostart that copied dev's *environment* would hand a pack author an app without
    their pack, or with a stale copy of it. `dev` already builds and installs it (`ensureCheckoutPackages`,
    door 3 in `abuddy-testing/CLAUDE.md`), so calling `dev` gets that for nothing.
    **No `dev --no-watch`.** A flag whose only purpose is to let one caller skip a step is the thing that
    drifts, and a watcher costs nothing while nothing is edited. One launcher is also what keeps the
    "session file's writers are derived, not listed" case to one row instead of two.
11. **Autostart starts the `development` app, and `dev` reclaims one a tool started.** A blank app
    cannot answer most of what `drive` is asked, so the default is the developer's own data, and
    `drive --eval` keeps one meaning rather than one per whichever app was up. What makes that safe is
    the reclaim: on the development dir, `dev` reads the session file and, for `startedBy: drive`,
    SIGTERMs that pid, waits for exit and launches, saying what it took; for `startedBy: dev` it refuses
    as today, because a person's app is not a tool's to take. Without it an agent's one-shot would hold
    the dir and the developer's `npm start` would fail, blaming itself.
12. **The idle reap does not apply to `development`** — only to a profile `drive` was asked to use. The
    development app is the one somebody may be looking at; a reclaim is what ends it. A persistent
    scratch is `--profile drive`, by name, never a default.
13. **Every `drive` run says which path it took** — attached, reclaimed and started, or started cold —
    and says when it completed onboarding, which Decision 14 makes possible.
14. **Onboarding is dismissed on every path, and there is no policy flag.** The readiness wait becomes one
    extracted function, `waitForAppReady(page)`, called by the fixture, by autostart and by attach alike:
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

That plan's phase 2. `dev` and `npm start` publish `<dataDir>/session.json`; `drive` attaches to a live
one and launches its own when there is none; `test` publishes none.

**Done when:** every "Done when" of that plan's phase 2; the environment gate's firing case passes (a
packaged or `test` context never gets the flag); `abuddy test` publishes no session file.

### Phase 5 — autostart

That plan's phase 3. A miss calls `dev` (Decision 10) under `holdExclusiveLock`, re-reading after
acquiring, and that `dev` publishes the session file. An autostarted app idles out; a `dev` one does not.

**Done when:** `dev` reclaims a `startedBy: drive` app and refuses a `startedBy: dev` one — both halves,
since that rule is what makes the default safe (Decision 11), and reclaiming unconditionally is the
mutation; an autostarted app is **attachable**, carrying a `debugPort` and answering a verb, which is the
case that fails the moment autostart routes through the fixture (Decision 10); **an autostart in a pack
repo installs the pack**, which is the other half of Decision 10 and fails if autostart copied dev's
environment rather than calling `dev`; two concurrent `drive` calls start **one** app (assert one pid —
the lock's firing case); every run says which path it took, naming onboarding when it completed it
(Decisions 13 and 14), which a never-onboarded profile is the case for; a `drive`-profile app idles out
and a `development` one does not (Decision 12). Then measure the end-to-end one-shot
(`npm run measure`, per that plan's Verification) and record the number in the Outcome.

### Phase 6 — the deletion

That plan's phase 4, **and only if Phase 5's measurement shows autostart carries `--serve`'s load**. If
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
