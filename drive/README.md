# drive/

Scripts that drive the app — navigate, send events, read state, screenshot.

**This is mainly for an agent.** It is how a coding agent debugs and develops against the app it is
changing: open what it just built, click through it, read the state back, screenshot it, and see for
itself whether the change worked. A person can use it the same way, and `npm run drive` shows the app's
windows so you can watch — but the reason it exists is that an agent has no other way to look at a
running app.

**These are not tests.** Nothing here is collected by `npm test`, nothing gates on it, and a script that
asserts nothing is exactly right. This replaces `tests/e2e/scratch.spec.ts`, which was gitignored but sat
inside `testDir`, so the runner picked it up anyway.

```ts
// drive/notes.ts
import { drive } from '@abuddy/testing';

drive('open notes and look at it', async ({ app, appPage }) => {
  await app.navigate('notes');
  await app.screenshot('notes');
  // appPage is a Playwright Page: click, type, evaluate — whatever you need
});
```

```bash
npm run drive                    # every script here, windows shown
npm run drive -- drive/notes.ts  # just one
```

**It drives the *built* app**, loaded from `file://` — `npm run build:app` and `npm run compile` are what
put the thing you are looking at on disk, and the run warns when either has gone stale rather than
quietly showing you the previous build. So this is not the tool for a question about a dev server: nothing
here stands one up, and `npm start`'s renderer and `abuddy dev`'s pack server are not in the picture.

**Every script here is `abuddy drive`**, which is also what a pack author runs — the npm scripts are thin
calls to it, so `npm run drive -- --help` is the reference and a flag works the same from either side. With
no `abuddy.json` above it the command drives *this checkout's* app rather than a pack's, which is what
makes that possible — the checkout behind "no pack here" is the one you are standing in, which is the
same rule `abuddy drive` applies inside a pack.

**Each run gets a fresh data dir under `$TMPDIR` and throws it away**, so a script cannot touch your
development or production data, and every session starts clean. `--profile <name>` keeps a data dir
between sessions: `npm run drive -- --profile probe`.

**For an answer you want to read rather than watch**, `app.report(name, value)` writes
`drive/results/<name>.json` and prints one `[drive:report] <name> <json>` line — so a program reading the
run does not have to grep for a prefix the script invented:

```ts
drive('how long the renderer takes', async ({ app, appPage }) => {
  const nav = await appPage.evaluate(() => performance.getEntriesByType('navigation')[0].toJSON());
  await app.report('startup', nav);
});
```

## One question

No script needed — the answer comes back on stdout as the engine's own envelope, so a program can read it:

```bash
npm run drive:eval -- 'return document.title'     # {"ok":true,"value":"Agent X"}
npm run drive:state                               # {"ok":true,"value":{"running":"connected"}}
npm run drive:query -- 'return qx(EARS.Entity.Note).count()'
```

**It is a function body, not an expression**, exactly as the session's `/eval` verb is — so `return` is
required, and a body without one answers `{"ok":true}` rather than failing. One JSON line on stdout and
nothing else there; the app's output and any staleness warning go to stderr, and the exit code follows the
envelope's `ok`. Headless, so no window appears for a question.

Add `--attach` to ask a session `npm run drive:serve` already has up: ~0.35s instead of ~3.5s, and it
leaves that session running.

## One session, many questions

A script here runs and ends. To ask many things of one warm app instead, serve it:

```bash
npm run drive:serve                       # this repo
abuddy drive --serve --profile probe     # from inside a pack
```

It prints the address and a `curl` line and writes `results/engine.json` with the address and a token.
`POST /close` ends the session and shuts the app down. `docs/public-facing/cli.md` has the verbs; the
short version is `/eval` `/send` `/query` `/transact` `/wait` `/navigate` `/plugin` `/click` `/fill`
`/press` `/logs` `/set-setting` `/set-viewport` `/screenshot` `/reload` `/events` `/drops` `/errors`
`/close`, and `GET /state`, `GET /snapshot`, `GET /settings` and `GET /viewport`.

`/query` and `/transact` reach the **live** database, so a write shows up in the next read of the same session —
`abuddy db exec` cannot, because it refuses while the app holds the write lock.

`driveEngineBody({ viewport: { width, height } })` in `engine-session.mts` opens the session at a size,
applied before the first request is served; `/set-viewport` changes it afterwards.

`npm run drive` shows the window, so `/set-viewport` resizes the window itself; a session nobody is
watching gets Playwright's emulated viewport instead, which is what keeps a suite's layout deterministic.
Asking for a viewport in a shown window the other way would letterbox the app against the desktop.

A write does **not** show up in the UI. A plugin holds what its system sent it, and a console write goes
round every system, so nothing tells the view. `/reload` is what makes every plugin ask again; navigating
between plugins does not, because the plugin's actor survives.

`npm run drive:serve` is the same session under a config of its own (`engine.config.mts`), because the
CLI's `--serve` wants a pack directory and this repo is not one. The session file is `.mts` so that a plain
`npm run drive`, which collects `**/*.ts`, never picks it up and hangs on it.

A pack author gets the same thing from `abuddy drive`, which also takes `--profile <name>` to keep the
app's data between sessions. In a pack everything here but this file and `playwright.config.ts` is
gitignored; this directory also tracks the serving pair, which `drive/.gitignore` negates, so the
repo's own copies are typechecked and are chain inputs.

Both configs are calls to `@abuddy/testing/playwright` — `defineDriveConfig` and `defineEngineConfig` —
so a setting lives in the package rather than going stale in a copy here. The engine's four handshake
settings cannot be overridden at all; the rest take an argument.
