# drive/

Scripts that drive the app — navigate, send events, read state, screenshot — for looking at what you
changed, and for letting an agent see what it built.

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

A pack author gets the same thing from `abuddy drive`, which also takes `--instance <name>` to keep the
app's data between sessions. Everything here but this file and `playwright.config.ts` is gitignored.
