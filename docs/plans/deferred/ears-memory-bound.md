# The engine holds the user's whole database in memory

Status: deferred by request, 2026-10-23. Raised in the review of the EARS API cleanup (`ears-engine-overhaul`).
**Measurement-gated: do not start this without step 0.** Nothing today says the bound has been reached; the
point of writing it down is to decide the size at which it would be, before a user reaches it.

## Context

The EARS engine is in memory. At boot the API opens the store and hydrates it (`store.hydrate()`,
`packages/api/src/runtime/index.ts`): every row of the database — threads and their messages, notes,
documents and collections, flows, actions, prompts, settings, the app's own state — is loaded into the engine
before any system starts, and stays there for the life of the process. Every read after that is a memory read,
which is what makes `query` synchronous and cheap.

The **run history is outside this**: it is a record store of its own (`run-history`, `openRecordStore`), never
hydrated, read and written through `services.runHistory`, and pruned to 30 days as it opens. The engine holds
nothing of runs.

So the cost that grows with use is the database, and it grows with the user's own content — a
long-lived chat history is the likeliest to dominate, since every message is a row with its attributes and its
`contains` relation. It is paid twice: as boot time (hydration reads every row) and as resident memory (each
attribute value, the entity and value indexes, the relation index).

## Step 0 — the measurement that decides whether to proceed

1. **What a row costs.** Bytes of heap per entity, per attribute and per relation, measured on the built `dist`
   (not source through a loader — `tsx`'s `keepNames` once inflated a query's cost 24x), over a synthetic
   database shaped like real data: messages with text, threads, notes.
2. **What boot costs per row.** Hydration time against row count, from the store's own hydration log lines and
   `npm run measure`. `npm run bench -w @apackdev/ears` already times a bulk load of 50k entities, 200k
   attributes and 100k relations; extend it upward rather than writing a second benchmark.
3. **What real data looks like.** The row counts of the lead developer's data dir, per entity type
   (`apack db query 'return getSchemaStats().entities'` on a copy), and how fast they grew.

From those, the size at which boot passes an agreed budget, or resident memory passes one, and how far away
that is at the observed growth rate.

| what step 0 says | what to do |
|---|---|
| the bound is years away at observed growth | close this; record the figures and the date here |
| the bound is near, and boot time is what crosses it | the cheaper half: hydrate lazily per entity type, so a type nothing has queried yet costs nothing at boot |
| resident memory is what crosses it | the larger half, below |

## The larger half, if step 0 asks for it

Keep the engine's contract — synchronous reads, units, the value index — for what is **hot**, and stop holding
what is **cold** in memory. The candidates, in increasing cost:

- **Age out old messages.** A thread's messages past some age stay on disk and are read through a reader, as
  run history is in its record store. That is the shape the run history moved to; its cost is a second way of
  reading, by indexed field rather than by `query`, which a cold message would share.
- **Per-type residency.** A type declares whether it is resident; non-resident types are read from LMDB on
  demand through the same `query` surface, made asynchronous for them. This changes the typed contract
  (`packages/apack-sdk/TYPED-EARS.md`) and every caller of a non-resident type.
- **A different store.** Out of proportion unless step 0 says the in-memory model is wrong for this app at all.

## What this does not cover

- Run history, which is already on disk (above).
- Query speed. Row reads (`getRow`, 2.3 µs on the built `dist`, because a row is assembled from every attribute
  kind) are a separate, cheaper question: a per-entity index of held kinds fixes them without changing residency.
