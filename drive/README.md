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

## One session, many questions

A script here runs and ends. To ask many things of one warm app instead, serve it:

```bash
npm run drive:serve                       # this repo
abuddy drive --serve --instance probe     # from inside a pack
```

It prints the address and a `curl` line and writes `results/engine.json` with the address and a token.
`POST /close` ends the session and shuts the app down. `docs/public-facing/cli.md` has the verbs; the
short version is `/eval` `/send` `/query` `/transact` `/wait` `/navigate` `/plugin` `/click` `/fill`
`/press` `/logs` `/set-setting` `/set-viewport` `/screenshot` `/reload` `/events` `/drops` `/errors`
`/close`, and `GET /state`, `GET /snapshot`, `GET /settings` and `GET /viewport`.

`/query` and `/transact` reach the **live** database, so a write shows up in the next read of the same session —
`abuddy db exec` cannot, because it refuses while the app holds the write lock.

`npm run drive` shows the window, so `/set-viewport` resizes the window itself; a session nobody is
watching gets Playwright's emulated viewport instead, which is what keeps a suite's layout deterministic.
Asking for a viewport in a shown window the other way would letterbox the app against the desktop.

A write does **not** show up in the UI. A plugin holds what its system sent it, and a console write goes
round every system, so nothing tells the view. `/reload` is what makes every plugin ask again; navigating
between plugins does not, because the plugin's actor survives.

`npm run drive:serve` is the same session under a config of its own (`engine.config.mts`), because the
CLI's `--serve` wants a pack directory and this repo is not one. The session file is `.mts` so that a plain
`npm run drive`, which collects `**/*.ts`, never picks it up and hangs on it.

A pack author gets the same thing from `abuddy drive`, which also takes `--instance <name>` to keep the
app's data between sessions. Everything here but this file and `playwright.config.ts` is gitignored.
