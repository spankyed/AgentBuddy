---
'@abuddy/sdk': minor
'@abuddy/testing': minor
---

Host-only exports are the app's alone, and a pack can no longer name one.

`resolvePath` is now the `@internal` `_resolvePath`. It reached every store in the app's data dir —
the database, the run history, the user's encrypted API keys, the media store — so a pack could read
paths the `_`-prefixed accessors over it were meant to keep host-only. A pack keeps its own data
under `getDataDirPath(name)`, which is unchanged.

`@abuddy/testing/harness` gains `testMediaPath(entityId?)`, the supported way for a pack's tests to
find the media a seed wrote, and its `resetTestData()` now clears that store along with the database
and the secrets — what the testing docs already promised per test.

Pack code naming an `_`-prefixed export now fails `abuddy build`, and in this repo
`npm run check:specifiers`.
