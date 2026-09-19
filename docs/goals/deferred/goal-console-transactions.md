> **Written in session** `a201fabb-c391-462c-a3b6-f423acba509a` (Claude Code, 2026-09-17). Resume it with `claude -r a201fabb-c391-462c-a3b6-f423acba509a`.

```
# Goal: console transaction code runs as one transaction

Implement docs/goals/goal-console-transactions.md on a branch cut from master after
goal-abuddy-db-cli.md lands. Read Background, Decisions, Phases and Constraints first. Decisions are
final: implement them, don't reopen them or stop to ask. The Open decisions must be settled with the
user before Phase 1; if any is still marked open, stop and ask.
Where a detail isn't specified, pick the conventional option, note it in the final summary, and keep
going. No backward compatibility in code: change signatures, move modules, migrate every in-repo caller,
test, fixture, template and doc in the same change, and fix forward. Stored user data is the exception:
it moves with migrations.

Finished when:
- Phases 1–4 are implemented and each meets its "Done when"; every new guard, helper or test is
  mutation-checked.
- Console code that throws leaves the database as it was, in memory and in the files; code that returns
  leaves every write it made; a commit reaches the files in one LMDB transaction.
- No doc or message says a failed console transaction keeps the writes it already made:
  docs/public-facing/cli.md, runTransactionCode's failure, and the Database plugin's console agree.
- npm run typecheck, schema:check, api:check (sdk, ui), packages:build + packages:check,
  facade:check -w @app/default-setup, and the api, sdk, ears, host, cli, default-setup and renderer unit
  suites pass.
- npm run build, the monorepo E2E, npm run test:external-pack and npm run test:packaged-authoring pass.
- A final summary: phase → done/deferred, evidence, and the conventional choices made.

Never:
- commit, stage, push or tag unless the user asks in this session. When asked, commit in logical
  chunks (conventional messages, no Co-Authored-By or session lines) with `git commit -- <paths>`,
  and check `git diff --cached` first: something outside the session stages files.
- npm publish, create GitHub releases, or trigger workflows (dry runs only).
- open, copy or modify ~/Library/Application Support/abuddy* or any real data dir.
- pkill/killall Electron or node; launch the app outside the test env without an isolated
  ABUDDY_USER_DATA_DIR.
- run bare tsc on packages/preload, `npm install` in the example pack, or edit version/release
  metadata.
- change the typed EARS types' behaviour (packages/abuddy-sdk/TYPED-EARS.md) to make a call site compile.
- add backward-compat shims or loosen a failing assertion instead of investigating.
- give pack code a way to open or hold a transaction: the boundary is host-side (Decision 3).
```

## Background (2026-09-17, at 9e5805cbd)

The Database console's transaction code is called a transaction but isn't one. It runs in three places,
all through one runner:

- the Database plugin's console (`packages/default-setup/src/features/database/be/execute/transaction.ts`);
- the `query` flow step in write mode (`packages/default-setup/src/extensions/steps/query/runtime.ts`);
- `abuddy db exec` and `abuddy db repl --write` (`packages/abuddy-cli/src/commands/db/code.ts`, `repl.ts`).

`runTransactionCode` (`packages/abuddy-sdk/src/database-console/index.ts:123`) builds a function from the
user's code and calls it with the read and write helpers. Each helper writes as the code runs:

- **In memory:** a helper reaches the installed engine (`@abuddy/ears`), which updates the attribute
  store, entity index and relation index immediately. `EarsAdmin` (`packages/abuddy-ears/src/engine.ts:83`)
  has no commit boundary and no undo: `putAttr`, `addAttr`, `mergeAttr`, `dropAttr`, `dropIf`,
  `updateAttr`, `addRelation`, `updateRelation` and the removals take effect as they are called.
- **In the files:** the engine tells its persistence sink, which reaches the LMDB adapter
  (`packages/abuddy-ears/src/lmdb/adapter.ts`). Most writes are buffered and flushed in a microtask inside
  one `entities.transactionSync` (`scheduleFlush`, :134), so a batch already lands atomically. Two paths
  don't go through it: `onDestroyEntity` (:250) opens its own `transactionSync` as it is called, and
  `close()` (:196) flushes whatever is buffered, whether the code succeeded or failed.

So code that throws part way leaves everything it wrote before the throw, in memory and on disk. That is
the documented behaviour today — `docs/public-facing/cli.md` (the `exec` section) describes it, the
failure message says "The writes it made before failing stand: nothing is rolled back", and
`packages/abuddy-cli/tests/cli/db.spec.ts` pins it ("keeps what the code wrote before it threw: there is
no rollback"). This goal replaces that behaviour with the one the name promises, and those three say the
opposite afterwards.

**Why it matters.** Console code is where a user repairs data by hand, on a database they usually can't
reconstruct: `abuddy db` exists for the case where the app won't start. A half-applied repair is worse
than a refused one, because nothing records which statements ran.

**What exists to build on:**

- The adapter already writes a whole flush inside one LMDB transaction, counts a failed write
  (`errorCount`, `lastError`) and reports it through `PersistenceErrorStats`, which
  `AppDatabase.close()` (`packages/abuddy-host/src/database/open.ts`) turns into a thrown error.
- The engine is an instance (`createEarsEngine`) with a `query` face packs use and an `admin` face the
  host composition keeps (`packages/abuddy-host/src/services/index.ts`), so a boundary can live on
  `admin` without widening what packs reach.
- The store holds writes already, for one case: `LmdbStore.reset()` keeps them while the files are
  replaced (`packages/abuddy-ears/src/lmdb/store.ts`, `heldForReset`). A commit boundary is the same
  shape with a different trigger.
- `withDatabase` (`packages/abuddy-cli/src/commands/db/target.ts`) separates what the command hit from
  what closing hit, so a rollback's own failure has somewhere to be reported.

## Decisions

1. **The console runners take the boundary; nothing else changes.** Seeding, migrations, repositories and
   system code keep writing as they do now. The three call sites above are the scope.
2. **A commit is one LMDB transaction.** Every write the code made reaches the files together or not at
   all, which means `onDestroyEntity` is buffered like the rest (Phase 2).
3. **The boundary is host-side.** It's an `EarsAdmin` member, not part of the pack-facing `qx`/`tx`
   surface: packs can't open, hold or nest one, and the published SDK reports don't gain a way to.
   `@abuddy/sdk/database-console` reaches it through the engine the host binds.
4. **A rollback that fails is fatal.** Memory and files out of step is a state nothing can repair
   silently: it throws, naming both the original failure and the rollback's, and the app reports it as a
   fatal error rather than carrying on.
5. **The name stops lying.** After this goal `runTransactionCode`'s failure says the writes were rolled
   back, `cli.md` says a failure changes nothing, and `db.spec.ts` asserts the database is untouched.

## Open decisions (settle with the user before Phase 1)

1. **Where the undo lives.** — *open*
   - **A. In the engine (`EarsAdmin.transaction(fn)`).** The engine records an undo entry per memory
     change and holds the sink calls until the function returns; on a throw it replays the undo in
     reverse and drops the held calls. Every host caller could use it, and the undo sits with the code
     that knows each write's effect. Costs: `EarsAdmin` grows a member, and every write path has to
     record its inverse.
   - **B. In the console runner.** `runTransactionCode` snapshots what the code touches and puts it back
     itself. Smaller and contained, but it has to know every helper's effect (including what a helper
     does through a repository), which is the engine's job, and a helper added later silently escapes it.
2. **What other writers do while a console transaction is open.** — *open*
   The app's systems keep running, so a flow can write while a console transaction is open.
   - **A. Refuse.** A write from anywhere else throws while a boundary is open, naming the console. Keeps
     the undo log sound; a background write fails where it would have succeeded.
   - **B. Interleave.** Other writers pass through to the engine and the sink as they do now. Nothing
     fails, but a rollback then undoes only the console's entries, and the commit's single transaction
     carries another writer's rows.
   The CLI is single-writer either way (`abuddy db` holds the data dir's write lock and refuses to run
   while the app does), so this decides the app's console only.

## Phases

### Phase 1 — A commit boundary in the engine

- Add the boundary chosen in Open decision 1, with the semantics of Decision 1: writes inside the
  function change memory as they do now, the sink calls are held in order, and on return they are
  replayed to the sink; on a throw the memory changes are undone in reverse and the held calls dropped.
- Cover every `EarsAdmin` write: attributes (`putAttr`, `addAttr`, `mergeAttr`, `dropAttr`, `dropIf`,
  `updateAttr`), entities and roles, and relations (`addRelation`, `updateRelation`, removals).
- Nested boundaries throw, rather than silently joining the outer one.
- The boundary spans `await`s, since console code may await and the runner awaits a returned promise.
  Apply Open decision 2 to writes from elsewhere while it's open.

**Done when:** `packages/abuddy-ears/tests/` shows a function that throws leaves the engine as it was
(attributes, entity index, relation index, roles) and one that returns leaves every change; the sink
receives nothing until the boundary commits. Mutation: dropping the undo replay, or committing the held
calls on a throw, fails those specs.

### Phase 2 — One LMDB transaction per commit

- Buffer `onDestroyEntity` like the other writes, so a commit is a single `transactionSync`
  (`adapter.ts`, Decision 2).
- The store flushes on commit rather than in a microtask while a boundary is open (`store.ts`).
- A failed flush undoes the memory changes too (Decision 4), so the process never holds data the files
  don't, and the error names both failures.

**Done when:** `packages/abuddy-ears/tests/lmdb/` shows a commit whose flush fails leaves neither memory
nor files changed, and that a commit opens one transaction. Mutation: flushing per write, or keeping the
memory changes after a failed flush, fails those specs.

### Phase 3 — The console runners use it

- `runTransactionCode` wraps the code in the boundary and its failure says the writes were rolled back
  (Decision 5); `runQueryCode` is unchanged.
- `abuddy db exec` and `repl --write` report a rollback as part of the failure; `withDatabase` keeps
  reporting a close failure without hiding what the command hit first.
- The Database plugin's console and the `query` step's write mode inherit it through the runner.

**Done when:** `packages/abuddy-cli/tests/cli/db.spec.ts` asserts the database is untouched after failing
console code (replacing "keeps what the code wrote before it threw"), a default-setup spec covers the
plugin's console, and `packages/abuddy-sdk/tests/database-console/` covers the runner. Mutation: running
the code outside the boundary fails all three.

### Phase 4 — Docs and reports

- `docs/public-facing/cli.md`: `exec` and `repl --write` are one transaction; a failure changes nothing.
- `packages/abuddy-sdk/CLAUDE.md` (`database-console/`), `packages/abuddy-ears/CLAUDE.md` (the boundary,
  the undo log and the single-transaction commit), `packages/abuddy-cli/CLAUDE.md` (`db`) and
  `packages/default-setup/CLAUDE.md` if it describes the console's behaviour.
- `npm run api:update` for `@abuddy/sdk` and `@abuddy/ears`.

**Done when:** no doc or message says a failure keeps earlier writes, and every item in "Finished when"
passes.

## Deferred

- **Transactions for pack code.** Packs write through `tx` and repositories, with no boundary; giving
  them one is a pack-facing API change with its own design (Decision 3 keeps this goal host-side).
- **Transactions across the bus.** A system's handler writing in several steps is not one transaction
  either. Out of scope.

## Constraints

- Tests and manual runs only use temp `ABUDDY_USER_DATA_DIR`s with `ABUDDY_ENV=test`; never real data
  dirs. Don't launch the app outside the test environment without an isolated data dir, and keep E2E in
  the `abuddy-test` namespace.
- Commits only on request, in logical chunks, conventional messages, no attribution lines, `git commit --
  <paths>` after checking `git diff --cached`.
- No publishing, releases or triggered workflows. No broad pkill/killall on Electron or node. No bare
  `tsc` on `packages/preload`. No edits to version or release metadata.
- The typed EARS types are change-controlled (`packages/abuddy-sdk/TYPED-EARS.md`): the boundary is an
  `EarsAdmin` member, and `qx`/`tx` behave as they do today.
- Published packages expose no `any`, keep the TypeScript floor, and need `api:update` after an export
  change.
- Build order: `packages:build` before the CLI suite, default-setup's runtime before the api suites and
  E2E.
- No backward-compat shims. No polling or hacky workarounds. Mutation-check every new guard and test, and
  investigate a failure before changing an assertion.
- External packs stay first-class: the fixture packs, the example pack and `test:packaged-authoring` keep
  passing.
