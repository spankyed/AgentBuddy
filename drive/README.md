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

No script needed, and no session to stand up: a question is asked of the app `npm run dev` is holding, over
the debug port that app published.

```bash
npm run dev                                       # one terminal: holds the app
npm run drive:state                               # another: 0.9s
npm run drive:eval -- 'return document.title'     # {"value":"Agent X","state":"attached",…}
npm run drive:query -- 'return qx(EARS.Entity.Note).count()'
```

**It is a function body, not an expression** — so `return` is required, and a body without one answers no
value rather than failing. One JSON object on stdout and nothing else there: `value` is the answer, `state`
is `attached` or `spawned`, `startedBy` says whose app answered and `supervisorPid` is what ends it. The
app's output and any staleness warning go to stderr, and the exit code is the status — 0 with a value, 3
when no app is running, 1 when the verb failed. Headless, so no window appears for a question.

**With no app running it exits 3 and says so**, rather than starting one: a question should not acquire a
process nobody asked for. `--spawn` is how you ask, and the app it starts stays up, so a cold checkout
costs one flag on the first question and an attach on every one after.

```bash
npm run drive:state -- --spawn                    # 3.3s: starts the app, answers, leaves it running
npm run drive:state                               # 0.9s from then on
```

`abuddy profiles` says which data dirs have a live app and who started it, which is where a forgotten one
is found. `abuddy dev` takes the directory back from an app a question started.

## The verbs

`docs/public-facing/cli.md` has them all; the short version is `/eval` `/send` `/query` `/transact`
`/wait` `/navigate` `/plugin` `/click` `/fill` `/press` `/logs` `/set-setting` `/set-viewport`
`/screenshot` `/reload` `/events` `/drops` `/errors`, and `state`, `snapshot`, `settings` and `viewport`.
The three the npm scripts expose are the three an agent reaches for most.

`/query` and `/transact` reach the **live** database, so a write shows up in the next read —
`abuddy db exec` cannot, because it refuses while the app holds the write lock.

A write does **not** show up in the UI. A plugin holds what its system sent it, and a console write goes
round every system, so nothing tells the view. `/reload` is what makes every plugin ask again; navigating
between plugins does not, because the plugin's actor survives.

An attached session has no window of its own, so a viewport it sets is Playwright's emulated one. A script
run, which shows the window, resizes the window itself — asking for a viewport there the other way would
letterbox the app against the desktop.

A pack author gets the same thing from `abuddy drive`, which also takes `--profile <name>` to keep the
app's data between sessions. In a pack everything here but this file and `playwright.config.ts` is
gitignored.

`playwright.config.ts` is a call to `@abuddy/testing/playwright`'s `defineDriveConfig`, so a setting lives
in the package rather than going stale in a copy here.
