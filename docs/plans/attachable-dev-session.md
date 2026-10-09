# `dev` holds the app, `drive` attaches to it

Compiled 2026-10-09. The spike below is run and green, so this is work that can start.

## Context

Three commands launch the app and each owns the one it launched:

- **`run`** is a process supervisor — `spawn(electron, [app.root], { stdio: 'ignore' })` — plus the pack
  watch/rebuild/reload loop and a Vite dev server.
- **`drive`** launches its own app through Playwright's test runner, because Electron allows one app per
  data dir and `run` already has that dir.
- **`test`** launches its own, hermetically, and must keep doing so.

`drive --serve` exists for one reason, which `CLAUDE.md` states: *"an agent asks many questions of one warm
session rather than editing and relaunching for each."* **It is a cache for an expensive launch** — an HTTP
server, a token, a marker in Playwright's `outputDir`, a ready-line protocol and a `/close` verb, all to
avoid paying ~3.5s of Electron boot per question.

Two facts make the cache unnecessary.

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

```
dev    spawn(electron, [root, '--remote-debugging-port=0', '--enable-logging'])
       + a marker: { debugPort, apiPort, logPath, dataDir, pid }
       Serves nothing. Holds no engine. No Playwright. The supervisor it already is.

drive  marker present -> connectOverCDP -> page -> appHelper(page) -> the session verbs
       no marker      -> _electron.launch -> the same session
       One SessionPage implementation; the session cannot tell the two apart.

test   @playwright/test + _electron.launch. Unchanged, owns its app, writes no marker.
```

**`playwright-core` is the dependency, not `@playwright/test`.** It carries `chromium.connectOverCDP` and
`_electron.launch`, has no postinstall and so downloads no browsers, and is 11MB installed (checked
2026-10-09). The test *runner* — `test()`, fixtures, projects, `testMatch`, `outputDir`, workers — is what
`drive` drops; the `Page` API, where all thirteen verbs live, is what it keeps. `bundle-package.ts` refuses
an external it cannot find in `dependencies`, so this is a declared dependency of `@abuddy/cli`.

**Attaching is never implicit machine state.** Only `dev` writes a marker, so "attachable" is a property a
dev session opts into. `--attach` stops being a flag because a marker's presence is the whole condition, and
`--serve` stops existing because every verb is a cheap one-shot.

## What goes

851 lines in four files, whole:

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
- **The Playwright test runner in `drive`** — `resolvePlaywrightCli`, `drive/playwright.config.ts`,
  `engine.config.mts`, `engine-session.mts`, `defineDriveConfig` ignoring the session, the
  `.mts`-versus-`**/*.ts` glob accident, `DriveScaffold.keptStale`.
- **`playwright-config.spec.ts`'s string comparison** — a gate that exists only because the client and the
  server live in different packages.

Three defect *classes* go rather than move: an unauthenticated port, a marker that outlives its session, and
an exit code read off the wrong field.

## Files

| File | Change |
|---|---|
| `abuddy-cli/src/commands/run.ts` → `dev.ts` | rename; add the two argv entries and the marker write; `index.ts` `COMMANDS`/`USAGE` |
| `abuddy-cli/src/app/dev-marker.ts` | new: write/read `{ debugPort, apiPort, logPath, dataDir, pid }`, and `readDevToolsPort` polling `DevToolsActivePort` |
| `abuddy-cli/src/commands/drive.ts` | attach-or-launch; delete `--serve`, `--attach`, `takeServeFlag`, the scaffolded configs |
| `abuddy-testing/src/index.ts` | extract `appHelper(page, resultsDir)` as a free function the fixture calls |
| `abuddy-testing/src/engine/cdp-page.ts` | new: `SessionPage` over a connected `Page` — the same body the fixture's uses |
| `abuddy-testing/src/engine/{server,marker}.ts` | delete |
| `abuddy-cli/src/app/drive-{engine,one-shot}.ts` | delete |
| `abuddy-cli/package.json` | `playwright-core` as a dependency |
| root `package.json` | `drive:serve` → `dev`; `drive:eval`/`:query`/`:state` keep their names |
| `drive/` scaffold | drop the two generated `.mts` files and the Playwright config |
| prose | `abuddy-cli/CLAUDE.md` (the `run`/`drive` rows, `src/app/`, and `:14`'s stale *"used by `build` and `dev`"*), root `CLAUDE.md`'s "E2E visual testing", `docs/public-facing/cli.md`, `drive/README.md`, `tests/e2e/CLAUDE.md` |

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

Then: `npm run spec packages/abuddy-cli`, `npm run spec packages/abuddy-testing`, `npm run chain`. A real
`abuddy dev` with `drive --eval` against it, and `npm test -- smoke` to prove `test` is untouched.

## Risks

- **`setViewport`'s real resize needs the main process**, which CDP does not reach
  (`electronApp.browserWindow(page)`). The port already makes `window` optional, so attached mode leaves it
  `undefined` and the verb refuses. Resizing a window you are looking at by hand is the normal act; the
  emulated viewport would be the wrong answer there, which is the `pinsViewport` defect.
- **`--remote-debugging-port` is unauthenticated renderer RCE on localhost.** `127.0.0.1`, development
  environment only, never for `test` and never for a packaged app a user installed. This is the reason only
  `dev` writes a marker, and the reason the flag must be gated on the resolved environment rather than on a
  CLI flag anyone can pass.
- **Renderer errors are weaker when attached.** `page.on('pageerror')` is wired at launch today, so a
  one-shot that connects, asks and leaves sees nothing historical. The spike shows uncaught errors are
  already in the app's log through electron-log, and `console.error` arrives under `--enable-logging` — so
  `takeErrors` and `readLog` read one source, the log `dev` owns. What is lost is the structured
  `[page error]`/`[console.error]` split the fixture builds; attached, it is log text.
- **`connectOverCDP` is Chromium-only and gives the existing default context**, so video, HAR and
  `newContext` are not available. None is used by any verb.
- **Two pages were live** in the spike (the app window and a second target). The predicate handles it, but
  the attach path must find the window rather than take `pages()[0]`.
- **Onboarding gets simpler, not harder**: the fixture dismisses it because a test gets a fresh data dir. A
  `dev` app is one already in use, so attached mode has nothing to bypass.
