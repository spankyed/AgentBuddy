# `dev` holds the app, `drive` attaches to it

Compiled 2026-10-09; revised after review the same day. The spike below is run and green, so this is work
that can start.

**What the review changed**, since the text reads differently from the first version in four places: the
invariant is *any* live app rather than *the one `dev` started*, so `npm start` writes a marker too and a
miss starts one instead of launching per question — without which deleting `--serve` is a regression for a
cold checkout, which is most of what an agent asks. The work is in four phases with the deletion last. The
security posture is a section with a firing case rather than a risk bullet. And the claim that this removes
an unauthenticated port was wrong: today's port is token-guarded, and CDP is a trade, not an improvement.
The Playwright paragraph was wrong twice over and is rewritten: the runner is not what this deletes, and
neither package is a dependency of the CLI.

## Context

Three commands launch the app and each owns the one it launched:

- **`run`** is a process supervisor — `spawn(electron, [app.root], { stdio: 'ignore' })` — plus the pack
  watch/rebuild/reload loop and a Vite dev server.
- **`drive`** launches its own app through Playwright's test runner, because Electron allows one app per
  data dir and `run` already has that dir.
- **`test`** launches its own, hermetically, and must keep doing so.

`drive --serve` exists for one reason, which `CLAUDE.md` states: *"an agent asks many questions of one warm
session rather than editing and relaunching for each."* **It is a long-lived app wearing a cache's clothes**
— an HTTP server, a token, a marker in Playwright's `outputDir`, a ready-line protocol and a `/close` verb,
all so that one app survives between questions.

**The latency is the smaller half of why.** What a session holds is *state*: the data dir, where it was
navigated, what was typed into it, the entities a question created. Three questions against three fresh
apps are three different apps, which is a different thing from three questions against one — the ~3.5s is
what you notice and the state is what you were using.

So the claim is not that the cache is too expensive. It is that **the cache is a second long-lived app
beside one that already exists**, and the only reason it exists is that nothing could attach to the first.

Two facts remove that reason.

**`SessionPage` is already a port.** Thirteen methods (`engine/session.ts:37`), with `SessionDeps` taking
`page`, `api`, `takeErrors` and `readLog`. The 705 lines of verb implementation have no Playwright in them.
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

**A live app is a resource with a lifecycle, not a side effect of a command someone remembered to run.**
That is the invariant the rest follows from, and it is one step further than *"`dev` holds the app"*: once
`connectOverCDP` works, *which* command launched the app stops mattering, so what the design owes a caller
is an answer to "is one live, and if not, make one" rather than a rule about who went first.

```
an attachable app   any launcher that starts one writes the marker:
                    { debugPort, apiPort, logPath, dataDir, pid }
                    `dev` and `npm start` both do. `test` never does.

dev    spawn(electron, [root, '--remote-debugging-port=0', '--enable-logging']) + the marker.
       Serves nothing. Holds no engine. No Playwright. The supervisor it already is.

drive  live marker -> connectOverCDP -> page -> appHelper(page) -> the session verbs
       no marker   -> start one, write the marker, attach -> the same session
       One SessionPage implementation; the session cannot tell the two apart.

test   @playwright/test + _electron.launch. Unchanged, owns its app, writes no marker.
```

**`npm start` writes one too, and that is the half worth having.** `dev`'s Vite server is rooted at a
*pack*, so attaching to it gives HMR for a pack's frontend and nothing else; the host renderer still comes
from its built bundle. `npm start` is the loop that serves the renderer itself, so a marker there is what
makes "edit a `.vue` in `packages/renderer` and drive the app that just hot-reloaded it" possible at all.
Scoping the marker to `dev` would leave the app you are most often looking at the one you cannot attach to.

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

**A checkout with no pack in hand is a first-class case**, not a fallback. `drive` run where no
`abuddy.json` sits above it drives *this checkout's* app, which is how the repo's own `drive/` scripts run
and how an agent asks about the host rather than a pack. Scoping attachability to a pack's `dev` would
leave exactly that caller relaunching, so the marker is a property of an app, never of a pack.

**No marker means start one, not launch one per question.** A `drive --eval` against a cold checkout
otherwise pays a full launch *every time*, which is worse than today — `--serve` is exactly the thing that
stops that, so deleting it without this would be a regression on the caller `drive` was built for. An
autostarted app writes the marker like any other, so the second question costs the attach and nothing else.

Two things make autostart safe rather than surprising. It takes `holdExclusiveLock`
(`@abuddy/host/exclusive-lock`) and **re-reads the marker after acquiring**, because two agents asking at
once is the ordinary case here and both would otherwise launch — the same rule, and the same mechanism, as
the chain's one writer per stamp directory. And it **idles out** where a session a person started does not:
an autostarted app is a cache and should disappear, `dev` in a terminal is a session and should not, and
the marker says which it is.

**Liveness is already solved.** `recordIsStale(file, pid)` (`@abuddy/host/process-liveness`) exists for
exactly "is the process that wrote this record still there", errs toward stale, and is what the dev-server
marker and the API port file already use. A marker whose app has gone is a miss, not an error.

**Two Playwright packages, two jobs, and the runner is not one of the things that goes.**
`playwright-core` carries `chromium.connectOverCDP` and `_electron.launch` — the attach path and the
thirteen verbs. `@playwright/test` carries the runner, which is what *runs a script in `drive/`*: `drive`
is `_default.test` (`abuddy-testing/src/index.ts:673`), so every script there is a Playwright test, and the
runner is supplying script selection, per-script isolation and the worker/test fixture split, `reporter:
'list'`, the deliberate `timeout: 0`, and the `trace.zip` a failing drive run prints the `show-trace` line
for. Dropping it would mean reimplementing collection, isolation, reporting and traces, or losing them —
a replacement cost booked as a saving. `_electron.launch` is what attach replaces, not `@playwright/test`.

**Neither is a dependency of `@abuddy/cli`; both are optional peers, imported lazily.** Measured
2026-10-09 on this checkout: `playwright-core` 11M, `@playwright/test`'s own files ~24K, and the 12M beside
it is a *duplicated* `playwright-core` 1.54.1 under its `node_modules` — version skew here (root pins
1.54.1, the hoisted core is 1.59.1), not the runner's weight. **None of the three has an install script**,
so *"no postinstall and so downloads no browsers"* is not a difference between them; browsers come from
`npx playwright install`. What is true is that a published CLI should not drag either into an install of
someone who only runs `abuddy build` — and `dev` and `drive` are one binary, so a module-level rule that
`dev` never imports the session decides runtime and not install weight.

So both sit on `@abuddy/testing`, where `@playwright/test` already is (`peerDependencies`,
`peerDependenciesMeta.optional`) and where `SessionPage` and the new `cdp-page.ts` live, and the attach
path imports `playwright-core` lazily and throws with an install hint when it is absent — the pattern
`@abuddy/sdk` already uses for `typescript` and `esbuild`. `abuddy build`, `validate`, `pack` and `dev`
gain nothing to install; `drive` needs what it needs and says so. A pack that ran `init-tests` has both
already, and `resolvePlaywrightCli` continues to resolve the pack's copy rather than a bundled one.

**Attachability is declared, never inferred.** A marker is written by a launcher that means its app to be
driven, so `test` writes none and a packaged app cannot. `--attach` stops being a flag because a live
marker is the whole condition, and `--serve` stops existing because an attachable app is always there to
answer — autostarted if nobody started one.

## What goes

851 lines in four files, whole — none of them the test runner:

| File | Lines | Why |
|---|---|---|
| `abuddy-testing/src/engine/server.ts` | 455 | HTTP routing, the token header; `verb()` becomes argv dispatch |
| `abuddy-testing/src/engine/marker.ts` | 101 | and the `outputDir`-Playwright-wipes coupling with it |
| `abuddy-cli/src/app/drive-engine.ts` | 152 | the HTTP client, `ENGINE_TOKEN_HEADER`, `oneShotOutcome` |
| `abuddy-cli/src/app/drive-one-shot.ts` | 143 | ready-line accumulation, three settle paths, `/close` in a `finally` |

Plus the `--serve`/`--attach`/one-shot half of `drive.ts` (544), and:

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

**What stays, against the first draft of this plan: the runner and the script path.** `resolvePlaywrightCli`,
`drive/playwright.config.ts` and `defineDriveConfig` are untouched, because `drive <script>` goes on being a
Playwright run and nothing in the case above asks otherwise. The engine, the token, the HTTP server and the
ready-line protocol are what this deletes; the runner shares none of them, so removing it would save
nothing and cost traces, `--grep`, isolation and reporting.

Two defect *classes* go rather than move: a marker that outlives its session, and an exit code read off the
wrong field.

**The third is not a defect removed, it is a trade taken, and saying otherwise would be the one dishonest
line in this plan.** The engine's port is token-guarded today (`ENGINE_TOKEN_HEADER`; a wrong header
answers `missing or wrong x-abuddy-drive-token`). CDP is not guarded at all, and the renderer it exposes
holds the app's API token — so this swaps an authenticated local port for an unauthenticated one, and
autostart means more apps carry it. The posture that makes that acceptable is in "Security" below, and it
is a condition of the design rather than a mitigation listed after it.

## Files

| File | Change |
|---|---|
| `abuddy-cli/src/commands/run.ts` → `dev.ts` | rename; add the two argv entries and the marker write; `index.ts` `COMMANDS`/`USAGE` |
| `abuddy-cli/src/app/dev-marker.ts` | new: write/read `{ debugPort, apiPort, logPath, dataDir, pid, startedBy }` through `writePrivateFile`, `readDevToolsPort` polling `DevToolsActivePort`, and the autostart under `holdExclusiveLock` with the re-read after acquiring |
| `packages/dev-mode.js` | `npm start` writes the marker too, so the app with renderer HMR is attachable |
| `abuddy-cli/src/commands/drive.ts` | attach-or-launch; delete `--serve`, `--attach`, `takeServeFlag`. The script path and its config are untouched |
| `abuddy-testing/src/index.ts` | extract `appHelper(page, resultsDir)` as a free function the fixture calls |
| `abuddy-testing/src/engine/cdp-page.ts` | new: `SessionPage` over a connected `Page` — the same body the fixture's uses |
| `abuddy-testing/src/engine/{server,marker}.ts` | delete |
| `abuddy-cli/src/app/drive-{engine,one-shot}.ts` | delete |
| `abuddy-testing/package.json` | `playwright-core` as an optional peer beside `@playwright/test`; `@abuddy/cli`'s dependencies are unchanged |
| root `package.json` | `drive:serve` → `dev`; `drive:eval`/`:query`/`:state` keep their names |
| `drive/` scaffold | drop the two generated `.mts` files; the Playwright config stays, since scripts still run on the runner |
| prose | `abuddy-cli/CLAUDE.md` (the `run`/`drive` rows, `src/app/`, and `:14`'s stale *"used by `build` and `dev`"*), root `CLAUDE.md`'s "E2E visual testing", `docs/public-facing/cli.md`, `drive/README.md`, `tests/e2e/CLAUDE.md` |

## Phases

**Nothing is deleted until its replacement carries load**, which is the one thing the size of this change
asks for: a command rename, a new dependency, 851 lines, a scaffold and five prose files is not a single
step, and the deletion is the part with no way back.

1. **The port.** `appHelper(page, resultsDir)` extracted; `SessionPage` over a connected `Page`. Both paths
   live, neither deleted. This is the whole technical risk and it is provable on its own.
2. **The marker.** `dev` and `npm start` write one; `drive` attaches when a live one is there and launches
   its own when it is not — today's behaviour, now with a fast path in front of it.
3. **Autostart.** A miss starts an app under the lock and writes the marker. This is what makes a one-shot
   against a cold checkout cheap, and so what `--serve` would be deleted *in favour of*.
4. **The deletion.** `--serve`, the four files and the engine's two generated scripts. Only now, because
   only now does nothing reach for them — and the runner is not in this list.

Each phase leaves the tree green and is worth landing alone. If 3 disappoints, **4 is dropped and 1–3 are
still an improvement** — which is the property that decides whether this can start before the measurement
below exists.

## Verification

**Step 0 is done** — the spike above. The remaining firing cases:

- **a marker present → attaches and launches nothing.** Mutate it: point the marker at a dead port and
  assert the answer names it rather than silently launching a second app.
- **no marker → launches its own**, and the session answers the same verb identically. This is the case that
  proves one `SessionPage` serves both, so it must assert equality of the two answers, not merely that each
  works.
- **`test` writes no marker**, so a `drive` run during a test suite does not attach to the test's app.
- **the engine is unreachable from `dev`** — `dev` must not import the session, or the coupling this plan
  removes comes back. `check:specifiers` is the home for that rule.
- **a verb that needs the main process** — `setViewport` refuses when attached, naming why. A gate, so it
  needs a firing case.
- **a non-development context never gets the debug flag.** The gate reads `resolveAppContext().env`, so a
  `test` or packaged context is the case that must fire. Its subject is input, so it needs one, and it is
  the single assertion standing between this design and an open port on a user's installed app.
- **two `drive` calls at once start one app.** The lock's firing case: without the re-read after acquiring,
  both see no marker and both launch. Assert one pid.
- **an autostarted app idles out and a `dev` one does not**, which is the whole of what `startedBy` decides.
- **`drive` without `playwright-core` says so.** A lazy import that throws with an install hint is a gate,
  so it needs a case that fires: the attach path with the peer absent names the package and the install,
  rather than failing as a module-not-found from inside a bundle.
- **the marker's writers are derived, not listed.** A spec that reads the declaration of what starts an
  attachable app, so a third launcher cannot arrive unmarked — and that asserts the population is not empty,
  since a check over nothing passes.

**Before phase 4, measure the thing being deleted.** `npm run measure` on the *end-to-end* one-shot — CLI
start, `packages:ensure`, the `playwright-core` import, connect, readiness — not the 74ms connect, which is
one step of it. The spike's numbers size the attach; nothing yet sizes what a question costs, and that is
the number that says whether autostart carries `--serve`'s load.

Then: `npm run spec packages/abuddy-cli`, `npm run spec packages/abuddy-testing`, `npm run chain`. A real
`abuddy dev` with `drive --eval` against it, `npm start` with the same, and `npm test -- smoke` to prove
`test` is untouched.

## Security

**The debug port is the design's cost, and it is paid once, in one place.** `--remote-debugging-port` is
unauthenticated control of the renderer, and the renderer holds the app's API token — so this is not a
risk to note but a condition to meet:

- **The flag is computed from `resolveAppContext().env`**, never from an argv flag anyone can pass and
  never from a marker's contents. `development` only: not `test`, and not a packaged app a user installed.
  One call site, one gate, and the firing case above is what holds it.
- **`127.0.0.1` only.** Chromium binds the debug port locally by default and nothing may widen it.
- **The marker is mode-0600**, through `writePrivateFile` (`@abuddy/host/secrets`) — the posture the app's
  own `api-token` file already has. The port is discoverable by the user and by nothing else, which is the
  same answer Chrome gives with `DevToolsActivePort` and the honest limit of it: any process running as the
  user can drive the app. That is acceptable for a development app and for nothing else, which is why the
  gate above is the load-bearing part.

## Risks

- **`setViewport`'s real resize needs the main process**, which CDP does not reach
  (`electronApp.browserWindow(page)`). The port already makes `window` optional, so attached mode leaves it
  `undefined` and the verb refuses. Resizing a window you are looking at by hand is the normal act; the
  emulated viewport would be the wrong answer there, which is the `pinsViewport` defect. It is also the one
  place *"the session cannot tell the two apart"* is not true, so the design claim reads: one
  implementation, one named capability difference.
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
- **Onboarding gets simpler, not harder**: the fixture dismisses it because a test gets a fresh data dir. A
  `dev` app is one already in use, so attached mode has nothing to bypass.
