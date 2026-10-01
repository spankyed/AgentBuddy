# Post-Mortem: a pattern kill, and the silent write loss it uncovered

**Date:** 2026-09-30 (written up 2026-10-01)
**Severity:** High — user data lost from the production app, six notes reconstructed from logs, three of which
existed nowhere else
**Affected:** AgentBuddy 0.3.14, production (`~/Library/Application Support/abuddy`)

There are **two independent defects** here. One killed a running app; the other had been discarding the user's
writes for some time and was merely *revealed* by the kill. Conflating them was the first wrong turn in the
investigation, and the second is the one that still matters: **it is not fixed, and it is still happening.**

## Incident 1 — an agent killed the production app

While cleaning up a test process, I ran:

```sh
for p in $(ps -Ao pid,command | grep -E "38659-muom69tzku|dist/server.js" | awk '{print $1}'); do kill -9 "$p"; done
```

`dist/server.js` carries no path anchor. It matched the intended dev-server process **and**
`/Applications/AgentBuddy.app/Contents/Resources/app/packages/api/dist/server.js` — the production app's API
process. SIGKILL at 2026-09-30 21:26:12Z.

The mistake is not the regex. It is that a pattern match over `ps` output is **unbounded**: it describes a
shape, and anything on the machine sharing that shape is in scope, including processes that did not exist when
the command was written. A pid captured at spawn, or read from a pid file, names exactly one process.

## Incident 2 — the writes were already being thrown away

The kill was survivable on its own; LMDB is crash-safe and the database was intact (306 MB, hydrating 256,608
then 256,633 attributes across the two boots). What did not survive was everything the app had taken into
memory but never committed.

`makeLmdbAdapter` (`packages/abuddy-ears/src/lmdb/adapter.ts`) buffers writes and commits them from a
`queueMicrotask` in `scheduleFlush()`. Its failure path is:

```ts
} catch (error) {
  errorCount++;
  lastError = { op: 'flush', error };
  console.error('[LMDB] Transaction failed:', error);
  console.error('[LMDB] Error count:', errorCount);
  // Clear buffers even on error to prevent infinite retries
  ensureBuf.clear();
  entityUpdates.clear();
  entityRemovals.clear();
  arrayRewrites.clear();
  relDeletes.clear();
  relUpserts.clear();
}
```

Every buffered write is dropped. Nothing retries, nothing propagates, and **nothing tells the user**. The
in-memory engine still holds the data, so the app keeps rendering the note exactly as typed: correct on screen,
absent from disk. The divergence is invisible until something forces a hydrate from disk — which is what the
SIGKILL did.

The counter reached **3,187**. `errorCount` and `lastError` are written at five sites in that file and read by
nothing but those two `console.error` calls.

## Root cause of the failing writes — narrowed, not settled

Every failure is the same error, with no variation across thousands of samples:

```
[LMDB] Transaction failed: Error: Invalid argument
    at writeInstructions (…/node_modules/lmdb/write.js:328:4)
    at LMDBStore.remove (…/node_modules/lmdb/write.js:771:11)
  { code: 22 }
```

What is established:

- **Code 22 is `EINVAL`**, and in LMDB that is `MDB_BAD_VALSIZE` — "unsupported size of key/DB name/data".
- **Both operations fail.** Sampling the last 200 MB of `main.jsonl`: 6,156 frames through `LMDBStore.put` and
  4,872 through `LMDBStore.remove`. The earlier diagnosis named `put` alone, which pointed at value size;
  `remove` passes no value, so **the common factor is the key**, not the payload.
- **`validateKey` only checks for the `\x1F` separator**, not length. Nothing in the adapter bounds a key
  against LMDB's maximum.

That makes an over-long key the leading hypothesis, and it is testable: log the key when a flush throws, or
bound it in `validateKey`. It is not yet proven, and the entity ids involved are short, so something else may
be composing the key. Ruled out already: value length (a different message) and BigInt values (a `TypeError`).

## What was recovered

Six notes, reconstructed from 23,273 logged `UPDATE_NOTE` events in `~/Library/Logs/abuddy/main.jsonl`, which
carry the full body. Three had **no row on disk at all**; three had a stale row. Output and per-note provenance:
`/Users/spankyed/Develop/backups/abuddy-backups/notes/notes-recover-fuckup/_recovered-2026-09-30/`.

A further 47 older notes appear in the log with no row on disk. Those are most likely deliberate deletions, so
they were left alone.

## It is still happening

This is the part that makes this a live issue rather than an archive entry. Counted from the production log on
2026-10-01:

```
429 failures  2026-09-30
339 failures  2026-10-01
```

The most recent at the time of writing was `2026-10-01 03:19:49.507`, minutes before this file was written, in
a session that started long after the incident. The relaunch fixed nothing — it only reset the counter.

## Fixes

| | Status |
|---|---|
| Never kill by pattern; use a pid captured at spawn or read from a pid file | Recorded as a standing rule |
| A `PreToolUse` hook that mechanically blocks pattern kills | **Not done** — the rule is honoured by convention only |
| Stop the adapter discarding a failed write silently | **Not done** — the `catch` above is unchanged |
| Surface `errorCount` / `lastError` | **Not done** — still has no reader |
| Identify what makes a key invalid | **Not done** — narrowed to the key, see above |

## What would have caught this earlier

Nothing in the repo watches for it, and that is the lesson worth keeping. The app's own
`openAppDatabase().close()` *does* throw when writes did not reach the files:

```ts
if (errorCount > 0) throw new Error(`${errorCount} write(s) didn't reach the database in ${userDataDir}: …`);
```

So `abuddy db` would have reported it on the first command. The running app has the same information available
and acts on none of it — the one path that checks is the offline tool, which is the path a user never takes.
A counter nothing reads is the same as no counter, and this cost six notes to learn.
