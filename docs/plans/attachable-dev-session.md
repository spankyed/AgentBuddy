# `dev` holds the app, `drive` attaches to it

Compiled 2026-10-09. The spike below is run and green, so this is work that can start, after
[`profiles-not-instances.md`](profiles-not-instances.md).

## Context

Three commands launch the app and each owns the one it launched:

- **`run`** is a process supervisor — `spawn(electron, [app.root], { stdio: 'ignore' })` — plus the pack
  watch/rebuild/reload loop and a Vite dev server.
- **`drive`** launches its own app through Playwright's test runner, because Electron allows one app per
  data dir and `run` already has that dir.
- **`test`** launches its own, hermetically, and must keep doing so.

`drive --serve` exists for one reason, which `CLAUDE.md` states: *"an agent asks many questions of one warm
session rather than editing and relaunching for each."* **It is a long-lived app wearing a cache's clothes**
— an HTTP server, a token, a file in Playwright's `outputDir` saying where it is (`engine/marker.ts`,
which this deletes and which is **not** the session file below), a ready-line protocol and a `/close`
verb, all so that one app survives between questions.

**The latency is the smaller half of why.** What a session holds is *state*: the data dir, where it was
navigated, what was typed into it, the entities a question created. Three questions against three fresh
apps are three different apps, which is a different thing from three questions against one — the ~3.5s is
what you notice and the state is what you were using.

So the claim is not that the cache is too expensive. It is that **the cache is a second long-lived app
beside one that already exists**, and the only reason it exists is that nothing could attach to the first.

Two facts remove that reason.

**`SessionPage` is already a port.** Twelve methods (`engine/session.ts:37`), with `SessionDeps`
(`:112`) taking `page`, `api`, `takeErrors` and `readLog`. The 705 lines behind the 23 verbs have no
Playwright in them — the verbs are built on the port, which is the separation this design needs and the
reason it is already there.
`AppHelper` (`abuddy-testing/src/index.ts:15`) is the same: every one of its methods is `page.evaluate`,
`page.waitForFunction` or `page.screenshot`, so it is a function of a `Page` and only *looks* fixture-bound
because the fixture is where it is constructed.

**Playwright has a connect.** `_electron` has no `connect`, which is where *"whoever launches owns the page"*
came from — but Electron's renderer is Chromium, and `chromium.connectOverCDP` attaches to it and returns a
real `Page`.

## The spike, run 2026-10-09

`--remote-debugging-port=0` on this checkout's Electron, a throwaway data dir, `playwright-core` 1.59.1.
Latencies are single observations, not medians: they are quoted for an order of magnitude (74ms against a
~3.5s launch), and nothing here decides on a threshold.

| | Observed |
|---|---|
| `--remote-debugging-port=0` | accepted; chosen port published to `<dataDir>/DevToolsActivePort` |
| `connectOverCDP` | succeeded, 74ms, 1 context |
| main window | found by the same `window.applicationState` predicate `findMainWindow` uses |
| `evaluateExpression` (the `/eval` path) | `document.title` → `"Agent X"` |
| `evaluateWith` (the `AppHelper` path) | state → `{"onboarding":"letter"}` |
| `screenshot`, `exposeFunction`, `waitForFunction` | 22,607 bytes; in-page call returned 42; resolved 14ms |
| `ariaSnapshot`, locators | 227 chars; 11 buttons — locators and actionability resolve |
| **reconnect after a full disconnect** | **11ms, pages still live** |
| renderer `console.error` | reaches stderr under `--enable-logging` (`INFO:CONSOLE`) |
| uncaught renderer error | **already** in the app's log via electron-log's `[RENDERER]`, no flag needed |

The reconnect row is the one that decides the design: a launched Playwright `Page` dies with its window and
the engine has no reconnection by design, so a long-lived session rots. A CDP client re-attaches.

## The design

### The shape

**Two words this design needs, named here because it revolves around them.** An **attachable app** is a
live app that published a debug port and said so; what it publishes is its **session file**, not a
"marker" — `<dataDir>/session.json`, which is what the name should say, since the data dir already holds
one marker (`pack-dev-servers/<id>.json`) that means something else entirely.

**The order matters**: that rename gives `--profile` its name, and this plan changes what the flag
*means* — it stops saying only where a throwaway app's data goes and starts naming **which app a question
reaches**, the one whose session file is read, with `--profile drive` reserved as a scratch. Whether that
app is joined or started is decided by liveness rather than by the flag. A flag should not gain a new name
and a new behaviour in one change.

**A live app is a resource with a lifecycle, not a side effect of a command someone remembered to run.**
That is the invariant the rest follows from, and it is one step further than *"`dev` holds the app"*: once
`connectOverCDP` works, *which* command launched the app stops mattering, so what the design owes a caller
is an answer to "is one live, and if not, make one" rather than a rule about who went first.

```
an attachable app   any launcher that starts one writes <dataDir>/session.json:
                    { debugPort, apiPort, logPath, dataDir, supervisorPid, startedBy }
                    `dev` and `npm start` both do. `test` never does.

dev    spawn(electron, [root, '--remote-debugging-port=0', '--enable-logging']) + the session file.
       Serves nothing. Holds no engine. No Playwright. The supervisor it already is.

drive  attachable -> connectOverCDP -> page -> appHelper(page) -> the verbs
       otherwise  -> **refuse**, naming `--spawn` and `abuddy dev`
       --spawn    -> spawn `dev` detached, wait for its session file, attach -> the same verbs
       One SessionPage implementation, and one capability it cannot serve attached (setViewport).
       This is the one-shot path. `drive <script>` is the next line, and the difference is deliberate.

drive <script>   @playwright/test + _electron.launch, in whichever profile it was given. A question
       attaches, a program gets a dir — "What stays" below says why, and it is not an oversight.

test   @playwright/test + _electron.launch. Unchanged, owns its app, publishes nothing.
```

**Autostart is `dev`, not something shaped like it.** The same function, watcher included — because the
Playwright fixture is also the only thing that builds and installs the pack under test
(`abuddy-testing/src/index.ts:357`, which is why `drive.ts:477` says *"No build here"*), and `dev` is the
only other thing that does. An autostart that merely copied dev's environment would hand a pack author an
app without their pack. One launcher, one session-file writer, and no `dev --no-watch`.

### What a caller types

**What a caller types, before and after.** The verbs do not change; what changes is that none of them
needs a session stood up first.

| Today | After |
|---|---|
| `abuddy run [flags]` | `abuddy dev [flags]` — same flags |
| `abuddy drive <script>` | unchanged |
| `abuddy drive --serve` | gone: the app itself is the long-lived thing |
| `abuddy drive --eval 'body'` | same spelling; attaches, or **refuses** naming `--spawn` |
| — | `abuddy drive --eval 'body' --spawn` — attach, or start an app and attach to that |
| `abuddy drive --attach --eval 'body'` | `abuddy drive --eval 'body'` — an attachable app is the whole condition |
| read-only one-shots (`eval`, `query`, `state`) | every verb, writes included |
| `npm run drive:serve` | `npm run dev` |

### What it reaches

**`npm start` publishes one too, and that is the half worth having.** `dev`'s Vite server is rooted at a
*pack*, so attaching to it gives HMR for a pack's frontend and nothing else; the host renderer still comes
from its built bundle. `npm start` is the loop that serves the renderer itself, so a session file there is
what makes "edit a `.vue` in `packages/renderer` and drive the app that just hot-reloaded it" possible at
all. Scoping it to `dev` would leave the app you are most often looking at the one you cannot attach to.

**What attaching buys depends on the layer, and the plan should not be read as promising more.** Four
loops, and only one of them has none:

| Layer | Loop today |
|---|---|
| pack frontend | HMR, `dev`'s Vite server |
| pack backend | `abuddy build --watch` → ~40ms rebuild → `POST /dev/reload`, the pack reloaded in place |
| host renderer | HMR, but only under `npm start` — `dev` launches a built app |
| **host backend** (`@abuddy/host`, SDK, API) | **none**: `npm start` builds it once and awaits it before Electron spawns |

Attaching changes none of these. What it removes is the *second app* and the relaunch per question; a host
backend change still needs `npm run build:be` and a restarted app, and a `/reload` verb reloads a renderer,
not a process. That is a different problem and not this plan's — but it is the layer an agent working on
the app itself spends most of its time in, so the plan should not be read as having addressed it.

**And a packaged build is attachable-never**, which is a property of the binary rather than a decision
here. `appEnv()` reports `beta` for anything packaged (`app-target.ts`), the debug flag is `development`
only, so `dev --app beta` publishes no port. Its own loops are unchanged by that and by this plan: the
pack frontend still hot-reloads, because the Vite server and the `pack://` proxy do not care what kind of
build is on the other side, and its pack backend is **restart-only**, because a packaged app publishes no
API token for `POST /dev/reload` to authenticate with (`run.ts`'s usage note says so today).

**It still writes a session file — without a `debugPort`.** An app holding a data dir is worth knowing
about whether or not it can be driven, and the absence of the port is the reason, recorded where the
reader already looks. Two consequences, and neither is a new rule:

- **With no profile named**, `drive` reads it, sees it is not attachable, starts its own app on a
  throwaway dir and **says which app it is driving**. There is no conflict — different data dirs — and the
  line exists only so that nobody watches a Beta window wondering why their clicks land nowhere.
- **With a profile named**, the app holding it is in the way, and the refusal is the one that already
  exists for any holder (`profileInUse`): the single-instance lock is scoped to the data dir, so the dir
  cannot be launched into and, a Beta publishing no port, cannot be attached to either. **This plan
  narrows that refusal rather than adding one** — an attachable holder stops being a refusal at all, which
  is most of them.

**Which data dir `drive` looks at, with no profile named, is the `development` build's — it scans nothing.**
A session file is per data dir, so "is one live" needs a dir to ask about, and the choice is between a
scan of every environment and every profile, or a default. A default, because a scan answers a question
nobody asked (*which* app did you mean, of the three it found?) and because the answer is already
unambiguous: `npm start` and `dev --app-root` both land in `development`, which is the app an agent
working on this checkout is looking at. `--profile x` asks about that dir instead, and is the only way to
mean another one.

**What each profile flag then means**, since they decide the dir and so decide attachability:

| `drive` invocation | Behaviour |
|---|---|
| no flag | attach to the `development` app; **refuse** if none is live, naming `--spawn` |
| `--spawn` | the same, but start one and attach to that instead of refusing |
| `--profile drive` | a scratch kept between sessions, idling out when unused |
| `--profile probe`, an attachable app on it | **attach** — the case this plan is for |
| `--profile probe`, nothing on it | refuse; with `--spawn`, start one there, publish its session file, attach |
| `--profile probe`, a non-attachable app on it | the existing `profileInUse` refusal — the dir can be neither launched into nor attached to |
| `--fresh` / `--fresh --rm` | mints a new dir by definition, so there is never anything to attach to: it implies `--spawn` for a one-shot, since the flag would otherwise ask for a dir and then refuse to use it. Isolation is what was asked for, not a gap |

**A checkout with no pack in hand is a first-class case**, not a fallback. `drive` run where no
`abuddy.json` sits above it drives *this checkout's* app, which is how the repo's own `drive/` scripts run
and how an agent asks about the host rather than a pack. Scoping attachability to a pack's `dev` would
leave exactly that caller relaunching, so the session file is a property of an app, never of a pack.

**Which means `dev` has to run with no pack, and today it refuses to.** `session()` opens with
`findPackRoot(process.cwd())`, which throws *"No abuddy.json found. Run this command from inside a pack
directory"* (`utils.ts:42`), and then requires `src/` to watch (`run.ts:156`, `:159`). So autostart being
`dev` (the goal doc's Decision 10) would leave this repo's own `npm run drive:eval` — the primary caller,
run from the root — able to attach and unable to start. **The fix is to drop the precondition, not to add
a mode or a second launcher**: `findPackRootOrNone` already exists (`utils.ts:31`) and `drive.ts` already
splits on it for exactly this reason. **What `dev` gains is a launch-and-hold core**, with the whole pack
loop conditional: with no pack it skips the build, `installToApp`, the watchers, the reload path, the Vite
server and the `pack-dev-servers` marker, and does the three things left — launch with the debug port,
publish the session file, hold it.

**That is a new decision and not a reading of the design block above.** The block's *"the supervisor it
already is"* affirms the supervisor `dev` is today, pack loop included; it is describing the delta from the
engine — no HTTP server, no engine, no Playwright — rather than a core with the pack work taken out. Six
things becoming conditional is a restructure of the command, which the Files table states and this
paragraph should not undersell. A side benefit: `abuddy dev` at the checkout root becomes a lighter
`npm start` that does not rebuild the renderer.

### Starting one when there is none

**"Autostart" throughout this doc means what `--spawn` does** — the mechanism, which is unchanged; only
whether it fires without being asked has changed, and it no longer does.

**A one-shot refuses by default, and `--spawn` is how you ask.** This is the one place the design says no
rather than being helpful, and it is deliberate: the intuitive reading of `drive --eval` is *"ask the app"*,
so with no app the honest answer is to say there isn't one — not to start one, leave it running, and
mention it in a line nobody reads. A question that silently acquires a process is the shape that produces
forgotten daemons, and refusing by default means **nothing is ever left behind that was not asked for.**

```
$ abuddy drive --eval 'app.getState()'
No app is running on the development data dir.
  Start one with `abuddy dev`, or add --spawn to have this start one and keep it.
$ echo $?
1
```

**And `--spawn` still beats a launch per question, which is what makes the deletion of `--serve` hold.**
The spawned app publishes its session file like any other and stays, so a cold checkout is one explicit
flag on the first question and an attach on every one after. That is the same bargain `--serve` offered —
one setup step, then cheap questions — with the setup step being a flag rather than a long-lived
foreground process, and nothing to tear down afterwards but the app itself.

**It calls `dev`. Not the fixture, and not a launcher shaped like `dev` — `dev` itself, and that is
load-bearing twice over.**

First, the environment. `appLaunchEnv` sets `PLAYWRIGHT_TEST = 'true'` unconditionally
(`abuddy-testing/src/launch-env.ts:16`) and `_inferElectronAppEnv` answers `test` to that before
considering anything else — so an app launched through the fixture can never be `development`, and the
environment gate below would refuse it the debug port. An app autostarted through the fixture would
publish a session file with no port and be unattachable, which is the one thing autostart exists to
prevent. **There is no axis to gate on instead**: a one-shot sets no `PLAYWRIGHT_VISIBLE` either, so
nothing the app can see tells a `drive` app from an `abuddy test` app. That is a reason to keep autostart
off the fixture, not a problem to work around.

Second, the pack — and this is the half that "spawns it as `dev` does" would get wrong while passing every
check the paragraph above suggests. **The fixture is the only thing that installs the pack under test.**
With `PACK_DIR` set it builds the pack and installs it into the data dir through the same stage-verify-place
path a user gets (`abuddy-testing/src/index.ts:357`), waits for its plugins and fails on its `lastError`;
`drive` deliberately does none of it (`drive.ts:477`: *"No build here: the fixture builds the pack itself
when PACK_DIR is set"*). In this repo that is free — a root with no `abuddy.json` leaves `packDir`
undefined and the built-in pack is compiled into the API — but in a pack repo it is the whole subject, and
an autostart that reproduced dev's *environment* would attach a pack author to an app without their pack,
or with the copy from before their last edit. `dev` already does it: `installToApp` (`run.ts:61`, called
at `:259`) is the pack install, and `ensureCheckoutPackages` beside it is a different job — building the
`@abuddy` packages' `dist` that a pack compiles against (`checkout-packages.ts`' header) — so spawning
`dev` gets both for nothing. Naming the second where the first does the work is the mistake this sentence
used to make.

**And no `dev --no-watch`.** A flag whose only purpose is to let one caller skip a step is the thing that
drifts, and a watcher costs nothing while nothing is being edited — if something is, the rebuild was
wanted. It also keeps the "session file's writers are derived, not listed" population at the two this
design already has — `dev` and `npm start` — rather than a third nobody would think to look for.

**"Calling `dev`" means spawning it detached, because `dev` never returns.** Its body ends in
`await new Promise(() => {})` (`commands/run.ts:333`, `:369`) — it is a foreground supervisor holding the
app, the watcher and the dev server for as long as the terminal lives. A one-shot has to answer and exit
while that app stays up, so autostart spawns the CLI's own bin as a **detached child** with `.unref()`,
and the one-shot then **waits for the session file to appear** rather than for a function to return. Three
things follow, and each is a way to get this wrong:

- **The deadline is a pack build, not a window.** A cold autostart runs `ensureCheckoutPackages` and
  `abuddy build` before Electron starts, which is tens of seconds, not the 45s a fixture allows for a
  window to show up. A deadline sized for the launch reports a timeout on a build that was working.
- **The child's output cannot go to `/dev/null`.** `dev` spawns Electron with `stdio: 'ignore'` today,
  which is right for a window a person is watching and wrong here: a pack build that fails would reach the
  caller as "no session file appeared" with no cause. It goes to the session's `logPath`, which the session
  file already carries, and the timeout message names that path.
- **A child that exits before the file appears is an error with a body**, not a timeout. Watch for both,
  and report the exit.

Nobody is left holding it: on the development dir the developer's own `dev`/`npm start` reclaims it
(Decision 11 in the goal doc), and on a `drive` profile the idle reap takes it (Decision 12). A detached
child with no owner is exactly what those two rules exist to answer.

**It starts the `development` app, which is a change in what `drive` touches, and is stated rather than
defaulted into.** Today the fixture gives every `drive` run a throwaway dir, so a one-shot cannot reach
real data. After this, a `drive --eval` with nothing running boots the development app: your notes, your
installed packs, your flows — which is the point, since a blank app cannot answer most of what the
command is asked, and since it leaves `drive --eval` with **one** meaning rather than one per whichever
app happened to be up. Starting that app is what `npm start` does several times a day, and the apply
that runs on its boot is the one this repo made non-destructive.

**`dev` reclaims an app a tool started, which is what makes `--spawn` safe to point at the development
dir.** One app per data dir, and `SingleInstanceApp` exits on the second — so without this, a spawned
one-shot would hold the development dir and the developer's own `npm start` would refuse, with the blame
landing on `npm start`. The session
file already carries what settles it:

```
dev / npm start, on the development dir
  startedBy: drive  -> SIGTERM its supervisorPid, wait for exit, launch — and say what it reclaimed
  startedBy: dev    -> refuse, as today. A person's app is not a tool's to take
  no session file   -> launch
```

A pid read from a file the process that wrote it owns is the only kind this repo permits, and the rule is
narrow by construction: it reclaims what a tool started for itself and nothing else. **The two commands
then converge** rather than compete — after a reclaim the next `drive` finds the developer's app live and
attaches to it.

**The pid is the supervisor's, not the app's, and the field is named so it cannot be misread.** `dev` is
what writes the session file, and `dev` is what has to be signalled: `process.on('SIGTERM')` runs its
`teardown`, which closes the app it holds (`run.ts:229`, `exited(child, 10_000)`), so **one signal ends
both**. Nothing goes the other way — `run.ts` has no handler that exits `dev` when Electron does, so
signalling the app instead frees the data dir and leaves a watcher and a Vite server running with nothing
to serve. That is the defect the name `pid` invites, and it is the same misreading in three places at
once: the reclaim, the idle reap, and the sentence this design prints to a user telling them how to stop
an app. So the field is `supervisorPid`, and the app needs none — it is reached through `debugPort`.

**One consequence to carry rather than fix**: `recordIsStale(file, supervisorPid)` then answers "is the
supervisor there", which is not quite "is the app there". A supervisor whose Electron crashed reads live
and the attach fails at `connectOverCDP` — which is why the dead-port case in Verification is a real case
and not a formality. Treating a failed connect as a miss, with the reason named, is the behaviour that
makes both readings safe.

**So the idle reap does not apply to `development`.** A scratch app that nobody is looking at should
disappear; the development app is the one somebody may be looking at, and closing it under them is worse
than leaving it. There is at most one, it is the app they would have started anyway, and a reclaim is
what ends it. The reap stays for a profile `drive` was asked to use.

**A scratch that persists is a profile, asked for by name**: `--profile drive`, a fixed path, which is
why it needs no record of *which* scratch dir to keep, check or reap. `--fresh` and `--fresh --rm` are
the other half, for a clean one. None of them is the default, so none of them is something an agent gets
without asking.

**Every run says which path it took**, on stdout — attached to the development app, reclaimed and
started it, or started it cold. A command that can reach a developer's data should be legible from
inside the run rather than discovered from outside it.

**A run that started one also says it is still running, and how to end it.** Autostart leaves a detached
process behind that a question began: in a pack repo that is Electron, a recursive file watcher and a Vite
dev server, and in a checkout with no pack it is Electron alone. Nothing reaps it on `development` by
design, so the two ways out are `abuddy dev`, which reclaims it, and the `supervisorPid` the session file
carries. The
reclaim answers correctness — the developer's `npm start` cannot be blocked by it — and this line answers
the other question, which is who closes it.

Under contention it takes `holdExclusiveLock` (`@abuddy/host/exclusive-lock`) and **re-reads the session
file after acquiring**, because two agents asking at once is the ordinary case here and both would
otherwise launch — the same rule, and the same mechanism, as the chain's one writer per stamp directory.

**Liveness is already solved.** `recordIsStale(file, pid)` (`@abuddy/host/process-liveness`) exists for
exactly "is the process that wrote this record still there", errs toward stale, and is what the
`pack-dev-servers` marker and the API port file already use. A session file whose app has gone is a miss,
not an error.

### The two Playwright packages

**Two Playwright packages, two jobs, and the runner is not one of the things that goes.**
`playwright-core` carries `chromium.connectOverCDP` and `_electron.launch` — the attach path, and so
every one of the 23 verbs, since each is a call on the `Page` it hands back. `@playwright/test` carries the runner, which is what *runs a script in `drive/`*: `drive`
is `_default.test` (`abuddy-testing/src/index.ts:673`), so every script there is a Playwright test, and the
runner is supplying script selection and `--grep`, the worker/test fixture split, `reporter: 'list'`, the
deliberate `timeout: 0`, and the `trace.zip` a failing drive run prints the `show-trace` line for.
Dropping it would mean reimplementing collection, reporting and traces, or losing them — a replacement
cost booked as a saving. **Per-script isolation is not on that list**, deliberately: it is a consequence
of the script path launching its own app rather than a reason to keep the runner, and it would survive a
runner that did nothing else. "What stays" is where it is argued. `_electron.launch` is what attach replaces, not `@playwright/test`.

**Neither is a dependency of `@abuddy/cli`; both are optional peers, imported lazily.** The runner is
nearly free beside the attach path it sits next to: measured 2026-10-09 on this checkout, `playwright-core`
is 11M and `@playwright/test`'s own files are ~24K, the 12M beside it being a *duplicated*
`playwright-core` 1.54.1 under its `node_modules` (version skew here — root pins 1.54.1, the hoisted core
is 1.59.1). None of the three has an install script; browsers come from `npx playwright install`. What
decides where they are declared is that a published CLI should not drag either into an install of someone
who only runs `abuddy build` — and `dev` and `drive` are one binary, so a module-level rule that `dev`
never imports the session decides runtime and not install weight.

So both sit on `@abuddy/testing`, where `@playwright/test` already is (`peerDependencies`,
`peerDependenciesMeta.optional`) and where `SessionPage` and the new `cdp-page.ts` live, and the attach
path imports `playwright-core` lazily and throws with an install hint when it is absent — the pattern
`@abuddy/sdk` already uses for `typescript` and `esbuild`. `abuddy build`, `validate`, `pack` and `dev`
gain nothing to install; `drive` needs what it needs and says so. A pack that ran `init-tests` has both
already, and `resolvePlaywrightCli` continues to resolve the pack's copy rather than a bundled one.

**Attachability is declared, never inferred.** A session file is published by a launcher that means its
app to be driven, so `test` publishes none and a packaged build carries no port. `--attach` stops being a
flag because an attachable app is the whole condition, and `--serve` stops existing because an attachable
app is there to answer every question after the first — spawned on request by `--spawn`, and then simply
there.

**`--attach` goes as a flag; the word is not retired.** It is deleted because for a one-shot it has
nothing left to select, not because attaching stopped being the name of the thing. If `drive <script>`
is ever given the choice (the goal doc's Deferred), `--attach` is its spelling — the one place the choice
is real — and it should not be made to find a second word for a concept this plan names throughout.

## What goes

851 lines in four files, whole — none of them the test runner:

| File | Lines | Why |
|---|---|---|
| `abuddy-testing/src/engine/server.ts` | 455 | HTTP routing, the token header; `verb()` becomes argv dispatch |
| `abuddy-testing/src/engine/marker.ts` | 101 | and the `outputDir`-Playwright-wipes coupling with it |
| `abuddy-cli/src/app/drive-engine.ts` | 152 | the HTTP client, `ENGINE_TOKEN_HEADER`, `oneShotOutcome` |
| `abuddy-cli/src/app/drive-one-shot.ts` | 143 | ready-line accumulation, three settle paths, `/close` in a `finally` |

Plus `--serve`, `--attach` and the **machinery behind** the one-shots in `drive.ts` (544) — the spawn,
the ready-line wait and the `/close` in a `finally`. The one-shot *interface* stays and gains verbs; what
goes is that each had to stand a server up to be answered. And:

- **`ONE_SHOT_ASKS`' read-only subset** — a restriction because a session closing a moment later made writes
  hard to explain. Attached to a `dev` session there is nothing to explain, so `/click` and `/fill` become
  one-shots too.
- **`oneShotOutcome`'s status-vs-`ok` trap** — `attempt` answers a thrown verb with `ok: false` and a 200,
  so reading the status exits 0 on every real failure. With no status there is no trap.
- **The engine's two generated files** — `drive/engine.config.mts` and `drive/engine-session.mts`, with
  `defineDriveConfig` no longer having a session to ignore, the `.mts`-versus-`**/*.ts` glob accident that
  was the only thing keeping a plain `abuddy drive` from collecting the engine and hanging, and
  `playwright-config.spec.ts`'s string comparison — a gate that exists only because the client and the
  server live in different packages.

**What stays: the runner and the script path.** `resolvePlaywrightCli`, `drive/playwright.config.ts` and
`defineDriveConfig` are untouched, because `drive <script>` goes on being a Playwright run. The engine,
the token, the HTTP server and the ready-line protocol are what this deletes; the runner shares none of
them, so removing it would save nothing and cost traces, `--grep` and reporting.

**And the script path keeps launching its own app, which is a decision rather than what fell out.** One
reading of the shape above is that the two halves end up backwards — a one-shot attaches to the app you
are looking at, a script launches a throwaway, when a script is the longer sequence of clicks and reads
you would more plausibly want against real state. The answer is that **a question attaches and a program
gets a dir**: a script whose result depends on whichever plugin was left open and whichever rows were
half-edited has undeclared inputs, and the fresh dir is what declares them. A script that wants the
developer's *data* already has it — `--profile` hands the fixture exactly that directory (`E2E_DATA_DIR`,
`drive.ts:495`) — so what it cannot share is the *process*, which costs a launch and the chance to watch
it happen in the window already open.

**What it would cost to change, if that is ever wanted.** The fixture *is* the launch, so a script would
need `electronApp`/`appPage` to yield a connected page instead — a change to the one file every spec in
this repo, both fixture packs and every external pack's suite imports — plus a gate proving `abuddy test`
can never take that path, since a hermetic suite that attached to a developer's app would be worse than
useless. That is a plan of its own, and the thing to start it from is a run that was annoying rather than
a table that looks asymmetric.

Two defect *classes* go rather than move: an engine marker that outlives its session, and an exit code read off the
wrong field.

**The port's authentication is a trade taken, not a defect removed.** The engine's port is token-guarded
today (`ENGINE_TOKEN_HEADER`; a wrong header answers `missing or wrong x-abuddy-drive-token`). CDP is not
guarded at all, and the renderer it exposes holds the app's API token — so this swaps an authenticated
local port for an unauthenticated one, and `--spawn` means an app can carry it without a developer having
started one by hand — on request, which is the whole of what Decision 16 bought here. What makes that acceptable
is in "Security" below, and it is a condition of the design rather than a mitigation after it.

## Files

| File | Change |
|---|---|
| `abuddy-cli/src/commands/run.ts` → `dev.ts` | rename; add the two argv entries, publish the session file, and reclaim one a tool started (`startedBy: drive` → SIGTERM its `supervisorPid`, wait for exit, launch, say so); `index.ts` `COMMANDS`/`USAGE`. **Drop the pack precondition**: `findPackRoot` (`:156`) becomes `findPackRootOrNone`, and the build, `installToApp`, the watcher and the Vite server all hang off there being a pack — with none, it launches, publishes and holds. `src/` is only required when there is something to watch (`:159`) |
| `abuddy-host/src/private-file.ts` | moved: `writePrivateFile` out of `secrets/private-file.ts`, with a `./private-file` export. It is a 0600 atomic write and nothing about secrets, and a session file is not a secret — reaching for it behind the secrets barrel would be the wrong dependency, and it is not in that barrel today anyway |
| `abuddy-cli/src/app/session-file.ts` | new: write/read `{ debugPort, apiPort, logPath, dataDir, supervisorPid, startedBy }` through `writePrivateFile`, `readDevToolsPort` polling `DevToolsActivePort`, and `--spawn` under `holdExclusiveLock` with the re-read after acquiring. It **spawns `dev` detached** rather than launching Electron itself, so the pack build and install come with it, and waits for the session file rather than for a return — `dev` has none. **`startedBy` is passed in, since `dev` writes the file and cannot know who asked**: `ABUDDY_SESSION_STARTED_BY` on the spawn, defaulting to `dev`. Getting this wrong is silent — `dev` records `dev`, nothing is ever reclaimable, and the developer's `npm start` refuses with a message blaming them — which is why Phase 5's reclaim case must spawn and then reclaim rather than hand-write a session file |
| `packages/dev-mode.js` | `npm start` publishes one too, so the app with renderer HMR is attachable |
| `abuddy-cli/src/commands/drive.ts` | attach-or-launch for the one-shots; a miss calls `dev`. Delete `--serve`, `--attach`, `takeServeFlag`. **The script path and its config are untouched by decision**, per "What stays": a question attaches, a program gets a dir |
| `abuddy-testing/src/index.ts` | extract two free functions the fixture then calls: `appHelper(page, resultsDir)`, and `waitForAppReady(page)` — the readiness wait (`index.ts:479-507`) with the onboarding dismissal moved *inside* the predicate. Window-finding is not extracted: `findMainWindow` takes an `ElectronApplication`, and the attach path enumerates `browser.contexts()[0].pages()` with the same `!!window.applicationState` predicate |
| `abuddy-testing/src/engine/cdp-page.ts` | new: `SessionPage` over a connected `Page` — the same body the fixture's uses |
| `abuddy-testing/src/engine/{server,marker}.ts` | delete |
| `abuddy-cli/src/app/drive-{engine,one-shot}.ts` | delete |
| `abuddy-testing/package.json` | `playwright-core` as an optional peer beside `@playwright/test`; `@abuddy/cli`'s dependencies are unchanged |
| root `package.json` | `drive:serve` → `dev`; `drive:eval`/`:query`/`:state` keep their names. **The new `dev` script carries `tsx scripts/drive-preflight.ts &&` like the five `drive*` scripts already do** — see "The stale-build nudge" |
| `drive/` scaffold | drop the two generated `.mts` files; the Playwright config stays, since scripts still run on the runner |
| `abuddy-cli/src/commands/profiles.ts` | a **running** column: `supervisorPid`, `startedBy`, uptime and debug port per data dir, read from the session files, with the four environments' dirs listed beside the profiles. See "Telling the user" |
| `docs/public-facing/cli.md` | the **"Which app, and how long it lives"** table — a named deliverable, not a wording pass. Its content is in "Telling the user" |
| `drive/README.md` | "One session, many questions" is about to be false; it becomes "The app stays between questions", pointing at that table |
| prose | `abuddy-cli/CLAUDE.md` (the `run`/`drive` rows, `src/app/`, and `:14`'s stale *"used by `build` and `dev`"*), root `CLAUDE.md`'s "E2E visual testing" (which currently sends a reader to `drive:serve` for a question needing several verbs — after this, nothing does), `tests/e2e/CLAUDE.md` |

## Telling the user

**A one-shot's answer is data, and the status is part of the data.** Its stdout is one JSON object and
nothing else, so it pipes:

```
{"value":{"running":"connected"},"state":"attached","supervisorPid":48213}
{"value":{"running":"connected"},"state":"spawned","supervisorPid":48651}
```

`value` is the verb's answer; `state` is `attached` or `spawned`; `supervisorPid` is what ends the app
(the supervisor holding it — see "the pid is the supervisor's" above).
Three consequences, and the first is the one that removes a defect this plan was already deleting:

- **No `ok` field. The exit code is the status.** `oneShotOutcome`'s trap was an `ok: false` inside a 200,
  so reading the status exited 0 on every real failure ("What goes", above). The fix is not a better
  envelope but the convention: zero and a value on stdout, or non-zero and a message on stderr with
  **nothing on stdout at all**, so a pipe never receives half an answer.
- **Which app answered is a field, not a sentence.** `state` tells a caller whether its question acquired
  a process — the thing worth knowing — and `supervisorPid` is what ends it. A reader wanting only the answer pipes
  through `jq .value`; a reader wanting both has both, in one parse.
- **Prose goes to stderr, and only where something was left behind.** `spawned` gets one line, because a
  process is now running that was not before; `attached` gets none, because nothing changed.

```
$ abuddy drive --eval 'app.getState()' --spawn
Started the development app (pid 48651) and left it running — `abuddy dev` takes the directory back.
{"value":{"running":"connected"},"state":"spawned","supervisorPid":48651}
```

**`dev` is the other half, and there prose is the whole point** — it is a command a person watches:

```
Reclaimed the app a question started (pid 48213) and started yours.
```

That one exists for the rule every tool that leaves state behind follows: **name the state and the
inverse** (`docker compose up -d` has `down`; `git stash` says what it saved and `pop` undoes it). Here
the state is a running app and the inverse is `abuddy dev`, which is why the reclaim says what it took.

**And a line printed once is not documentation.** Forty minutes later it has scrolled away, and on this
caller it is often read by nothing at all, since the one-shot's stdout goes to an agent. So `abuddy
profiles` gains a **running** column — `supervisorPid`, `startedBy`, uptime, debug port — read from the session files,
with the four environments' data dirs listed beside the profiles, because a profile and a build's default
dir are both data dirs ([`profiles-not-instances.md`](profiles-not-instances.md)'s three-term table). It
needs no new mechanism: `profileInUse` and `recordIsStale` (`@abuddy/host/process-liveness`) already
answer liveness, and this is the `docker ps` to the start line's `docker run`.

That pair is the whole answer to "who closes this": the run says it, and the listing finds it later. An
idle reap on `development` is the alternative and is rejected in the goal doc (Decision 12) — a timer that
can take an app somebody is looking at costs more than a forgotten process does.

### The stale-build nudge

**A pack-less `dev` launches `packages/{main,renderer,api}/dist` without building, so the guard that asks
whether that is the app you just built matters here.** `scripts/drive-preflight.ts` is that guard — mtimes
over `chain-steps.ts`' declared inputs, a warning, exit 0, a nudge and never a gate — and all five
`npm run drive*` scripts already run it first.

**The gap is narrower than it looks, and the fix is an npm script rather than CLI work.** A one-shot run
the normal way (`npm run drive:eval`) has already had the preflight for this tree, and the `dev` it spawns
needs no second reading of the same files. What is uncovered is `abuddy dev` or `abuddy drive` invoked
directly in this checkout, and the new `npm run dev` — which replaces `drive:serve`, the one script in the
set that had the prefix and whose replacement would lose it. So **`dev` gets the same prefix** and the hole
closes.

**It cannot move into the CLI, and that is the reason it is a script.** `drive-preflight.ts` imports
`chain-steps.ts`; `@abuddy/cli` ships to pack authors, who have no chain and no such declaration, so a
check over it has nothing to read there. A developer in this checkout who calls the bin directly is
choosing to, which is the same bargain every other repo script makes.

### What the user is told once, in prose

`docs/public-facing/cli.md` gets this table under `drive`, as a deliverable rather than a wording pass —
the lifetime model is the thing a user gets wrong, and nothing states it today:

| What you run | The app it uses | When it closes |
|---|---|---|
| `abuddy dev`, `npm start` | starts its own | when you stop the command |
| `abuddy drive --eval` (and the other one-shots) | a live one; **fails if there is none** | it was not yours to close |
| the same, with `--spawn` | a live one, else it starts one | **it doesn't** — it stays for the next question |
| `abuddy drive <script>` | always its own | when the script finishes |
| `abuddy test` | always its own, isolated | when the run finishes |

with the one sentence that explains the halves — **a question keeps the app so the next question is cheap;
a script closes it so its result does not depend on what the last one left behind; and a question never
starts one unless you asked** — the one-app-per-data-dir rule that makes `--profile` the way to get a
second, the one-shot's output contract (`value`, `state`, `supervisorPid`, exit code), and the two ways to end an
app `--spawn` started.

## Phases

**Nothing is deleted until its replacement carries load**, which is the one thing the size of this change
asks for: a command rename, a new optional peer, 851 lines, a scaffold and five prose files is not a
single step, and the deletion is the part with no way back.

1. **The port.** `appHelper(page, resultsDir)` and `waitForAppReady(page)` extracted; `SessionPage` over a
   connected `Page`. Both paths live, neither deleted. This is the whole technical risk and it is provable
   on its own. The fixture then reaches `connected` through the extracted wait, so `npm test -- smoke` is
   what says the extraction kept its behaviour.
2. **The session file.** `dev` and `npm start` publish one; `drive` attaches when a live one is there and
   launches its own when it is not — today's behaviour, now with a fast path in front of it. `dev`'s pack
   precondition goes here, since without it `dev` cannot publish at a checkout root at all.
3. **`--spawn`.** The flag spawns `dev` detached under the lock, and that `dev` publishes the session file;
   without it a miss refuses. This is what makes a one-shot against a cold checkout cheap after the first,
   and so what `--serve` would be deleted *in favour of*.
4. **The deletion.** `--serve`, the four files and the engine's two generated scripts. Only now, because
   only now does nothing reach for them — and the runner is not in this list.

Each phase leaves the tree green and is worth landing alone. If 3 disappoints, **4 is dropped and 1–3 are
still an improvement** — which is the property that decides whether this can start before the measurement
below exists.

## Verification

**Step 0 is done** — the spike above. The remaining firing cases:

- **an attachable app → attaches and launches nothing.** Mutate it: point the session file at a dead port
  and assert the answer names it rather than silently launching a second app.
- **nothing attachable and no `--spawn` → refuses**, exits non-zero, writes **nothing to stdout** and names
  both ways forward. A gate whose subject is input, so it needs this case; and the empty stdout is the half
  to assert, since a message printed there is what breaks a pipe.
- **nothing attachable, with `--spawn` → starts its own**, and that app answers the same verb *identically*
  to an attached one. This is the case that proves one `SessionPage` serves both, so it must assert
  equality of the two answers, not merely that each works.
- **the answer's shape, both states.** `{value, state, supervisorPid}` and nothing else, `state` reading `attached`
  against a live app and `spawned` against none, with the exit code carrying success. Mutation: an `ok`
  field reintroduced alongside a non-zero exit is the trap this replaced, and the case should fail on it.
- **`test` publishes no session file**, so a `drive` run during a suite does not attach to the test's app.
- **`dev` at a checkout root publishes one**, which is the firing case for dropping the pack precondition:
  today that path throws *"No abuddy.json found"* before anything is published. Both halves, since the
  pack repo must keep building and installing — assert a pack-less run does neither and a pack run does both.
- **the engine is unreachable from `dev`** — `dev` must not import the session, or the coupling this plan
  removes comes back. `check:specifiers` is the home for that rule.
- **a verb that needs the main process** — `setViewport` refuses when attached, naming why. A gate, so it
  needs a firing case.
- **a non-development context never gets the debug flag.** The gate reads `resolveAppContext().env`, so a
  `test` or packaged context is the case that must fire. Its subject is input, so it needs one, and it is
  the single assertion standing between this design and an open port on a user's installed app.
- **`dev` reclaims a `drive` app and refuses a person's.** Both halves, because the rule is the whole of
  what makes `--spawn` safe: with `startedBy: drive` it takes the dir and says so, and with
  `startedBy: dev` it exits as today. Mutation: reclaiming unconditionally takes an app somebody opened.
  **The case has to `--spawn` and then reclaim**, rather than hand-write a session file: a fabricated file
  passes while `ABUDDY_SESSION_STARTED_BY` is never set, which is the way this silently never fires.
- **an autostarted app is attachable.** The case that fails if autostart ever routes through the fixture:
  assert the app it started carries a `debugPort` and answers a verb. `PLAYWRIGHT_TEST` would make it
  `test`, and the environment gate would refuse the port, so this is the firing case for that whole
  coupling rather than a smoke test.
- **an autostart in a pack repo has the pack installed**, which is the other half of the same decision and
  fails on the other mistake: an autostart that reproduced dev's *environment* rather than calling `dev`
  passes the case above and leaves the pack author's own pack missing. Assert its plugins are present.
- **the autostarted app outlives the one-shot that started it**, which is what `detached` plus `.unref()`
  buys and the case that fails without either: ask one question, let the process exit, assert the session
  file still names a live `supervisorPid` and a second question attaches rather than starting a second app.
- **a `dev` that dies before publishing is reported with its output**, not as a timeout. Mutation: a
  child spawned with `stdio: 'ignore'` turns a failed pack build into "no session file appeared", which is
  the failure this case exists to keep legible.
- **a never-onboarded profile answers a verb, and the run says it dismissed onboarding.** `--profile`
  pointed at a fresh dir, driven cold: without the dismissal inside `waitForAppReady`'s predicate nothing
  reaches `connected` and the verb times out. Both halves, because the printed line is what makes the
  write to a developer's dir visible rather than silent.
- **two `drive` calls at once start one app.** The lock's firing case: without the re-read after acquiring,
  both see nothing attachable and both launch. Assert one `supervisorPid`.
- **a `drive`-profile app idles out and a `development` one does not**, which is the whole of what
  `startedBy` and the dir decide between them: a scratch nobody watches goes, the app somebody may be
  looking at stays until a reclaim ends it.
- **`drive` without `playwright-core` says so.** A lazy import that throws with an install hint is a gate,
  so it needs a case that fires: the attach path with the peer absent names the package and the install,
  rather than failing as a module-not-found from inside a bundle.
- **the session file's writers are derived, not listed.** A spec that reads the declaration of what starts
  an attachable app, so a third launcher cannot arrive without one — and that asserts the population is not empty,
  since a check over nothing passes.

**Before phase 4, measure the thing being deleted.** `npm run measure` on the *end-to-end* one-shot — CLI
start, `packages:ensure`, the `playwright-core` import, connect, readiness — not the 74ms connect, which is
one step of it. The spike's numbers size the attach; nothing yet sizes what a question costs, and that is
the number that says whether `--spawn` plus attach carries `--serve`'s load.

Then: `npm run spec packages/abuddy-cli`, `npm run spec packages/abuddy-testing`, `npm run chain`. A real
`abuddy dev` with `drive --eval` against it, `npm start` with the same, and `npm test -- smoke` to prove
`test` is untouched.

## Security

**The debug port is the design's cost, and it is paid once, in one place.** `--remote-debugging-port` is
unauthenticated control of the renderer, and the renderer holds the app's API token — so this is not a
risk to note but a condition to meet:

- **The flag is computed from `resolveAppContext().env`**, never from an argv flag anyone can pass and
  never from a session file's contents. `development` only: not `test`, and not a packaged app a user installed.
  One call site, one gate, and the firing case above is what holds it.
- **`127.0.0.1` only.** Chromium binds the debug port locally by default and nothing may widen it.
- **The session file is mode-0600**, through `writePrivateFile` (`@abuddy/host/private-file`, moved there
  from `secrets/`, where it was never exported and never belonged) — the posture the app's
  own `api-token` file already has. The port is discoverable by the user and by nothing else, which is the
  same answer Chrome gives with `DevToolsActivePort` and the honest limit of it: any process running as the
  user can drive the app. That is acceptable for a development app and for nothing else, which is why the
  gate above is the load-bearing part.

## Risks

- **`setViewport`'s real resize needs the main process**, which CDP does not reach
  (`electronApp.browserWindow(page)`). The port already makes `window` optional, so attached mode leaves it
  `undefined` and the verb refuses. Resizing a window you are looking at by hand is the normal act; the
  emulated viewport would be the wrong answer there, which is the `pinsViewport` defect. It is the one capability the design
  block names as not surviving an attach, and the only one.
- **Renderer errors are weaker when attached, and must not be collapsed into log text.** `page.on('pageerror')`
  is wired at launch today, so a connection that attaches, asks and leaves sees nothing historical. The
  temptation is to resolve `takeErrors` and `readLog` to one source, the log, and lose the structured
  `[page error]`/`[console.error]` split the fixture builds — which the E2E suite *fails runs* on, and whose
  text `tests/e2e/CLAUDE.md` calls a contract. Keep both: a live listener wired on connect for errors from
  then on, the log for history, and an answer that says which it is. `SessionDeps` already separates the two.
- **`connectOverCDP` is Chromium-only and gives the existing default context**, so video, HAR and
  `newContext` are not available. None is used by any verb.
- **Two pages were live** in the spike (the app window and a second target). The predicate handles it, but
  the attach path must find the window rather than take `pages()[0]`.
- **Onboarding is dismissed on every path, by one function, and the dismissal must be *inside* the poll.**
  It is tempting to read this as a non-issue — the fixture dismisses onboarding because a test gets a fresh
  data dir, and a `dev` app is one already in use — but the paths this plan *adds* mint fresh dirs:
  `--profile drive`, `--fresh`, a first-ever `development` dir, and one after `db reset`. Those boot
  straight into onboarding with no fixture in front of them. So `waitForAppReady(page)` is the extracted
  readiness wait and all three callers use it unchanged: one `waitForFunction` for
  `running === 'connected'` that calls `window.__disableOnboardingUI()` whenever it sees `onboarding` in
  the state value. The hook is defined unconditionally (`renderer/src/main.ts:80`), so a CDP-attached page
  reaches it with no environment gate in the way.
  **In-poll rather than check-then-dismiss**, because onboarding can arrive at any point during the boot:
  `engine/index.ts:105` already learned that for `reloadWindow` and says so, where the fixture's two-step
  form (evaluate, dismiss, wait again) has a window in which onboarding appears after the check and the
  second wait hangs to its deadline.
  **No policy flag, and the cost is named rather than designed around**: attaching to an app whose owner is
  sitting in onboarding completes the wizard for them, and an autostart against a never-run `development`
  dir writes `hasOnboarded` to the developer's own data. It is a wizard rather than data, and the run says
  so on the line that already names which path it took, so it is visible rather than silent.
  **One shape note, so that the thing this forecloses stays a line rather than a rewrite.** The terminal
  state is a *parameter with a default*, not a literal buried in the predicate: `connected`, dismissing on
  the way, is what all three callers want and what the default gives them. The caller it leaves room for is
  the one who wants onboarding **left up** — driving the onboarding flow itself, which is impossible today
  and stays impossible after this plan, since the fixture dismisses unconditionally and nothing in
  `tests/e2e/` drives it. That caller does not want "refuse"; for them the onboarding screen *is* ready, so
  what they need is a different terminal state rather than an inverted boolean, and writing the wait with
  one hard-coded state is what would turn that into a rewrite. See the goal doc's Deferred.
