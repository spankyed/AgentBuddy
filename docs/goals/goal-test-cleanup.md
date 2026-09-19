# Goal: tests that fail only when behaviour breaks

> **Written in session** `ce3c21bc-00a5-4105-bf57-ff442b38b8a0` (Claude Code, 2026-09-19). Resume it with `claude -r ce3c21bc-00a5-4105-bf57-ff442b38b8a0`.

```
# Goal: tests that fail only when behaviour breaks

Implement docs/goals/goal-test-cleanup.md on a branch cut from master. Read Background, Decisions,
Phases and Constraints first. Decisions are final: implement them, don't reopen them or stop to ask.
Where a detail isn't specified, pick the conventional option, note it in the final summary, and keep
going.

This goal deletes and rewrites tests. Before deleting a test, read it and confirm it matches the
Decisions' delete criteria; a test that turns out to cover behaviour nothing else covers is kept, and
the difference goes in the final summary. The audit was made at 1dd69172e and the code has moved since:
an item whose test no longer exists is skipped, not reconstructed.

Finished when:
- Phases 1–7 are implemented and each meets its "Done when".
- No test in the repo fails only because a name removed by an earlier refactor came back, a message was
  reworded, a call count changed, or a generated file's formatting changed, except where the Decisions
  keep that check.
- The deleted files no longer exist: packages/abuddy-sdk/tests/designations/pack-facing.spec.ts,
  packages/abuddy-ears/tests/no-engine-state-access.spec.ts,
  packages/default-setup/tests/unit/service-registry.spec.ts,
  packages/default-setup/tests/unit/generated-entries-import.spec.ts.
- Every doc that cited a deleted guard describes the code as it is (the root CLAUDE.md sentence about
  reaching engine state through `admin`, and anything else `git grep` finds for a deleted file's name).
- Every guard left in the repo has been shown to fail on an edit someone could plausibly write today,
  *and* to be the thing that catches it — not a second opinion behind tsc or an allowlist.
- Every allowance left in a guard has been shown to be load-bearing: delete it, watch the guard fail,
  put it back.
- Each phase's package suite passes, and the full list passes at the end: npm run typecheck,
  schema:check, api:check (sdk, ui, ears), packages:build + packages:check, compile + facade:check,
  the api, sdk, ears, host, cli, default-setup and renderer unit suites, npm run build, npm test (E2E),
  test:external-pack and test:packaged-authoring.
- The suites are no slower than before the goal: record `Duration` per suite before Phase 1 and after
  Phase 7 in the Outcome.
- A final summary: phase → done/deferred, evidence, the tests kept against the audit and why, and the
  conventional choices made.

Commit as you go:
- Commit each phase when its "Done when" holds and its suite is green — not once at the end.
  Conventional message, no Co-Authored-By or session lines, `git commit -- <paths>` naming only that
  phase's files.
- Check `git diff --cached` first: something outside the session stages files.
- Don't push, tag, or open a PR unless the user asks.

Never:
- push, tag or open a PR unless the user asks in this session.
- npm publish, create GitHub releases, or trigger workflows (dry runs only).
- open, copy or modify ~/Library/Application Support/abuddy* or any real data dir.
- pkill/killall Electron or node; launch the app outside the test env without an isolated
  ABUDDY_USER_DATA_DIR.
- run bare tsc on packages/preload, `npm install` in the example pack, or edit version/release metadata.
- change the typed EARS types' behaviour (packages/abuddy-sdk/TYPED-EARS.md) to make a call site compile.
- delete a test because it fails; investigate it, and keep it if it found something.
- widen a kept test's scope, add new coverage, or refactor the code under test. This goal removes and
  loosens test code only. A bug a deleted test was covering goes in the Outcome's Open items.
```

## Background (2026-09-19)

The branch `AS/package-boundaries` (322 commits, merge base 67e8537e8) added or changed 226 test files,
about 21,000 lines of test code. Six read-only reviewers audited them at commit 1dd69172e, one per
group, judging every test in an added file and only the changed tests in a modified one. An addendum
covers the tests added by c2c919d6f, 303488683 and 7bedf650c.

The audit found 81 tests that don't protect a regression path and about 100 that do but also pin
incidental detail. They fall into six kinds:

1. **Guards against names an earlier refactor removed.** They assert that a moved export, deleted
   module or old manifest key stays absent. They pass forever unless someone retypes the old name.
2. **Tests of an old spec.** The behaviour they describe no longer exists; what's left is `typeof x ===
   'function'` or a check that a type has keys.
3. **Duplicates**, about 30: the same registration, lookup or bus behaviour asserted in two or three
   specs, usually because the code moved between packages and the test came along.
4. **Tests of test helpers and fixtures**: a spec's own scanner, the harness registry smoke check, the
   e2e fixture's temp-dir naming, an allowlist's own entries.
5. **Pinned library internals**: AI SDK batch sizes, rollup-plugin-dts output, Node's `util.inspect`
   formatting. These break on a dependency upgrade without guarding our behaviour.
6. **Pinned incidental detail** inside otherwise good tests: whole error and log sentences, exact call
   counts and revision numbers, hash lengths, generated-file text, hard-coded counts of the flows or
   folders default-setup ships.

Some of this has already landed on master and is not part of this goal:

| Commit | What it did |
|---|---|
| cf4490213 | Deleted `removed-names-in-docs.spec.ts` and `no-host-modules.spec.ts` |
| acf10618a | Kept the live half of guards that mixed invariants with retired names (the `boundaries.spec.ts` items) |
| 0b1242c14, 9f85ced7a, 1ff7efd9e | Added the retired-names guard and extended it to specs and scripts |
| bac70f8f2, 3ab270cc3 | Deleted `source-conditions.spec.ts` and rewrote `testing-source-entry.spec.ts` |

The audit's own reports were written to a session scratchpad, which is not durable. Everything needed is
in the Phases below.

`AS/pack-naming-convention` is a second branch, outside that audit, classified in
[`docs/plans/test-audit-pack-naming-pr.md`](../plans/test-audit-pack-naming-pr.md). It needs no phase of
its own — 15 of its 17 added tests are keeps — and its two exceptions are folded into Phase 2. Three
findings from it are carried into the Decisions and the Phases preamble below.

### A second test, found after the audit (2026-09-19)

Asking "could someone write this today?" is necessary and not sufficient. A guard can forbid something
reachable and still be dead weight, because something cheaper already rejects it.

`no-engine-state-access.spec.ts` is the worked example, and the reason Decision 4 reads as it does. Its
`ADMIN_WRITES` half forbids `import { edgeStore } from '@abuddy/ears'` — a real symbol, in a real
package, and an admin write with no engine behind it, so the check looks live. It is not:

```
error TS2724: '"@abuddy/ears"' has no exported member named 'edgeStore'. Did you mean 'EdgeStore'?
```

None of the 15 admin-write names are exported. The compiler rejects the import at the import site, with
a better message and no allowance list to maintain.

The same trap caught a mutation check. Adding that import and watching the guard fail proves the guard
*fires*; it does not prove the guard is *needed*. Both questions have to be asked, and the second one is
the one that gets skipped.

## Decisions

Final.

1. **Delete a test when it can only fail for one of these reasons:** a removed name comes back; a
   behaviour that no longer exists; it duplicates another test's assertions; it tests a test helper,
   fixture or allowlist; it pins a third-party library's internals. A test that also covers behaviour
   nothing else covers is trimmed instead.

   **Then ask the second question: does anything cheaper already reject it?** The compiler, an
   allowlist, or a guard with a wider net. A check that only repeats one of those is a second opinion,
   not coverage — see *A second test, found after the audit*. Both questions, in that order.
2. **Trim, don't delete, a test that guards behaviour but pins detail.** Match the part of a message a
   user or pack author acts on, not the sentence. Assert that something was called, or that a counter
   moved, not exact counts. Drop assertions on generated text that another test typechecks.
3. **Keep architecture guards that enforce a standing rule** documented in a CLAUDE.md. They fail when a
   rule is broken, not when a name is retyped, and nothing cheaper covers them. *Do not remove* lists
   them with the reason each is still reachable; treat that table as the scope boundary and raise
   anything you would take off it with the user.

   The retired-names guard is **not** among them: it was added in 0b1242c14 and deleted in cf4490213,
   once the rename it escorted had landed and it had grown to 56 names and 16 allowances across 8 files.
   An earlier draft of this decision kept it, which contradicted the Background table.
4. **Delete `packages/abuddy-ears/tests/no-engine-state-access.spec.ts`.** Its `MODULE_STATE` scan only
   greps for names this refactor removed, and its `ADMIN_WRITES` check is already enforced by tsc, since
   `@abuddy/ears`'s index exports none of those names. `no-module-state.spec.ts` keeps the real guard.
   The root CLAUDE.md sentence citing it is updated in the same phase.
5. **Keep `tests/e2e/smoke.spec.ts` "runs in an isolated per-worker test data dir".** It tests the
   fixture rather than the app, which is normally a delete, but it is what stops an E2E run from
   touching real user data.
6. **Don't re-record the seed-parity goldens.** The audit suggested re-recording them with notes
   included, to retire `NOTES_INTENDED_DIFFERENCES`. That changes what the goldens cover and belongs in
   its own change (Deferred).
7. **Leave `packages/abuddy-host/tests/packs/pack-protocol.spec.ts` alone.** Its 7 tests don't import
   product code — they check a MIME map declared in the test and a copy of the install logic — but the
   branch only moved the file, so it is outside this goal's scope (Deferred).
8. **A phase is one package's tests**, so each lands on its own with its suite green.
9. **Prefer an allowlist to a denylist** wherever the scope is enumerable. `api/tests/unit/source-layout.spec.ts`
   compares every file under `packages/api/src` against a list, so it already fails on a recreated
   `api/src/packs` — which is why `boundaries.spec.ts`'s absence checks for that directory went in
   acf10618a. An allowlist catches what nobody predicted and cannot go stale as the code moves.
10. **A duplicate that names its level is not a duplicate.** `api/tests/unit/boot-recovery.spec.ts`
   repeats two `@abuddy/host` unit tests on purpose, and says why: *"The unit tests for these live in
   @abuddy/host. This one boots the real composition, because what both regressions broke was the
   boot."* Spare a test that states the level it adds. Where one is kept without saying, add the
   sentence — an unexplained duplicate is indistinguishable from an accident, which is how ~30 of them
   got here.
11. **Provenance predicts the verdict.** A test written to close a specific failure is almost always a
   keep; a test written to steer a refactor is almost always scaffolding. `git log -S` on the test's
   title, or the commit that added the file, answers it faster than reading the assertions. Use it to
   order the work inside a phase, not to skip the reading.
12. **An allowance is load-bearing or it goes.** Delete it, watch the guard fail, put it back; if the
   guard still passes, the allowance was describing a file that no longer trips it. A *growing* list is
   the guard reporting that it no longer matches how the code is written. An *empty* list is different:
   `DECLARES_SOURCE_BY_DESIGN` is empty on purpose, with a spec keeping it empty and a note telling
   agents to raise the first row with the user. That stays.

## Do not remove

The guards that hold a standing rule up (Decision 3). Each forbids something a person could write this
week, and nothing cheaper rejects it first. Taking one off this list is the user's call.

The phases still *trim* tests inside some of them — an allowlist's own meta-test, a `@ts-expect-error`
for a moved name, an unbridged-leaf case. The file stays; those individual tests are in scope.

| Guard | Forbids | Still reachable because |
|---|---|---|
| `scripts/check-import-specifiers.ts` (13 rules) | layering, pack boundaries, relative `.js` specifiers, `lmdb`, `_internal` imports, `console` in pack backends, repository casts, source conditions | every symbol it names is exported and importable |
| `abuddy-ears/tests/no-module-state.spec.ts` | module-level mutable state in `src/` | `new Map()` at module scope is an ordinary thing to write |
| `abuddy-sdk/tests/build/no-pack-seed-specifics.spec.ts` | pack entity names in the SDK's build and seed modules | `Document`, `Note` and `FAQ` exist in default-setup and are easy to reach for |
| `abuddy-sdk/tests/env/identity-guard.spec.ts` | hand-rolled environment and data-dir resolution | a literal `Application Support` path or a raw `ABUDDY_ENV` read is a natural shortcut |
| `api/tests/unit/source-layout.spec.ts` | any file under `api/src` outside its list | an allowlist (Decision 9): it catches files nobody predicted |
| `abuddy-host/tests/packs/runtime/sdk-bridge-drift.spec.ts` | the bridge list drifting from the exports map | both sides change independently, and neither fails the other |
| `abuddy-cli/tests/build/published-sdk-types.spec.ts` | subpaths resolving that should not | it reads the published exports map, where widening the surface by accident is live on every edit |

`no-engine-state-access.spec.ts` is **not** here: tsc rejects its subject at the import site, so it is a
second opinion, not a guard (Decision 4, and *A second test, found after the audit*).

## Phases

Line numbers are from 1dd69172e plus the three commits named in Background; find the test by its title,
not its line. A listed test that no longer exists is skipped.

**Count, don't diff, when a branch renamed things.** A rename lands inside test titles, so `git diff`
reports a renamed test as added. Compare `grep -c '^\s*it('` per file between the two ends first, and
read only the files whose count moved. On the pack-naming branch that was the difference between ~40
apparent additions and 17 real ones.

### Phase 1 — @abuddy/cli

Delete:
- `tests/build/with-source.spec.ts`: "is the only way npm scripts in the checkout get the condition" (it
  also reads the user's global npm config, so it fails on a machine that sets `node-options`).
- `tests/cli/pack-generate.spec.ts`: "delegates infrastructure types to SDK" (`facade-typing.spec.ts`
  typechecks the generated facades).

Trim:
- `pack-generate.spec.ts`: drop the re-export's module path; loosen the ordered `RelKind` union to the
  `export type RelKind =` line and `(string & {})`.
- `pack-cli.spec.ts` "scaffolds a valid pack directory structure": drop the "old feature folder is gone"
  and duplicated `release.yml` lines.
- `dep-types-version.spec.ts`, `facade-gate.spec.ts`, `fe-bundler-shared-ui.spec.ts` (both tests),
  `install-host-version.spec.ts`, `build/host-import-guard.spec.ts` ("rejects an export only the app
  loads"), `harness/shared-ears.spec.ts` (both message tests): match the part of the message a user acts
  on, not the sentence. In `fe-bundler-shared-ui`'s "warns once", keep the one-call check.
- `fe-bundler-host-registry.spec.ts`: loosen the import chain to `src/entry.ts → @abuddy/sdk/logger`;
  drop the `else` branch asserting the source layout compiles SFCs.
- `dependency-flow-helpers.spec.ts`: drop the exact generated re-export line; keep `flowHelpers.exports`.
- `facade-typing.spec.ts`: drop the CONSUMER fixture's `Secret` and `Note` `@ts-expect-error` blocks;
  keep `Settings` and `AppState`, which are the documented rule.
- `published-exports.spec.ts`: drop the removed `@abuddy/sdk/rpc` line.
- `published-sdk-types.spec.ts`: drop the consumer's `@ts-expect-error` lines for moved names
  (`findRelations` from `/repositories`, `@abuddy/sdk/ears`, both `/internals` paths, `@abuddy/sdk/packs`)
  and the "ships no host-only module" assertions for those paths, and the old-directory-name filter;
  keep the positive resolves, the package file list and the no-sourcemaps check. Keep the `findAll`
  line: that one is a current contract.
- `add-extensions.spec.ts`: drop the old-prop checks (`modelValue`, `data`) and whitespace-pinning
  regexes in the step, artifact and block tests; loosen the migration template check to its `target`;
  in "adds the import after an index whose only import is its first line", assert where the import lands
  rather than the whole file.
- `add-feature-validate.spec.ts`: drop the "no feature.config.ts" line and that clause from the title.
- `scaffold.spec.ts`: drop the exact generated import lines in the step-and-service test; loosen the
  unit-test count to `/Tests\s+\d+ passed/` plus no "failed".

**Done when:** the two tests are gone, the trims are applied, `npm test -w @abuddy/cli` passes, and
`npm run packages:build` has run first (the CLI suite needs it).

### Phase 2 — @abuddy/host

Delete:
- `bus/client-events.spec.ts`: "logs arrays over 5 items as their count and first 5".
- `fe/pack-store-designations.spec.ts`: "resolve a role to the plugin that plays it, and drop it when the
  pack unregisters" (duplicate of `fe/fe-registered-lookups.spec.ts`).
- `packs/registered-lookups.spec.ts`: "(seed hooks) are found once their pack registers…", "don't change
  when a pack's settings are refused", "(commands) aren't changed by a registration that collides".
- `packs/registration.spec.ts`: "drops a pack's roles when it unregisters", "keeps TNode out of
  persistence and routes Secret to the secrets store without any pack asking" (the title describes an
  old spec and nothing asserts Secret routing; `partition-policy.spec.ts` covers TNode), "registers a
  pack's feature settings as defaults and drops them when it unregisters", "registers a pack's declared
  commands and drops them when it unregisters".
- `packs/registry-state.spec.ts`: "finds %s" and "allows constants and state inside functions" (they test
  the spec's own `moduleState` helper). Keep "keep no state at module scope".
- `packs/runtime/lifecycle.spec.ts`: "hostVersion gating prevents loading incompatible packs", "stores
  source field in registry when GitHub slug is used", "stores availableVersion and lastUpdateCheck after
  update check", "unregisterPackFE removes contributions and returns removed plugins", "unregisterPackFE
  leaves a plugin another registration owns when the pack declared the same id", "registerPack then
  unregisterPack cleans up SDK registries".
- `packs/runtime/loader.spec.ts`: "handles features without system entry", "seeds from runtime/seeds".
- `packs/runtime/sdk-bridge-drift.spec.ts`: "keeps unbridged leaf modules free of imports"
  (`UNBRIDGED_LEAVES` is empty, so it can't fail). Remove the empty map and its uses.

Trim:
- `boundaries.spec.ts` "holds only the app-implemented services in src/services": drop the runtime-keys
  comparison, which repeats `services/host-runtime.spec.ts`; keep the file-list rule.
- `build/shared-deps.spec.ts`: check that each `APP_ONLY_EXPORTS` key names an existing export instead of
  pinning the list; drop the removed `@abuddy/ears/internals` line.
- `bus/client-events.spec.ts` "puts an accepted event on the bus and logs it": drop the exact log message.
- `fe/pack-store-designations.spec.ts` "keep a role with the plugin that played it first",
  `packs/staging.spec.ts`, `secrets/store.spec.ts`: drop the pinned `console.warn` text; assert it was
  called if the call matters.
- `packs/backend-contributions.spec.ts` and `packs/registered-lookups.spec.ts` ("appear and disappear
  with their pack"): assert the revision increases and the listener was called, and that the count is
  unchanged after unsubscribe, instead of `before + 2` and exact call counts.
- `packs/bundle.spec.ts`, `packs/runtime/loader.spec.ts` ("skips a pack directory that isn't an installed
  bundle"), `packs/runtime/activation-outcome.spec.ts`, `packs/updater.spec.ts` (three tests),
  `packs/module-bridge.spec.ts` ("throws for an app-only specifier"), `packs/registration.spec.ts`
  ("rejects a repository name another pack registered"): match the part of the message that names the
  problem or the fix, not the sentence. In the updater's auth test, assert every call sent the header
  instead of pinning the call array.
- `packs/runtime/loader.spec.ts` hash tests: drop `toHaveLength(16)`; a non-empty string is the contract.
- `services/host-runtime.spec.ts`: drop the exact `Object.keys(runtime)`; the type enforces it.
- `services/inference.spec.ts`: assert `model.provider.split('.')[0]` instead of the AI SDK's internal
  provider ids, or delete the case as a duplicate of the catalog check.

From the pack-naming audit:
- `packs/staging.spec.ts`: merge "restores every interrupted install when there is no record" and "…when
  the record cannot be parsed". They differ only in how the record is unreadable, and both reach the one
  branch where `readInstalledPacksRecord()` returns `null`. One test, both inputs.
- `packs/discovery.spec.ts`: trim "rebuilds the record with every pack enabled, and says so once". It
  depends on log wording four times — the filter substring, a whole sentence, an absent message, and a
  four-method console patch to catch them. Keep that every pack returns `enabled: true`, that one line
  is logged rather than one per pack, and that the line names the packs. Drop the sentence pins.

**Done when:** the listed tests are gone, the trims are applied, and `npm test -w @abuddy/host` passes.

### Phase 3 — @abuddy/sdk and @abuddy/ears

Delete:
- `abuddy-ears/tests/no-engine-state-access.spec.ts` (whole file, Decision 4). Update the root CLAUDE.md
  sentence that cites it, and any other doc `git grep no-engine-state-access` finds.
- `abuddy-sdk/tests/designations/pack-facing.spec.ts` (whole file): "no longer exports
  `registerDesignations`"; `api:check` controls the published surface.
- `abuddy-sdk/tests/build/no-pack-seed-specifics.spec.ts`: "every allowlist entry still matches a line".
- `abuddy-sdk/tests/build/manifest-schema.spec.ts`: "rejects the removed boot.earlySystem and
  boot.createDefaultSettings"; the unknown-key cases cover it.
- `abuddy-sdk/tests/runtime/bound-transport.spec.ts`: "sendToBrainSystem sends to the designated brain",
  "reportError logs a system error and sends it to the clients" (both duplicates).
- `abuddy-sdk/tests/testing/fake-inference.spec.ts`: "records a model call per batch the AI SDK splits a
  call into" (pins AI SDK batch sizes).
- `abuddy-sdk/tests/seed/flow-seeder.spec.ts` and `tests/seed/seeder.spec.ts`: the "fails with a rebuild
  error when the compiled seeds name no pack" tests; `seed-registry.spec.ts` covers the shared check.
- `abuddy-sdk/tests/runtime/internals-entry.spec.ts`: "is exported only under the @abuddy/source
  condition" (pins the `package.json` export object; `published-exports.spec.ts` covers the entry).
- If `generate-entries.spec.ts` still has "ignores dependencies built when their manifests still declared
  the SDK's names", delete it and the matching `if (key in sdkOwned) continue;` in
  `src/build/generate-entries.ts` (it was gone at the time of writing).

Trim:
- `abuddy-ears/tests/installed-engine.spec.ts`: assert `toThrow('No EARS engine is installed')` rather
  than the three-clause sentence, for all 12 functions.
- `abuddy-ears/tests/lmdb/persistence.spec.ts`: drop the "nothing to a secrets partition" assertion and
  that clause from the title.
- `abuddy-sdk/tests/build/generate-entries.spec.ts`: drop the facade header-comment match; keep the
  `systemIds` mapping and `system-ids.ts` export and drop the character-exact declarations; drop the
  `not.toMatch(/label|icon|isPinned/)`, the `not.toContain('registerRepository')` and the loop grepping
  every generated file for removed registration calls; loosen the `export const {` formatting match.
- `abuddy-sdk/tests/testing/test-host.spec.ts`: drop the `boundHost().transport.rootEvents` identity.
- `abuddy-sdk/tests/runtime/unbound.spec.ts`: delete the `Without`/`WithoutService` type block; the one
  real `bindHost(createHostRuntime(...))` site enforces it.
- `abuddy-sdk/tests/runtime/internals-entry.spec.ts` "holds what @abuddy/sdk/runtime leaves out": keep
  the check that `@abuddy/sdk/runtime` exports none of the host-only names; replace the exact internals
  export list with `arrayContaining`.

Keep, though they are contract-heavy: the ears `tests/contract/` specs, `no-module-state.spec.ts`, and
the typed-EARS specs (`packages/abuddy-sdk/TYPED-EARS.md`).

**Done when:** the listed tests are gone, the trims are applied, `npm test -w @abuddy/sdk` and
`npm test -w @abuddy/ears` pass, `npm run typecheck` passes, and no doc names a deleted file.

### Phase 4 — default-setup, part A

Delete:
- `tests/unit/generated-entries-import.spec.ts` (whole file): a transitional guard that importing the
  generated entries registers nothing, pinning the seeder and DSL-type key lists.
- `src/features/flows/fe/canvas/__tests__/layout-utils.test.ts`: "lays out with the steps the test
  registered" (tests the file's own fixture).
- `tests/unit/handle-fork-stress.spec.ts`: "persists state on the new thread before returning" (the
  ordering check it existed for was removed; what's left repeats the first test).
- `tests/unit/harness-app-stop.spec.ts`: "ticks while its app runs" (the next test makes the same check;
  it also costs up to 3s). Move its `getAllFlowActorIds()` check into that test if it's wanted.
- `tests/unit/harness-registry.spec.ts`: "holds default-setup, registered once, which the lookups read".
  Keep "takes other packs, which the lookups then see".
- `tests/unit/library-index-refresh.spec.ts`: "and LIBRARY_INDEX_LOADED is what stores it" (pins an
  internal action name, asserts nothing).

Trim:
- `library-index-refresh.spec.ts` "%s asks for it again": rewrite it the way
  `features/database/fe/state.spec.ts` does — mock `#generated/events`, start the actor, send each event
  and assert `sendToSystem` was called with `GET_LIBRARY_INDEX` — instead of reading
  `librarySystem.config.on` and matching action names.
- `code-child-systems.spec.ts`: drop the hard-coded `CHILD_SYSTEM_IDS` list; assert no `'undefined'` key,
  unique keys, more than one child, and compare the restart against the first run.
- `brain-flow-children.spec.ts`: drop the prefix-count threshold; keep the no-`'undefined'`-key and
  unique-keys checks.
- `brain-flow-runs.spec.ts`, `create-update-steps.spec.ts` (three tests), `harness-service-mocks.spec.ts`,
  `llm-step.spec.ts` (three tests): match the identifying fragment of each message (the flow or node
  name, the entity type, the id) instead of the sentence; for the validation cases assert the error's
  `path`.
- `llm-step.spec.ts` "sends the node's model…": use `objectContaining` for the recorded call rather than
  `toEqual` on the fake's whole record.
- `action-sandbox.spec.ts`: drop the `'[Undefined]'` JSON-encoding assertion.

**Done when:** the listed tests are gone, the trims are applied, and `npm test -w @app/default-setup`
passes (run `npm run compile` first).

### Phase 5 — default-setup, part B

Delete:
- `tests/unit/service-registry.spec.ts` (whole file): restates the generated `Services` type;
  `sdk-type-safety.spec.ts` covers the typing and the unknown-service rejection.
- `tests/unit/registries.spec.ts`: "exports featureServices with all expected service keys".
- `tests/unit/sdk-tiers.spec.ts`: "qx and tx are callable functions", "createEntity produces a valid
  entity ID", "RepositoryError is constructable and instanceof Error", "RepositoryErrorCode has expected
  values", "repository proxy delegates registerRepository", "getAttr reads stored attributes",
  "resetTestData resets all state", "emit and safeEvents are callable", "getAppVersion reads the host
  version", "seed helpers are callable", "sendToPlugin and sendToBrainSystem are callable", and the
  source-grep test for the `@/core` alias (with the sibling `@/repository` and `@/services` greps, which
  `check:specifiers` covers). Keep the rest of the file.
- `tests/unit/sdk-type-safety.spec.ts`: "qx() returns a QueryBuilder typed with the pack shapes",
  "QueryBuilder terminal methods are typed", "createEntityWithDefaults<T> returns T & { id, entityType }"
  (all duplicates of `typed-query-builder.spec.ts` or of tests above them).
- `tests/unit/typed-query-builder.spec.ts`: "qx(someEntityId) returns untyped QueryBuilder" (the
  overload-order test asserts it).
- `tests/unit/seed-parity/notes-change-tracking.spec.ts`: "fresh seed in mode %s matches the golden
  notes", "seeds only the included notes", "seeds default-setup's own notes" (all covered by
  `seed-parity.spec.ts`).

Trim:
- `typed-query-builder.spec.ts`: keep the Action and Thread seed cases; drop the Flow, Document and
  Prompt copies.
- `notes-change-tracking.spec.ts`: the `sourceHash` check becomes non-empty rather than a 16-hex match.
- `seed-parity/dependent-pack.spec.ts`: drop the character-exact generated `seeders.ts` match; loosen the
  unresolved-dependency throw to `/default-setup/`.
- `seed-parity/edited-flows.spec.ts`: drop `skipped:` from the two `toMatchObject`s (it hard-codes how
  many flows default-setup ships); keep `updated`.
- `query-step.spec.ts`: drop the `inference.calls` length check; match the API-key error by fragment.
- `seed-action-services.spec.ts`: keep the log's `level` and `source`, drop the debug message and meta.
- `send-to-system-diagnostics.spec.ts`: drop the assertions on TypeScript's message text.
- `settings-seed.spec.ts`: drop the "the removed `internal` section is gone" line.
- `settings-secrets.spec.ts`: retitle "keeps CLI path overrides … cleared from the cache" to what it
  checks, or assert that `resolveCliPath` picks up the new path.

**Done when:** the listed tests are gone, the trims are applied, and `npm test -w @app/default-setup`
passes.

### Phase 6 — api, renderer, E2E and fixture packs

Delete:
- `packages/api/tests/unit/host-data-services.spec.ts`: the whole `relation reads in @abuddy/ears`
  describe (three tests) and the setup only it uses; `abuddy-ears/tests/contract/relations.spec.ts` and
  `installed-engine.spec.ts` cover them.
- `packages/api/tests/unit/bus-client-connected.spec.ts`: "reaches every system when a client connects"
  and "reaches an external pack with plugins once…" (both in `abuddy-host/tests/bus/app-bus.spec.ts`).
- `packages/renderer/src/core/__tests__/fe-host.spec.ts`: "throws, naming bindFeHost, before the renderer
  binds it" (SDK behaviour, covered by `abuddy-sdk/tests/runtime/unbound.spec.ts`).

Trim:
- `api/bound-runtime.spec.ts`: drop the `typeof generateText === 'function'` line.
- `api/destroy-settings.spec.ts` (three tests), `api/inspect-relations.spec.ts`: drop the pinned console
  output of the dev scripts; keep the return values.
- `api/log-capture.spec.ts`: replace the exact console argument arrays with per-method call counts; keep
  the level and source check.
- `api/secrets.spec.ts`: assert `protection: 'unprotected'` instead of the label string; `toThrow()`
  without the message; in the console-arguments test keep "args aren't mangled or mutated", the deep
  object and "printed text equals logged text", and drop the `util.inspect` rendering cases.
- `renderer/fe-host.spec.ts`: drop the duplicated "throws before" half of the lookups test and that
  clause from its title; drop the `secretsList` call count; loosen the rejected-send assertions to
  `stringContaining('SAVE_NOTE')` and an error-level log; loosen the new startup test's error to
  `/isn't created yet/`.
- `renderer/application-pack-registry.spec.ts` (three tests), `renderer/pack-loader.spec.ts`: drop the
  pinned `console.warn`/`console.error` text; keep the toast and reporting assertions.
- `tests/fixtures/external-pack/tests/unit/seeds.spec.ts`: drop the `library: { created: 3 }` count,
  which pins how many folders default-setup's library seeding makes.

Keep (Decision 5): `tests/e2e/smoke.spec.ts` "runs in an isolated per-worker test data dir".

**Done when:** the listed tests are gone, the trims are applied, and `npm test -w @app/api`,
`npm test -w @app/renderer`, `npm test` (E2E) and `npm run test:external-pack` pass.

### Phase 7 — the guards that stay, and the full check list

The per-package phases delete and trim tests. This one proves what is left earns its place, which no
single package's phase can do.

- For each guard in *Do not remove*: make it fail with an edit someone could plausibly write, then
  confirm nothing else fails on the same edit. A guard that only fails alongside tsc or an allowlist
  goes, and the removal is recorded in the Outcome against Decision 1's second question.
- For each allowance in each remaining guard (`ALLOWED`, `GUARDS`, `UNBRIDGED_BY_DESIGN`): delete it and
  run the guard. Still green means the allowance describes a file that no longer trips it — drop it.
  `DECLARES_SOURCE_BY_DESIGN` is exempt: empty on purpose, kept empty by its own spec (Decision 12).
- Run the whole list from the prompt block, in order, from a clean build.
- Record each suite's test count and `Duration` next to the numbers taken before Phase 1.
- Write the Outcome section: per phase, the tests kept against the audit and why, and any bug a deleted
  test turned out to be covering.

**Done when:** every check passes, every remaining guard and allowance has its mutation check recorded, and the Outcome is written.

## Deferred

- **Re-recording the seed-parity goldens** with notes included, retiring `NOTES_INTENDED_DIFFERENCES` and
  the dropped `sourceHash` and counts in `seed-parity.spec.ts` (Decision 6).
- **`packages/abuddy-host/tests/packs/pack-protocol.spec.ts`** (Decision 7): its 7 tests check a MIME map
  declared in the test and a re-implementation of the install logic, so they can't catch a change in the
  product code. Rewriting them against the real module, or deleting them, is its own change.
- **Tests older than the audited branch.** The audit covered only what `AS/package-boundaries` added or
  changed. The same six kinds almost certainly exist in older specs.

## Constraints

- Commit each phase as it finishes, conventional message, no attribution lines, `git commit -- <paths>`;
  check `git diff --cached` first. Pushing, tagging and PRs are on request.
- No publishing, releases or triggered workflows.
- No real data dirs, no broad pkill; E2E runs in the `abuddy-test` namespace.
- Never run bare tsc on `packages/preload`; no `npm install` in the example pack; don't edit
  version/release metadata.
- Typed EARS types are change-controlled (`packages/abuddy-sdk/TYPED-EARS.md`); this goal doesn't change
  them, and only deletes typed-EARS tests that duplicate another typed-EARS test.
- Published packages: `api:update` after export changes. This goal shouldn't change any export; if a
  report changes, something other than a test was edited.
- Build order: `packages:build` before the CLI suite, `npm run compile` before the api and default-setup
  suites and E2E.
- Investigate a failing test before touching it. A test that fails while being trimmed has found
  something: keep it, fix the code, or record it in the Outcome's Open items.
- A guard is removed because it cannot fail, or because something cheaper fails first — never because it
  is in the way. If you cannot make it fail, that is the finding; record it either way.
- Keep the rule when the test goes: move it to the CLAUDE.md that owns the concept, so deleting the
  check doesn't delete the reason.
- Comments on what survives follow the root CLAUDE.md rule — write for whoever opens the file cold, not
  for whoever reads the diff. Counts of the previous state and what you measured go in the commit
  message.
- External packs are first-class: the fixture packs, `test:external-pack` and `test:packaged-authoring`
  keep passing.
