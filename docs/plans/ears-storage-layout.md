# EARS storage: layout, relations, queries and write durability

Status: Steps 1–7 done, 2026-10-23; Step 8 dropped, Step 9 as a contract change, Step 10 next. Takes up review items 6 (row reads) and 9 (durability) from the EARS API cleanup, and
supersedes the open parts of [goal-lmdb-only.md](../goals/goal-lmdb-only.md) (PR #261, closed unmerged).

## Context

The LMDB-only goal (2026-09-17) wanted the engine to read from disk. Of its reasons, run history leaving the engine
removed the unbounded part ([run-history-store.md](run-history-store.md)), and the one environment removed the
router. What is left is smaller and mostly in memory:

- **Memory runs ahead of disk.** `lmdb/adapter.ts` buffers writes and flushes them in a microtask; a row that fails is
  dropped and reported through `onWriteFailure` after the writer has moved on. The main environment opens with
  default sync, so each flush is an `F_FULLFSYNC` on the API's main thread (3.5–8 ms in the spike), and a `transact`
  pays it twice (`onUnitStart` flushes what was buffered, `onUnitEnd` commits the unit).
- **Row reads cost every attribute kind.** The store is laid out by attribute (`kind → id → value`,
  `attribute-storage.ts`), so `getRow` and `destroyEntity` ask all K kinds in the engine: `getRow` is 2.3 µs against
  55 ns for `getAttr`, paid by `pickAll`, `pickOne()` and every content apply.
- **Relations are entities.** Details are a `relationDetails` attribute on a `Relation-…` id in the entity index;
  the relation index holds relation ids only, so every hop reads details to find the far end. Its lists are arrays
  in plain objects: `includes` on add and `filter` on remove are O(degree), so linking N children to one parent is
  O(N²). `destroyEntity`, `linkedWith` and a kindless `matchIds` loop over every relation kind.
- **Queries materialise every step.** `first`, `exists`, `count` and `limit` build the whole set before answering.
- **Two smaller defects.** `orderBy` calls `getAttr` and `localeCompare` inside the comparator and compares mixed
  types as strings; `link`'s idempotence compares `info` with `JSON.stringify`, so key order makes a duplicate edge.

Real data is not small. Measured 2026-10-23 on copies converted to format 3, the built engine, 3 runs each:

| Data | Entities (relations) | Attribute values | Hydrate | Heap |
|---|---|---|---|---|
| The lead developer's production data (`abuddy/ears-db`, 292 MB) | 68.6k (45.8k) | 224k | 1.3–1.5 s | 308 MB |
| The dev data dir (`apack-dev`) | 559 (325) | 2.4k | 22 ms | 1.4 MB |

Of the production data's 171 MB of values, `Message.blocks` (thread transcripts) is 141 MB and `Artifact.content`
13 MB; everything else is under 10 MB.

## Decisions

- **The engine reads and writes LMDB; the in-memory database goes** (decided 2026-10-23). It was a prototype's
  shortcut, and an embedded store with one copy of the data is the industry norm. The deciding reasons are the pit
  of success: a write commits or throws, so memory can never run ahead of disk; data size is never a rule a feature
  author has to know (moving the transcripts out would fix today's 308 MB and leave the trap for the next large
  field); a read returns a copy, so mutating it can't change stored data unsaved; and tests run the engine the app
  runs, on an in-memory backend of the same seam. Reads cost more per operation (2–10× in the spike, before lazy
  queries), in microseconds. This drops Step 8, keeps Step 9's contract change, and starts Step 10 now.
- **Store attributes by entity, not by attribute.** Queries start from a type's ids and read `getAttr(id, kind)`
  per id, which costs the same in either layout; the value index serves `where(k, v)` and `withRole` in both. The
  only readers of the by-attribute layout are the value index's first build of a kind and the schema view, both
  rare, while row reads are the common path. A per-entity kind set beside today's layout (the review's suggestion)
  costs the same per-entity heap plus a write to maintain it, and keeps the O(K) layout too.
  On disk the case is stronger: LMDB is a copy-on-write B+tree, so a commit costs about the leaf pages it dirties.
  The app writes per entity (create a row, edit a few fields, record a step's result), and `id␟kind` keys put an
  entity's fields on one or two pages where `kind␟id` scatters them across K places. Ids are
  `Type-<base-36 time><random>` (`utils.ts`), so a new entity's keys append at the end of its type's range, a
  B+tree's cheapest write. By-attribute wins only for one field set across many rows (a migration), which is rare.
- **A write is committed when it returns.** A failure throws and leaves memory as it was, so there is nothing to
  `flush()`.
- **Durability: group commit, with durable points a caller asks for** (decided 2026-10-24, refining 2026-10-23's
  background sync). Every write commits synchronously without a sync — `transactionSync` with `NO_SYNC_FLUSH`, the
  environment opened with `overlappingSync: false` — so it is visible at once and survives the app crashing. One sync
  makes every commit before it durable, and it runs on a short timer (100–250 ms), on idle and on close. A caller that
  must survive an OS crash or power loss asks: `await durable()` resolves once everything committed so far is on disk,
  and `transact(fn, { durable: true })` syncs as that unit commits. Saving what the user will be told is saved, backup,
  export, import and the content apply ask; UI state and a run's step results don't. Postgres
  (`synchronous_commit=off` with group commit, settable per transaction), SQLite (WAL, `synchronous=NORMAL`) and RocksDB
  (WAL without sync by default) make the same trade.
  - **Why the sync is the cost, and native code doesn't change it.** On macOS the LMDB lmdb-js vendors syncs with
    `fcntl(F_FULLFSYNC)` (`mdb.c`'s `MDB_FDATASYNC`), which empties the drive's cache to the flash: 3.5–8 ms a
    commit, on the API's main thread. A commit without a sync is 0.015–0.026 ms through lmdb-js, so neither the
    binding nor a Rust adapter is where the time goes; how often a commit pays for a full sync is.
  - **What it costs, against memory** (the spike, `goal-lmdb-only.md`): 1,000 creates, a commit each, 3.4 ms in
    memory, 13,550 ms with a full sync per commit and 115 ms without; in one commit, 3.8 ms against 15.0 ms. Writes
    lose more against memory than reads (2–10×). Memory's figure is not a durable write, though: today's comparable
    cost is a full sync per microtask flush, which group commit beats for writes spread across turns. A burst in
    one turn costs a commit per write, and `transact` is what batches one.
  - **Rejected:** a full sync on every commit (today's) or at each `transact` (~4–8 ms each on macOS, on the main
    thread); background sync with no way to ask for durability, which leaves a write the user was told is saved
    exposed to an OS crash; and `noSync` with `useWritemap`, which can corrupt the database.

## Steps (in order of lift)

Each step is one commit, measured against the Step 4 baseline where it touches the engine. The ears contract suite
(`tests/engine/`) pins behaviour throughout; a pure re-layout needs no new spec.

### 1. Close PR #261
Done, 2026-10-23: closed unmerged, pointing here. Its key layout and measurements are in the goal; the spike's code
is not reused.

### 2. `link` idempotence by structural equality
`addRelation` compares `info` structurally, not by `JSON.stringify`.
**Done when:** a spec links the same edge twice with `info` keys in a different order and gets one relation;
mutation-checked.

### 3. `orderBy`: decorate-sort, collator, type order
Read each value once, then sort; compare strings with one cached `Intl.Collator`; order mixed types by type, then
value. Undefined stays last.
**Done when:** a spec pins mixed-type order; the `orderBy` bench case is faster (the spike measured 21.8 → 7.7 ms).

### 4. Benchmark cases and baseline
Done, 2026-10-23. `bench/ears.bench.ts` times the engine in `dist` (`npm run bench -w @apackdev/ears` builds first) and
gained the cases below; `bench/heap.ts` (`npm run bench:heap`) reads the heap with the same graph loaded. The bench
graph holds 8 attribute kinds, so `getRow`'s O(K) shows less here than in the app, which holds hundreds.

Baseline (mean ms, after Step 3; macOS, Node 23.11, lmdb 3.5.3, the bench's 50k entities / 200k attributes / 100k
relations):

| Case | ms |
|---|---|
| bulk load | 180.9 |
| query by type with where and pickAll | 16.6 |
| 1,000 where lookups by a unique value | 0.76 |
| 100 withRole lookups | 12.0 |
| 1,000 `query.ids(id)` lookups | 0.28 |
| query by type with 3 chained steps (`orderBy('rank')`) | 11.8 |
| relation traversal | 0.0025 |
| `orderBy` a string over 40k | 11.9 |
| 1,000 `query(type).first()` over 40k | 3,815 |
| 1,000 `getRow` | 0.72 |
| `pickAll` over 40k | 35.7 |
| 100 `linkedWith` | 52.5 |
| link 10k tasks to one project, then destroy it | 6,178 |
| 1,000 creates | 4.50 |
| 1,000 short codes | 4.43 |
| transact: 1,000 creates as one unit | 6.93 |
| heap, graph loaded | 61.3 MB |

Step 3, measured against the comparator it replaced: 3 chained steps 27.8 → 11.8 ms, `orderBy` a string 14.9 → 11.9 ms.

### 5. Rewrite `goal-lmdb-only.md`
Done, 2026-10-23: it is Step 10's design, with the spike's measurements and the lock analysis; the
trace, partition, router and session material is gone.

### 6. Attributes by entity (review item 6)
`store` becomes `id → kind → value`. `getRow`, `destroyEntity`, `hasAttr`, `place` and the journal's undo follow;
the value index's lazy build and `getSchemaStats` walk the entities. The LMDB format (`kind␟id` keys) and hydration
are unchanged: no format bump. That leaves the disk's write amplification as it is: a create still dirties a page
per field, and the adapter's destroy still seeks once per stored kind (`storedKinds`). Flipping the keys to
`id␟kind` is a format 4 (stamp bump and an `ears-convert.ts` step), made only on request.
**Done when:** the contract suite passes; `getRow` and `destroyEntity` no longer scale with K; heap at 50k entities is
recorded. If heap grows materially, try a plain object per entity (V8 shares hidden classes across same-shaped rows;
measure deletes, which drop an object to dictionary mode).

Done, 2026-10-23. Each row is a plain object, not a `Map`: measured both (mean ms against the Step 4 baseline):

| Case | Baseline | `Map` per entity | object per entity |
|---|---|---|---|
| heap, graph loaded | 61.3 MB | 85.6 MB | 67.8 MB |
| 1,000 `getRow` | 0.72 | 0.62 | 0.18 |
| query by type with where and pickAll | 16.6 | 9.6 | 7.0 |
| `pickAll` over 40k | 35.7 | 18.7 | 20.7 |
| 1,000 creates | 4.50 | 4.00 | 3.65 |
| `orderBy` a string over 40k | 11.9 | 13.3 | 13.4 |
| 3 chained steps (`orderBy('rank')`) | 11.8 | 13.4 | 13.0 |

`orderBy` is over the +10% tolerance: each `getAttr` now looks its id up in one map of every entity, relations
included (150k in the bench), where it used to look in a kind's map of 50k. Step 9 takes relations out of that
map; re-measure there. A field named `__proto__` is set as an own property (`setField`), with a spec.

### 7. Lazy queries
Filter and walk steps pull ids one at a time; `orderBy`, `reverse` and `distinct` collect. `first`, `exists` and
`limit` stop early; `count` doesn't allocate the set.
**Done when:** a spec counts storage reads and shows `first()` and `limit(n)` stop early; the `first()` bench case
no longer scales with the type.

Done, 2026-10-23. A step that keeps or walks ids is a stream: it runs a visit callback over the step before, which
answers whether to go on. Generators measured slower (relation traversal 2.3×, `linkedWith` +47%, a type's
materialisation +2 ms on 40k), so a stream is a loop over a callback. A type walk reaches only the entities in the
type when it began, so a `where` predicate that creates one doesn't extend its own walk. Against Step 6: 1,000
`query(type).first()` over 40k 3,815 → 0.25 ms, 100 `linkedWith` 49.4 → 44.7 ms, the rest within noise.

A builder is a recipe: chaining a step runs nothing, and every terminal runs the whole query against the data as it
is then. The first cut left `where(k, v)` and `withRole` after a type start, `orderBy`, `reverse`, `distinct`, the
deep walks, `query.ids` and `query.all` resolving when the step was built, and a builder freezing once a terminal had
built its set, so one builder held across writes answered from two moments; every step is now deferred, nothing
caches, and `removals`, which patched held snapshots, is gone. The cost is that a predicate runs once per entity per
terminal (`if (q.exists()) return q.pickAll()` runs it twice).

### 8. Writes committed when they return (review item 9) — dropped
With one copy of the data there is nothing to roll back, so the journal-commit rework, the adapter rewrite, the sink
and hydration go in Step 10 instead of being reworked. Two of its pieces move into Step 10's cut-over: the
durability flags, and reset and import as transactions. Until Step 10 lands, a dropped write is still reported only
through `onWriteFailure`. Its design is kept, with moving thread messages out of the engine, in
[deferred/ears-in-memory-path.md](deferred/ears-in-memory-path.md), the path not taken.

### 9. Relations are not entities — the contract change only
- A relation is a row in its own map, `Map<relId, RelationRow>`, beside today's relation index; the entity index no
  longer lists relations, and `query.all()`'s relation filter goes.
- `write(relId).destroy()` still removes that relation.
- The contract specs that pin the old behaviour change with it: `getEntitiesOfType('Relation')`,
  `getRow(relId).relationDetails`, and `query.all()` leaving relations out.
- No adjacency redesign: under Step 10 adjacency is keys, so an in-memory one would be thrown away.
**Done when:** the contract suite pins the new behaviour, so Step 10's rewrite has to pass it unchanged.

### 10. The engine on an ordered key-value seam
- `OrderedKV` (`get`, `put`, `del`, `range`, `commit`) with a contract spec, a `MemoryKV` and an LMDB backend. One
  engine on the seam: the app on LMDB, tests on `MemoryKV`. No relation-level seam above it.
- The key layout by entity (`['v', id, kind]`, and adjacency keys holding the far end), per
  [goal-lmdb-only.md](../goals/goal-lmdb-only.md).
- The durability design above: commits with `NO_SYNC_FLUSH` on an environment opened with `overlappingSync: false`;
  the group-commit sync on its timer, on idle and on close; `durable()` and `transact(fn, { durable: true })`; and
  `durable` asked for by backup, export, import, the content apply and the saves the user is told about. Reset and
  import as transactions (`replaceWith(dir)`).
- **The write path profiled before anything native.** Without a sync the spike measured 115 µs a create against a
  ~20 µs commit. The rest is write amplification: a put wrote 2–6 keys (the value, a length key, value-index diffs,
  first-time type and kind keys), an update read the old value to diff the index, and each key was a crossing from
  JavaScript into the binding. Format 4 drops the length keys; lmdb-js's batched writes take the rest. Profile a create
  and an update on format 4 (`node --cpu-prof`, self time per package), and only if the binding's crossings still
  dominate does a native layer earn its place — and then an existing binding (`heed` through napi-rs) before LMDB
  bindings of our own.
- Format 4, with a 3 → 4 step in `scripts/ears-convert.ts`. Only the developers' own data is in an older format, and
  it is converted explicitly, on a copy.
- A development check that freezes returned values in tests, since a read returns a copy.
- The host, API, CLI and SDK test runtime cut over; hydration, the sink, the adapter and the journal deleted.
**Done when:** the contract suite passes unchanged on both backends; boot, heap, the test run's time and the bench
are measured against the readings above and the Step 4 baseline, the `orderBy` regression from Step 6 included; a
write survives a child killed with SIGKILL right after it returns; a write behind `durable()` is on disk when it
resolves (the sync count observed through the backend), and one without it is not synced per commit; and the
create and update profile is recorded.
Narrowing the two locks for multi-process writes follows it.

## Out of scope

- The typed contract (`entities.ts`, `runtime.ts`, `typed.ts`): nothing here changes a type packs see.
- `PACK_SNAPSHOT_FORMAT`. Steps 1–9 keep LMDB format 3; Step 10 is format 4.
