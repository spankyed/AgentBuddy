# EARS storage: layout, relations, queries and write durability

Status: planned, 2026-10-23. Takes up review items 6 (row reads) and 9 (durability) from the EARS API cleanup, and
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

Data today is small (the dev data dir's `ears-db` is 1.8 MB), so reading from disk is not needed now. Every step
below moves the in-memory structures to the layout the spike designed for disk (`['v', id, kind]`, adjacency
holding the far end), so a disk engine, if one is ever needed, is a storage swap behind one seam rather than a
rewrite.

## Decisions

- **Keep the in-memory read path.** Reading from disk (Step 10) waits for a measured trigger.
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
- **Durability: safe from app crashes, up to ~1 s lost on an OS crash** (decided 2026-10-23). `transactionSync`
  without a flush, `overlappingSync: false`, and a background `root.sync()` on an interval, on idle and on close;
  SQLite WAL `synchronous=NORMAL` makes the same trade. Rejected: an fsync at each `transact` (~4–8 ms each on
  macOS, on the API's main thread) and today's fsync on every commit.

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
Reduce it to Step 10's trigger and design: delete the trace, partition, router and session material; record the
durability decision as settled by Step 8; keep the key layout, the spike measurements and the lock analysis, with
the lock narrowing moved into Step 10.

### 6. Attributes by entity (review item 6)
`store` becomes `id → kind → value`. `getRow`, `destroyEntity`, `hasAttr`, `place` and the journal's undo follow;
the value index's lazy build and `getSchemaStats` walk the entities. The LMDB format (`kind␟id` keys) and hydration
are unchanged: no format bump. That leaves the disk's write amplification as it is: a create still dirties a page
per field, and the adapter's destroy still seeks once per stored kind (`storedKinds`). Flipping the keys to
`id␟kind` is a format 4 (stamp bump and an `ears-convert.ts` step), made only on request.
**Done when:** the contract suite passes; `getRow` and `destroyEntity` no longer scale with K; heap at 50k entities is
recorded. If heap grows materially, try a plain object per entity (V8 shares hidden classes across same-shaped rows;
measure deletes, which drop an object to dictionary mode).

### 7. Lazy queries
Filter and walk steps pull ids one at a time; `orderBy`, `reverse` and `distinct` collect. `first`, `exists` and
`limit` stop early; `count` doesn't allocate the set. `removals`' check on a kept builder still applies.
**Done when:** a spec counts storage reads and shows `first()` and `limit(n)` stop early; the `first()` bench case
no longer scales with the type.

### 8. Writes committed when they return (review item 9)
- Every top-level write runs as its own unit (autocommit); the journal commits to LMDB after `atCommit` checks, and a
  commit that throws runs the unit's undos and rethrows.
- The adapter writes synchronously in `transactionSync` per unit; every callback has a block body. Flags per the
  durability decision; the record store already uses `noSync`.
- `reset` clears the databases in one transaction (keeping the stamp); `import` reads the backup read-only and copies
  its rows in one transaction. The running app's store never closes.
- Removed: the buffers, `DROPPED`, `discardBuffered`, the row-by-row retry, `onWriteFailure` and the api's
  `reportDroppedWrite`, `heldForReset`, `openFailure`, `reopen` and the carried error stats.
**Done when:** a child killed (SIGKILL) right after a write returns reopens with it; a commit that fails leaves memory
unchanged and throws; reset and import work while systems keep writing; each mutation-checked. The bench shows the
cost of the implicit unit on writes outside `transact`, which today cost nothing. A write bench (creates, updates
and destroys against a 50k-entity store) records commit cost under format 3's `kind␟id` keys; it is the reading
that sizes a format 4 key flip, since a synchronous commit per write makes pages dirtied per commit the cost.

### 9. Relations first-class
- A relation table, `Map<relId, RelationRow>`, and adjacency `entity → kind → out|in → Map<relId, farEnd>`
  (insertion-ordered, so the order the contract pins holds).
- Link and unlink are O(1); a hop reads no details; `destroyEntity`, `linkedWith` and `findRelations` touch only the
  entity's own edges or the asked kind.
- Relations leave the entity index (`engineOwn`'s `Relation` filter and `persisted()`'s special case go);
  `write(relId).destroy()` still removes that relation.
**Done when:** the contract suite passes; the hub-link and hub-destroy bench cases are linear.

### 10. Reading from disk only — on a trigger
Record a boot/hydrate and heap reading on real data; agree a threshold. Past it, the disk storage is a swap behind
the storage seam (`composeEngine`, `RelationIndexReader`, added then), using the spike's key layout — by entity,
`['v', id, kind]`, which is also the layout that serves writes (see Decisions) — with the lock narrowing from the
goal. Not started before the threshold is crossed.

## Out of scope

- The typed contract (`entities.ts`, `runtime.ts`, `typed.ts`): nothing here changes a type packs see.
- `PACK_SNAPSHOT_FORMAT` and the LMDB storage format: Steps 1–9 keep format 3.
