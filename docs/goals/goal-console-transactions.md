```
# Goal: console transaction code runs as one transaction

Implement docs/goals/goal-console-transactions.md on a branch cut after docs/goals/goal-abuddy-db-cli.md
has landed. Read Background, Decisions, Phases and Constraints first. Decision 1 must be settled before
starting; if it's still marked open, stop and ask. Where another detail isn't specified, pick the
conventional option, note it in the final summary, and keep going.

Finished when:
- Phases 1–4 are implemented and each meets its "Done when"; every new guard or test is mutation-checked.
- Console code that throws part way leaves the database exactly as it was, in memory and in the files, and
  code that returns leaves every write it made.
- `docs/public-facing/cli.md` and the console's failure message describe what the code now does.
- `npm run typecheck`, `schema:check`, `api:check` (sdk, ui), `packages:build` + `packages:check`,
  `facade:check -w @app/default-setup`, and the api, sdk, ears, host, cli, default-setup and renderer unit
  suites pass.
- `npm run build`, the monorepo E2E, `npm run test:external-pack` and `npm run test:packaged-authoring` pass.
- A final summary: phase → done, evidence, conventional choices.

Never:
- commit, stage, push or tag unless the user asks in this session.
- npm publish, create GitHub releases, or trigger workflows.
- open, copy or modify ~/Library/Application Support/abuddy* or any real data dir; run
  packages/api/scripts/db/fix-prod-upgrade.ts.
- pkill/killall Electron or node; run bare tsc on packages/preload; edit version/release metadata.
- add backward-compat shims or loosen a failing assertion instead of investigating.
```

## Background

The Database console's transaction code — the Database plugin's console, the `query` flow step's write
mode, and `abuddy db exec` / `abuddy db repl --write` — is called a transaction but isn't one.

`runTransactionCode` (`packages/abuddy-sdk/src/database-console/index.ts`) builds a function from the
user's code and calls it with the read and write helpers. Each helper writes as the code runs:

- **In memory:** the helper reaches the installed engine (`@abuddy/ears`), which updates the attribute
  store, entity index and relation index immediately. `EarsAdmin` (`src/engine.ts:83`) has no commit
  boundary and no undo: `putAttr`, `addRelation`, `dropAttr` and the rest take effect as they are called.
- **In the files:** the engine tells its persistence sink, which reaches the LMDB adapter
  (`src/lmdb/adapter.ts`). Most writes are buffered and flushed in a microtask inside one
  `entities.transactionSync` (`scheduleFlush`, :134), so a batch already lands atomically — but
  `onDestroyEntity` (:250) runs its own `transactionSync` as it is called, and `close()` (:196) flushes
  whatever is buffered whether the code succeeded or failed.

So code that throws part way leaves everything it already wrote, in memory and on disk. That is
documented today (`docs/public-facing/cli.md`, the `exec` section), the failure says so
("The writes it made before failing stand: nothing is rolled back"), and
`packages/abuddy-cli/tests/cli/db.spec.ts` pins it ("keeps what the code wrote before it threw"). This
goal replaces that behaviour with the one the name promises.

**Why it matters.** Console code is where a user repairs data by hand, usually on a database they can't
easily reconstruct. A half-applied repair is worse than a refused one: the user has no record of which
statements ran, and the failure message can only tell them that some did.

**What exists to build on:**

- The adapter already writes a whole flush inside one LMDB transaction, and `close()` reports a failed
  flush through `PersistenceErrorStats`, which `AppDatabase.close()` (`@abuddy/host/database`) turns into
  a thrown error.
- The engine is an instance (`createEarsEngine`), with a `query` face packs use and an `admin` face the
  host composition keeps, so a boundary can live on `admin` without widening what packs can reach.
- `withDatabase` (`packages/abuddy-cli/src/commands/db/target.ts`) already separates "what the command
  hit" from "what closing hit", so a rollback's own failure has somewhere to be reported.

## Decisions

1. **Where the boundary lives** (open — settle before starting):
   - **A. On the engine (`EarsAdmin.transaction(fn)`).** The engine records an undo log for the memory it
     changes and holds the sink writes until the function returns; on a throw it replays the undo log and
     drops the held writes. Every caller of the engine gets it, the console included.
   - **B. In the console runner only.** `runTransactionCode` snapshots what the code touches and puts it
     back itself. Smaller, but it has to know every helper's effect, which is the engine's job, and it
     can't undo what a helper does through a repository.
2. **Async code.** Console code may `await`. The boundary spans the whole call, awaits included, and the
   runner already awaits a returned promise. Nothing else may write through the engine while a console
   transaction is open (the app's systems keep running): **refuse** a second write during an open
   boundary rather than interleaving it, and say so.
3. **Scope.** Only the console runners take a boundary in this goal: the Database plugin's console, the
   `query` step's write mode and `abuddy db exec`/`repl --write`. Seeding, migrations and repositories
   keep writing as they do now.
4. **A rollback that fails** leaves the process's memory and the files out of step, which nothing can fix
   silently. It throws, naming both the original failure and the rollback's, and the app reports it as a
   fatal error.

## Phases

### Phase 1 — A commit boundary in the engine

- `EarsAdmin.transaction(fn)` (Decision 1A): records an undo entry per memory change, holds sink calls in
  order, and on success replays them to the sink; on a throw, undoes the memory changes in reverse and
  drops the held calls.
- Nested calls are an error, not a silent join.
- The undo log covers every `EarsAdmin` write: attributes (`putAttr`, `addAttr`, `mergeAttr`, `dropAttr`,
  `dropIf`, `updateAttr`), entities, roles and relations (`addRelation`, `updateRelation`, removals).

**Done when:** `@abuddy/ears` unit tests show a thrown function leaves the engine byte-for-byte as it was
(attributes, entity index, relation index, roles), and a returning one leaves every change; the sink sees
nothing until commit.

### Phase 2 — One LMDB transaction per commit

- The adapter buffers `onDestroyEntity` like every other write, so a commit is one `transactionSync`.
- The store flushes on commit rather than in a microtask while a boundary is open.
- A failed flush undoes the memory changes too (Decision 4), so the process never holds data the files
  don't.

**Done when:** `packages/abuddy-ears/tests/lmdb/` shows a commit whose flush fails leaves neither memory
nor files changed, and that a commit is a single transaction (one `transactionSync` call).

### Phase 3 — The console runners use it

- `runTransactionCode` wraps the code in the boundary; its failure message says the writes were rolled
  back, and `runQueryCode` is unchanged.
- `abuddy db exec` and `repl --write` report a rollback as part of the failure; `withDatabase` keeps
  reporting a close failure without hiding what the command hit first.
- The Database plugin's console shows the same.

**Done when:** `packages/abuddy-cli/tests/cli/db.spec.ts` replaces "keeps what the code wrote before it
threw" with the opposite, and a default-setup spec covers the plugin's console.

### Phase 4 — Docs

- `docs/public-facing/cli.md`: `exec` and `repl --write` are one transaction; a failure changes nothing.
- `packages/abuddy-sdk/CLAUDE.md` (`database-console/`), `packages/abuddy-ears/CLAUDE.md` (the boundary
  and the undo log) and `packages/abuddy-cli/CLAUDE.md` (`db`).
- `npm run api:update` for the SDK and `@abuddy/ears` reports.

**Done when:** no doc says a failure leaves earlier writes, and every item in "Finished when" passes.

## Constraints

- Tests and manual runs only use temp `ABUDDY_USER_DATA_DIR`s with `ABUDDY_ENV=test`; never real data
  dirs. Don't launch the app outside the test environment without an isolated data dir.
- Never commit, stage, push or tag unless the user asks in the session. Never publish or trigger workflows.
- Never use broad pkill/killall on Electron or node. Never run bare tsc on `packages/preload`. Don't edit
  version/release metadata.
- The typed EARS contract is change-controlled (`packages/abuddy-sdk/TYPED-EARS.md`): the boundary is an
  `EarsAdmin` member, not a change to what packs see.
- No backward-compat shims. No polling or hacky workarounds. Mutation-check every new guard and test;
  investigate a failure before changing an assertion.
- Pack-facing API reports stay unchanged except for additions this goal needs, recorded with
  `npm run api:update`.
