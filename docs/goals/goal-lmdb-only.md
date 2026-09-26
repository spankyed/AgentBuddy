> **Written in session** `649f226a-7f11-4e06-a3bd-faa4b7c92ffb` (Claude Code, 2026-09-17). Resume it with `claude -r 649f226a-7f11-4e06-a3bd-faa4b7c92ffb`.

```
# Goal: LMDB-only EARS — reads from disk, synchronous writes, no in-memory store

Implement docs/goals/goal-lmdb-only.md on a branch cut from the current AS/package-boundaries head (or
master once it lands). Read Background, Spike results, Decisions, Open decisions, Phases and
Constraints first. The Open decisions must be settled with the user before Phase 2; if any is still
marked open, stop and ask. Where another detail isn't specified, pick the conventional option, note it
in the final summary, and keep going. No backward compatibility in code: change signatures, move
modules, migrate every in-repo caller, test, fixture, template and doc in the same change, and fix
forward. Stored user data is the exception: it moves with a store format migration.

Finished when:
- Phases 1–7 are implemented and each meets its "Done when"; every new guard, helper or test is
  mutation-checked.
- The engine reads only from LMDB: no attribute store, entity index or relation index in memory, and
  no hydration step. Writes are committed synchronously (see Decision 3 and Open decision 1).
- PersistenceSink, the sharded router, hydrate, bulkLoadAttr/addToIndex and LmdbQuery are gone;
  services.traceStore reads through ordinary engine queries.
- Existing user data (a copy of real 0.3.14-shaped data, in a temp ABUDDY_USER_DATA_DIR) opens, is
  migrated to the new store format once, and the app boots onboarded with its flows, notes and settings.
- The ears contract suite passes against the disk engine; the disk benchmark and a flow-run benchmark
  are recorded in this doc and within the agreed tolerance.
- `npm run typecheck`, `schema:check`, `api:check` (sdk, ui, ears), `packages:build` + `packages:check`,
  `facade:check -w @app/default-setup`, and the api, sdk, ears, host, cli, default-setup and renderer
  unit suites pass.
- `npm run build`, the monorepo E2E suite, `npm run test:external-pack`,
  `npm run test:packaged-authoring` and the example pack's `abuddy test --app-root <repo>` pass.
- A final summary: phase → done/deferred, evidence, benchmark numbers, conventional choices.

Never:
- commit, stage, push or tag unless the user asks in this session. When asked, commit in logical
  chunks (conventional messages, no Co-Authored-By or session lines) with `git commit -- <paths>`,
  and check `git diff --cached` first: something outside the session stages files.
- npm publish, create GitHub releases, or trigger workflows (dry runs only).
- open, copy or modify ~/Library/Application Support/abuddy* or any real data dir; use copies in temp
  ABUDDY_USER_DATA_DIRs.
- pkill/killall Electron or node; launch the app outside the test env without an isolated
  ABUDDY_USER_DATA_DIR.
- run bare tsc on packages/preload, `npm install` in the example pack, or edit version/release
  metadata.
- change the typed EARS types' behaviour (packages/abuddy-sdk/TYPED-EARS.md) to make a call site
  compile.
- use an fsync per write, lmdb-js async `put`, or `noSync` + `useWritemap` for engine writes (see
  Spike results).
- add backward-compat shims or loosen a failing assertion instead of investigating.
```

## Background

`@abuddy/ears` (see `packages/abuddy-ears/CLAUDE.md`) keeps all data in memory and mirrors writes to LMDB:

- **Memory is the read path.**
  - `src/attribute-storage.ts` holds `store` (kind → id → value list) and `entityIndex` (type → ids).
  - `src/relation-index.ts` holds the relation index (kind → `bySource`/`byTarget` lists).
  - Relation details are the `relationDetails` attribute on relation ids.
  - Reads return live references: `getAttrs` returns the stored array, and `updateRelation` mutates the details object in place.
- **LMDB is a mirror.**
  - Writes go through a `PersistenceSink`. `src/lmdb/adapter.ts` buffers them and flushes in a microtask; a failed flush drops them.
  - `src/persistence/sharded-router.ts` routes each write to `primary` (`ears-db`) or `volatileBackup` (`ears-trace`) by the partition policy. TNodes, and relations touching them, go to the trace store.
  - At boot, `store.hydrate()` loads `primary` into memory (`src/lmdb/hydrate.ts`).
  - The trace store is never hydrated. The host's `services/trace-store.ts` reads it with `LmdbQuery`.
- **On-disk layout today** (`src/lmdb/envs.ts`, json encoding, compression on):
  - `entities`: `id` → `{ type, createdAt }`
  - `attrs`: `kind␟id␟idx` → `{ t, v }`. Only top-level Dates are wrapped; nested Dates become strings and `undefined` fields are dropped.
  - `relations`: `relId` → `{ kind, src, tgt, info, createdAt }`
  - There's no index by entity, type, attribute value, role or relation end, and no per-type counts.

The user wants **LMDB-only**: reads query LMDB directly, writes are committed synchronously, and the in-memory store, entity index and relation index leave the read path.

### What depends on memory today (survey, 2026-09-17)

- **Read APIs.** `E` = `packages/abuddy-ears/src`.
  - `query.ts` builds whole id arrays at the seed, then filters in JS: `where` (`===` only), `withRole`, `ofType`, `linksTo`. `orderBy` called `getAttr` inside the sort comparator. `limit`/`page` slice after the full set is built.
  - `qx()` with no seed lists every entity. Callers:
    - `ensure(role)` with no scope (`E/transaction.ts:89`)
    - `spawn` with `uniqueRoles`
    - `graph.leaves` with no type
    - root-flow and threads lookups (`packages/abuddy-sdk/src/repositories/flow-repository.ts:116,205`, `default-setup/src/features/threads/be/repository/index.ts:53`)
  - `query-helpers.ts`: finders are `qx(...).pickAll()`, and `countEntities` lists the whole type.
  - `entity-utils.ts`: `createEntityWithDefaults` counts the type twice on every create (short code and label).
  - `getAll(id)` loops over every attribute kind. `findRelations()` with no match returns every relation.
- **Read-your-writes inside one synchronous block.**
  - The `update` step (`default-setup/src/extensions/steps/update/runtime.ts:28-31`)
  - `tnodeRepository.updateTNodeResult`
  - notes/threads `create`
  - `appState.update` then `get`
  - `linkOne` (unlink, then add) and `ensure` (revoke, then grant)
  - the seeders' re-read after import
  - `tx(type)` writes `createdAt` first, so the entity exists mid-transaction.
- **Callers that must stay synchronous.** `qx`/`tx` are called inside xstate `assign`/`enqueueActions`:
  - logs, threads and brain flow systems
  - machine `context` factories
- **Trace session semantics.** TNodes look session-scoped only because they aren't hydrated.
  - The brain reads TNodes with `qx` (`default-setup/src/features/brain/be/repository/index.ts:101,154-176`).
  - `clearVolatileData` (`:559`) calls `tx(tNode).destroy(true)`, meaning "forget in memory, keep on disk". Its relations are still deleted on disk, which loses the TRACKED/SPAWNED links, probably a bug.
- **Data quirks.**
  - A trace relation's `relationDetails` attribute and `Relation` entity row land in `primary`, because they're routed by the relation id.
  - The adapter writes entity rows for both ends of every relation, in both stores.
  - Hydration skips relations with invalid ends, so bad rows exist on disk.
- **Hot paths that are cheap only because memory is fast.**
  - Every flow step scans all Flows to find its parent (`brain/be/repository/index.ts:343-354,422-433`).
  - The `query` step calls `buildQueryContext()` on every call (`default-setup/src/features/database/be/services/database.ts:20-48`): `getAll` for every type plus every relation.
  - Settings are read twice per log line (`logs/be/system.ts:95,122`) and inside a sort comparator (`threads/be/repository/index.ts:378`).
  - On every client connect, library runs `migrateDocumentShortCodes` and `migrateDisplayOrders`, which scan all Documents and write.
  - The database feature regenerates schema info after every transaction (`database/be/system.ts:108`).
- **Engines without LMDB.**
  - The SDK test runtime makes a new memory engine per test (`packages/abuddy-sdk/src/testing/index.ts:54-59,104`), about 600 resets per default-setup run.
  - `memoryTraceStore` (`testing/host.ts:105-124`) fakes the trace store.
  - SDK round-trip and seeder specs, and host and api specs, build raw memory engines.
  - The ears contract `persistence.spec.ts` pins sink call order.
  - The benchmark loads data with `bulkLoadAttr`.
  - `api/tests/unit/restart-persistence.spec.ts:36` asserts nothing is visible before hydrate.
- **Data lifecycle.**
  - `openAppStore` (`packages/api/src/setup/backend.ts:62-71,152`) hydrates after packs register, since the policy depends on registered types.
  - `appData.reset` does `engine.clear` → `store.reset` → `startPacks`.
  - `importBackup` reloads memory.
  - Backup export copies live env files with `fs.copy` (`packages/abuddy-host/src/backup/index.ts:43-47`), which isn't a consistent snapshot.
- **Multiple processes.** `abuddy db` opens the store offline: reads open it read-only, even while the app runs, and writes refuse while the app runs. With LMDB-only, each process sees the other's writes. See docs/archive/goals/goal-abuddy-db-cli.md.

## Spike results (2026-09-17)

Two throwaway worktrees. They may have been removed by the time this goal is picked up; everything needed is recorded here.

- **Read path:** `.claude/worktrees/ears-disk-engine`, detached at `97a566275`, uncommitted. Still there as
  of 2026-09-25, renamed from `agent-a95981166c164d641` — the files below are untracked, so they are in no
  commit, branch or stash and exist only in that directory.
  - New files: `packages/abuddy-ears/src/lmdb/disk-storage.ts` (~465 lines), `src/lmdb/disk-engine.ts`, `tests/lmdb/disk-engine.spec.ts`, `bench/engines.bench.ts`, `spike/`.
  - Edits to `relation-index.ts`, `edge-store.ts`, `relations.ts`, `query.ts`, `engine.ts` and `tests/engine/engine-under-test.ts`.
- **Write path:** was `.claude/worktrees/agent-aef0c2460682598b7/packages/abuddy-ears/spike/*.mts`, lmdb-js
  3.5.3 probes run with `npx tsx`. **That worktree is gone** as of 2026-09-25, which is what this section
  anticipated: what it found is recorded below and the probes themselves are not recoverable.

**Don't reuse the spike's code as-is.** Rewrite it on the branch, keeping the seams and the key layout below.

### Read path: a disk-only engine works
- **Contract suite:** all 104 ears specs pass with `EARS_ENGINE=disk`, including the 38 contract specs, unchanged (re-run and confirmed).
- **Other configurations:** the suite also passes with lmdb-js `cache: true`, with the value index off, with `noSync`, and with every filter forced through the index.
- **Seams it needed** (keep these):
  1. `RelationIndexReader` (`kinds`, `has`, `bySource`, `byTarget`, `all`, `stats`) on `RelationIndexStore.reader`. `query.ts` (`edgeIds`), `edge-store.ts` (`matchIds`) and `relations.ts` (`getRelationStats`) read only through it, not the index object.
  2. `composeEngine({ storage, relations, isEntityType })`, split out of `createEarsEngine`.
  3. `QueryStorage.idsWithValue(kind, value)` plus `indexThreshold`. `where(k, v)` and `withRole` use the value index when the id list has more than 64 ids, and keep order.
  4. `orderBy` reads each value once and then sorts (decorate-sort). This also sped up memory: 21.8 → 7.7 ms.
  5. `admin.relationIndex` as a getter; the disk engine builds it on access.
- **Key layout** (one env, one named database, ordered-binary array keys, msgpack values):

  | Key | Value | Serves |
  |---|---|---|
  | `['v', id, kind]` | the whole value list | `getAttr`/`getAttrs` (one get), `getAll` (one range) |
  | `['k', kind, id]` | list length | stats, `where(k)` without a value |
  | `['x', kind, value, id]` | null | value index: strings up to 256 chars, finite numbers, booleans; used by `where(k, v)` and roles |
  | `['e', type, seq]` → id, `['i', id]` → seq | | entities by type in insertion order; existence |
  | `['T', seq]`/`['t', type]`, `['AK', seq]`/`['ak', kind]`, `['RK', seq]`/`['rk', kind]` | | catalogs in first-seen order |
  | `['s', kind, src, seq]`, `['g', kind, tgt, seq]` | `[relId, otherEnd]` | relations by source / target; a hop never decodes details |
  | `['rx', kind, relId]` | seq | removal from the relation index |
  | `['m', 'seq']` | last sequence number | |

  - **Insertion-order keys** are required: the contract pins insertion order (`getAllEntityTypes`, `linksTo` order).
  - **One list per (id, kind)** matches the engine, which already rewrites whole lists (`onPutAttrArray`).
- **Benchmark.** Median of 3 runs, ms, 50k entities / 200k attributes / 100k relations. "no fsync" is `noSync` (see the write path).

  | Case | Memory | Disk | Disk, no fsync | No fsync, no value index |
  |---|---|---|---|---|
  | bulk load | 215 | 1291 | 1271 | 1117 |
  | `qx(type).where().pickAll()` | 19.5 | 48.3 | 47.4 | 53.5 |
  | 1,000 `qx(id)` | 0.21 | 0.45 | 0.49 | 0.44 |
  | 3 chained steps (`orderBy`) | 7.7 | 31.8 | 31.8 | 30.2 |
  | relation traversal | 0.0027 | 0.0177 | 0.0174 | 0.0264 |
  | `findById` ×1,000 | 1.33 | 2.82 | 2.75 | 2.44 |
  | `qx().withRole` over 50k | 5.6 | 50.9 | 48.7 | 96.0 |
  | 1,000 creates, a commit per write | 3.4 | 13,550 | 115 | 75.5 |
  | 1,000 creates, a commit per tx chain | 3.5 | 4,772 | 79.6 | 49.1 |
  | 1,000 creates, one commit | 3.8 | 24.5 | 15.0 | 9.7 |
  | `updateEntity` ×1,000, one commit | 0.37 | 15.4 | 3.75 | 3.8 |

  - **Memory use:** heap drops from 358–521 MB to 13–25 MB. `data.mdb` is 253 MB (225 MB without the value index).
  - **`cache: true`** made no difference: most reads are range scans.
- **Problems it found:**
  - **Write amplification:** a put writes 2–6 keys (value, length, value-index diff, first-time entity/type/kind keys), and updates read the old list to diff the index.
  - **Full scans:** queries with no type or index are about 9× slower.
  - **`orderBy`/`pickAll` over a whole type:** 4×.
  - **Values come back as copies:** pack code that mutates a returned array would silently stop persisting.
  - **Attribute kinds:** the memory engine registers a kind when it's merely read; the disk engine doesn't. No spec pins this.
  - **Partitions, backup and `LmdbQuery`** were not covered. **Multi-process access was covered later
    (2026-09-20), and is written up under "What this does to the two locks" below.**

### Write path: what "synchronous" can mean (lmdb-js 3.5.3, macOS, Node 23.11)

| Option | Per write | Survives process crash | Survives OS crash / power loss | Visible to reads right away |
|---|---|---|---|---|
| `putSync`/`transactionSync`, default (fsync) | 3.5–8 ms | yes | yes | yes |
| `noMetaSync`, `commitDelay`, `eventTurnBatching:false` | no gain | | | |
| `transactionSync(fn, 0x10003)` (ABORTABLE, SYNCHRONOUS_COMMIT, NO_SYNC_FLUSH) with `overlappingSync: false` | 0.015–0.026 ms | yes | loses commits since the last sync; database stays intact | yes |
| `noSync` (whole env) | 0.011–0.016 ms | yes | same as above | yes |
| `noSync` + `useWritemap` | 0.003–0.007 ms | yes | **can corrupt the database** | yes |
| `useWritemap` (sync) | 0.11–0.14 ms | yes | power loss can lose data (`msync`, no full fsync) | yes |
| async `put` | commits in batches | **no** | no | **no** (with `cache:true`: `get` yes, `getRange` no, pending removes not reflected, stale values after commit) |
| in-memory overlay + one `transactionSync` per turn | 4.2 ms with fsync | yes | yes | from the overlay |

- **Why fsync is slow:** on macOS, LMDB's sync is `F_FULLFSYNC`, which flushes the drive cache on every commit.
- **`overlappingSync`** (on by default on macOS) makes even `NO_SYNC_FLUSH` commits wait for the flush; turn it off.
- **Background sync:** `root.sync()` takes about 9 ms, off the main thread.
- **Read-your-writes:** a read after `putSync`/`transactionSync`, or inside `transactionSync`, sees the write.
- **Transaction boundaries:** a write transaction can't stay open across turns; lmdb-js only exposes callback-scoped `transactionSync`.
- **Gotcha:** `db.put()` returns a Promise. A `transactionSync` callback that returns it (`() => db.put(k, v)`) turns the transaction async: it stays open, later transactions nest inside it, and `process.exit` hangs. Callbacks must have block bodies.
- **Multiple processes:** a second process can read and write the same env with 0 errors, and each side sees the other's commits. Sync commits hold the writer lock. Processes must open the env with the same `overlappingSync` setting.

## Decisions

These are the ones settled by the spikes. The ones below them need the user.

1. **One storage, no sink.** The engine's storage is LMDB. Delete `PersistenceSink`, `noopSink`, the sharded router and its caches, `hydrateSharded`, `admin.bulkLoadAttr`/`addToIndex`, `LmdbQuery`, and the store's relation-details reader. `services.traceStore` becomes engine queries.
2. **Seams and layout from the spike.** Keep the five seams above and the key layout, including insertion-order keys and msgpack values (they keep Dates, nested values and `undefined`). Add:
   - `['c', type]` → count per type (for `countEntities`, short codes, labels);
   - `['m', 'format']` → store format version.
3. **Commit semantics.**
   - Every storage write runs in `transactionSync(fn, 0x10003)` on an env opened with `overlappingSync: false`.
   - A write is committed, and visible to every reader, when the call returns, and it survives an app crash.
   - A background `root.sync()` runs on an interval, on idle and on close, and bounds what an OS crash can lose.
   - The engine API gains `transaction(fn)`: its writes commit atomically in one `transactionSync`, and reads inside it see them. Nested calls join the outer one; track the depth in storage, since the spike found nested `transactionSync` plus `close()` could hang.
   - The whole write is one transaction: a `tx` chain's writes inside a `transaction` commit together, and outside one each storage call commits on its own.
4. **Partitions live in the storage.** One env per partition (`ears-db`, `ears-trace`). Each write picks its env by the policy. Reads that can involve a trace type read both envs: type seeds for trace types, relation lookups on trace entities, `findRelations`. Keep the history-link rule from 2026-09-17: a delete doesn't remove a trace relation that belongs to the other end.
5. **Values are copies.** Reads decode fresh values. The storage does read-modify-write where the memory engine mutated lists in place. `updateRelation` writes the new details instead of mutating them.
6. **Query planner.**
   - A query with no seed whose first step is `where(k, v)` or `withRole` seeds from the value index.
   - `qx(type).where(k, v)` walks the index set in insertion order.
   - `limit`/`page` apply before `pickAll`/`pick`.
   - Optionally, add a sorted index `['o', kind, value, seq]` for `orderBy` + `limit`.
7. **Store format migration.** At store open, before packs register, a store with no `['m', 'format']` key is migrated:
   - read the old `entities`/`attrs`/`relations` databases with today's decode rules, into the new layout, in one pass;
   - drop invalid relations, stray entity rows and trace `relationDetails`/`Relation` rows in `primary`;
   - write the format key.
   It's idempotent and tested on a copy of 0.3.14-shaped data. This is store-level, not a pack migration.
8. **Backups** use LMDB's copy API (lmdb-js `backup`/`copy`, or `mdb_env_copy` with compaction) for a consistent snapshot, not `fs.copy` on live files. Import still closes, replaces and reopens.
9. **App code fixes are part of the goal:** the hot paths listed in Background, the trace session filter, and `clearVolatileData`.

## What this does to the two locks

A data dir carries two markers that exist only because the app keeps a second copy of the data in memory.
`abuddy db`'s refusal says so outright (`abuddy-cli/src/commands/db/target.ts`):

> refused while an app runs on that data dir, **which holds the database in memory and would overwrite the
> change or lose it**

LMDB is already multi-process-safe — one writer, many readers, MVCC, the writer lock held in `lock.mdb` by
the kernel — so two processes writing *through* LMDB serialise correctly today. What cannot be protected is
the app's second copy: a tool changes the store, the app's memory is stale, and the app's next write puts
the stale version back. Decision 1 deletes that copy, and with it the reason.

**It does not delete the locks, because of Decision 8.** Import closes the env, replaces the files and
reopens; `reset` closes the envs, deletes the directories and opens again (`abuddy-ears/src/lmdb/store.ts`,
`reset()`). Those are file-level operations outside LMDB's model — the data files cannot be swapped under a
live env, and no transaction discipline covers it. So the commands split:

| `abuddy db` command | After this goal |
|---|---|
| `exec`, `repl --write`, `clear-settings --force` | **No lock needed.** Ordinary transactions; LMDB serialises them against the app's |
| `import --force`, `reset --force` | **Lock still needed.** They close the env and replace its files |

So `db-write.lock` shrinks from "any write" to "an operation that replaces the store", and `app.lock` —
whose only job is telling a tool that an app is using the data dir — shrinks to serving those same two
commands. Both survive, with a fraction of the surface.

### Measured, 2026-09-20

- **`lmdb-js`'s `tryLock`/`hasLock` are not a cross-process lock.** Two processes both got `tryLock: true`
  on one env. It coordinates `overlappingSync` within a process. It does **not** remove the native
  dependency that `goal-write-lock-advisory.md`'s Phase 0 settled on.
- **LMDB's reader table does track cross-process liveness**, but it cannot replace `app.lock`.
  `readerCheck()` returned `1` after a holder was `SIGKILL`ed, so LMDB does detect and clear slots belonging
  to dead processes. Two things rule it out anyway:
  - **No usable API.** `readerList()` prints to the C-level stdout and returns nothing; `readerCheck()`
    returns the count of *stale* slots cleared, not live ones. Nothing answers "is a live process using this
    env".
  - **It is blind exactly when the answer matters.** `app.lock` exists to cover the windows where no process
    has the env open: between the app starting and its API opening the store (`openAppStore`, in a separate
    process), and while a crashed API is being restarted (`MAX_RESTART_ATTEMPTS: 3`). Asking LMDB in those
    windows answers "nobody is here", which is the wrong answer and the reason the marker was added in the
    first place. Replacing the marker with a reader-table check would reintroduce the bug it fixed: a tool
    takes the write lock in the window, and the API then refuses to come back.

  So the marker file stays. The reader table is the right shape of mechanism — kernel-backed, no pid
  heuristic — but it can only ever speak for a database that is open, and this question outlives that.

### What it means for the advisory-lock goal

`docs/goals/deferred/goal-write-lock-advisory.md` weighs a native dependency (`fs-native-extensions`)
against the lock's correctness. It was surveyed while the lock guards every write. **If this goal lands
first, that lock guards two commands**, and the case for adding a cross-platform native dependency to an app
that also ships an npm-installed CLI gets much weaker. Neither goal should be decided on the other's stale
assumptions: settle the sequencing before either Phase 3.

## Open decisions (settle with the user before Phase 2)

1. **Durability.** Is Decision 3's guarantee acceptable: committed synchronously, safe from app crashes, synced to disk within about 1 s? The alternative is an fsync at each `transaction()` boundary (about 4–8 ms per boundary on macOS), with the same per-call commit outside boundaries. — *open*
2. **Trace sessions.** Once past runs are readable, how does the brain see only the current session's runs?
   - a `sessionId` attribute on TNodes, set per brain start and filtered in brain queries;
   - a run-root role;
   - or deleting past runs at startup (which loses history).
   Whichever is chosen, `clearVolatileData` should hide or delete deliberately, and stop losing TRACKED/SPAWNED links. — *open*
3. **Test backend.**
   - Disk everywhere: a temp env per test file, reset with `clearSync` per test, so there's one implementation.
   - Or keep the memory storage as a test-only stand-in behind the same seam: faster tests, but two implementations to keep equivalent (the contract suite would run on both).
   — *open*
4. **What the two locks narrow to.** "What this does to the two locks" establishes that `db-write.lock`
   and `app.lock` are left protecting `import` and `reset` alone. Narrow them as part of this goal, or land
   the storage change first and narrow them after?
   - **Narrow here:** the reason is deleted in the same change that deletes its cause, so nothing is left
     guarding writes it no longer needs to. It widens this goal into `abuddy db` and the Electron main
     process.
   - **Narrow after:** this goal stays about storage. The locks keep guarding every write for a while,
     which costs nothing but a refusal the user didn't need.
   Either way, `goal-write-lock-advisory.md` must not be started before this is settled: it is sized
   against a lock that guards every write. — *open*

5. **Value index scope.**
   - Index every short scalar automatically: simple, about 12% more disk, 2–6 key writes per put.
   - Or index only fields packs declare (a new `abuddy.json` entity-field option, with the facade and schema updated), plus the SDK's roles and labels.
   — *open*

## Phases

### Phase 1 — Engine seams on the memory engine
- Add `RelationIndexReader`, `composeEngine`, `QueryStorage.idsWithValue` (the memory storage answers from a scan), the `orderBy` decorate-sort, and the `admin.relationIndex` getter.
- No behaviour change.

**Done when:**
- The ears suite passes.
- The ears benchmark is within tolerance (`orderBy` faster).
- Nothing outside the index module reads `relations.index` directly; a guard spec checks it.

### Phase 2 — Disk storage
- `src/lmdb/disk-storage.ts`, with the key layout, per-type counts and format key (Decision 2).
- Commit semantics (Decision 3): `transaction()` in the engine API and on the query face, `@internal` where only the host needs it, plus the background sync with its interval and close handling.
- The value index per Open decision 4.
- A disk-engine factory in `@abuddy/ears/lmdb`.
- The contract suite runs against both engines (parametrized `engine-under-test.ts`). Rewrite the sink call-order contract as a storage contract: which keys each write touches, and that a throwing `transaction` rolls back.

**Done when:**
- The contract suite passes on disk.
- A child process killed right after a write returns (SIGKILL) reopens with the write present. The write spike's probe shows how.
- A read right after a write, and inside a `transaction`, sees it.
- Mutations fail specs: skipping the count key, committing a `tx` chain outside its `transaction`, dropping the index diff on update.

### Phase 3 — Query planner
- Decision 6.

**Done when:**
- The disk benchmark's no-seed `withRole`, `where().pickAll()` and `orderBy` cases each come within 3× of memory, or the gap is explained and accepted.
- `limit` stops reads early (a spec counts storage reads).

### Phase 4 — Partitions and trace sessions
- Decision 4, plus Open decision 2's model.
- Brain queries use the session filter.
- `clearVolatileData` behaves as decided.
- The brain's in-session reads work across a restart without showing past runs.

**Done when:**
- Store specs for routing, cross-env reads and the history-link rule pass.
- A brain spec starts a session, restarts and starts a new session, and sees only the new session's runs. The trace viewer still lists past runs.

### Phase 5 — App cut-over
- `openAppStore` opens the disk store and creates the engine on it.
- Delete hydration, the router, `PersistenceSink`, `LmdbQuery` and the store's engine reader (Decision 1).
- Port `appData.reset`, backup export/import (Decision 8), `services.traceStore` and `restart-persistence.spec`.
- Add the format migration (Decision 7).
- `abuddy db` (`@abuddy/host/database`) opens the env with the app's flags, coordinated with docs/archive/goals/goal-abuddy-db-cli.md.

**Done when:**
- The api and host suites pass.
- The app boots onboarded on a temp copy of 0.3.14-shaped data, migrated once; a second boot doesn't migrate again.
- A backup taken while the app writes restores cleanly.
- E2E passes.

### Phase 6 — Hot paths
- A flow step's parent flow comes from a relation lookup, not a scan of all Flows; the same for `createFlowTNode`.
- `buildQueryContext` builds lazily, or per query.
- The library `migrateDocumentShortCodes`/`migrateDisplayOrders` become a default-setup migration and leave `CLIENT_CONNECTED`.
- Short codes and labels use per-type counts.
- Settings reads per log line: read once per event, or keep the needed values in the system's context.
- Schema info regenerates on demand.
- Wrap each flow step, each seed import and multi-write repository commands in `transaction()`.

**Done when:**
- A new flow-run benchmark (steps per second for a 20-step flow, with 100 flows in the store) is recorded, and memory vs disk is within the tolerance agreed with the user.
- The per-step read count is independent of the number of flows (a spec counts storage reads).

### Phase 7 — Tests, tooling, docs
- The SDK test runtime and harness use Open decision 3's backend; `memoryTraceStore` goes if trace reads are engine queries.
- Port the SDK, host and api specs that build raw memory engines.
- New disk benchmark and baseline in this doc (median of 3 runs; tolerance +10% per case).
- A development-mode check that catches code mutating a returned value: freeze values returned from reads in tests.
- Update docs: ears, SDK, host and api `CLAUDE.md`, the root `CLAUDE.md` "Data layer", and `docs/public-facing` pages that describe hydration or the sink.

**Done when:**
- All suites pass.
- Test run time is within about +20% of the current run, or the user accepts the difference.
- No doc names hydration, `PersistenceSink`, the sharded router or `LmdbQuery`, except this goal.

## Constraints

- **Git:** commit, stage, push or tag only when the user asks. Use logical chunks, conventional messages and no attribution lines. Check `git diff --cached` first and commit with `git commit -- <paths>`.
- **Publishing:** never publish externally or trigger workflows.
- **User data:** never touch real data dirs; use copies in temp `ABUDDY_USER_DATA_DIR`s. E2E runs in the `abuddy-test` namespace alongside the user's apps; never pkill/killall.
- **Tooling limits:** never run bare tsc on `packages/preload`. Don't run `npm install` in the example pack. Don't edit version/release metadata.
- **Typed EARS types are change-controlled** (`packages/abuddy-sdk/TYPED-EARS.md`): run its type tests, completions check and mutation checks, and review API report diffs.
- **Published packages:** `@abuddy/ears`, `@abuddy/sdk`, `@abuddy/ui` and `@abuddy/testing` are published. No `any` in pack-facing exports, TypeScript 5.7, and run `api:update` after export changes. `lmdb` stays an optional peer of `@abuddy/ears`, loaded only by `/lmdb`.
- **Build order:** the CLI suite needs `npm run packages:build` after SDK or ears source changes. Rebuild default-setup's runtime before the api suites and E2E.
- **Migrations:** pack data migrations follow `packages/abuddy-host/src/migrations/CLAUDE.md`. The store format migration (Decision 7) is store-level, idempotent and tested on copies.
- **Tests:** investigate failing tests before changing assertions. Mutation-check every new guard, helper and test.
- **External packs are first-class:** keep the fixture packs, the example pack (`/Users/spankyed/Develop/Projects/abuddy-external/example-pack`) and `test:packaged-authoring` passing throughout.
- **LMDB writes:**
  - Every `transactionSync` callback has a block body (a callback returning a Promise makes the transaction async).
  - Envs are opened with the same flags in every process.
  - No fsync per write, no async `put`, no `noSync` + `useWritemap`.
