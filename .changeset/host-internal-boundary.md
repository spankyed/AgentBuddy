---
'@abuddy/sdk': minor
'@abuddy/testing': minor
---

Host-only exports are the app's alone, and a pack can no longer name one.

`resolvePath` is now the `@internal` `_resolvePath`. It reached every store in the app's data dir —
the database, the run history, the user's encrypted API keys, the media store — so a pack could read
paths the `_`-prefixed accessors over it were meant to keep host-only.

**A pack keeps its own data under `getDataDirPath(name)`, which has moved to `#generated/paths`.** It
is no longer exported from `@abuddy/sdk/utils`:

```diff
-import { getDataDirPath } from '@abuddy/sdk/utils';
+import { getDataDirPath } from '#generated/paths.ts';
```

The generated one binds the pack's own id, so the directory is `pack-data/<packId>/<name>` inside the
app's data directory rather than a name joined onto a directory shared with Chromium and with every
other pack. `name` must be one directory — letters, digits, dot, dash and underscore, up to 64
characters, and not a name the filesystem reserves — so `getDataDirPath('Cache')` and
`getDataDirPath('../..')` now throw instead of resolving somewhere that was never the pack's.

`@abuddy/testing/harness` gains `testMediaPath(entityId?)`, the supported way for a pack's tests to
find the media an apply wrote, and its `resetTestData()` now clears that store along with the database
and the secrets — what the testing docs already promised per test.

Pack code naming an `_`-prefixed export now fails `abuddy build`, and in this repo
`npm run check:specifiers`.
