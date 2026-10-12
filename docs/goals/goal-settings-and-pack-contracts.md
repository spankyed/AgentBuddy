> Written 2026-10-12 in the settings/discovery planning session.

```text
# Goal: complete settings and discoverable pack contracts

Implement docs/goals/goal-settings-and-pack-contracts.md. Read CLAUDE.md, Background, Decisions,
Working setup and checkpoint workflow, Phases and Constraints first. The updated base is 3d389b9c8 on
session/naming-contracts, which completes naming. Start from a committed state containing that work
and this goal; master is suitable only once it contains both.
Continue on session/settings-pack-contracts in the main checkout: the user promoted this work out
of its initial worktree. Preserve unrelated changes. Use further isolation only if requested or clearly
necessary; never share dependencies, generated output or the index between worktrees.

Follow the linked subsystem plans without duplicating their designs here. This goal owns execution,
checkpoints and completion; manifest-maturity owns the roadmap and subsystem plans own contracts.
Audit actual code before implementation. Record evidence-based corrections in the owning plan.

Naming conventions are complete. Verify that completed baseline once at kickoff; do not poll or merge
the naming branch after each checkpoint. Follow Working setup and checkpoint workflow. Commit each
validated implementation checkpoint before beginning the next; apply the settled naming conventions
to new APIs without reopening the completed naming project.

Finished when:
- Phases 0–7 meet their Done when conditions, including all three Phase 6 workstreams.
- Host, pack and feature settings use the common declarative contract and migrated stored data.
- Every supported contribution is discoverable without executable pack/dependency activation;
  generated bindings, catalog identities, updates and source-build freshness agree.
- Entity navigation, frontend boundaries, supported consumed APIs, dependency provenance and
  explicit shipped-pack replacement satisfy their linked plans and external-pack checks.
- The completed naming baseline is included and recorded; no naming integration remains outstanding.
- Changed public schemas, API reports, templates and docs agree; final validation passes.
- Record outcomes, corrections and validation, then archive this goal and completed subsystem plans
  with repaired links. Deferred work remains deferred.

Commit as you go, including any required kickoff integration resolution. Do not push, tag, open/merge PRs, publish,
trigger release workflows or edit release/version metadata unless separately requested. Follow the
Constraints for isolated test data, typed EARS, migrations and validation. No compatibility shims.
```

# Complete settings and discoverable pack contracts

Status: in progress on `session/settings-pack-contracts`; naming conventions are complete. This executes the five remaining work items in
[manifest maturity](../plans/manifest-maturity.md), building on the completed naming prerequisite.
Lazy activation is deferred.

## Background (2026-10-12, at 3d389b9c8 on session/naming-contracts)

The [naming goal](../archive/goals/goal-naming-conventions.md) is complete and archived, with its outcome
and validation recorded. Commit `3d389b9c8` closes that work. The settings/discovery plans and this goal
are already on its branch; use that completed state or a later integration containing it as the baseline.
Do not restart naming implementation or require ongoing synchronization with the finished branch.

The settings and discovery designs are reconciled but remain unimplemented. Five work items remain:
shared foundation, settings, full discovery, navigation/fault boundaries, and API consumption/provenance/
replacement. The last item contains three distinct deliverables. Audit current paths and interfaces
against the completed naming result; historical surveys in the linked plans are not current-code claims.

## Decisions

1. **One working branch in the main checkout.** The initial isolated branch was forked from master.
   The user then promoted it to the main checkout; continue there on `session/settings-pack-contracts`.
   Naming integration is a kickoff prerequisite, not an ongoing workstream. Commit incrementally.
2. **One shared foundation.** Inventory all supported contribution kinds before designing the catalog.
   Extend the existing snapshot/build pipeline, with settings as the first catalog projection. No second
   authored inventory, settings-only catalog or runtime fallback for missing declaration metadata.
3. **Safe checkpoints before switching readers.** Each migrated kind includes descriptor validation,
   checked binding, ownership rules and coherent build/publication before consumers depend on it.
   Keep declared, eligible and active states distinct. Discovery changes no execution ordering by itself.
4. **Settings contracts stay settled.** App settings belong to the host; pack groups use
   `extensions.settings`; features use their own settings definitions. JSON Schema describes values and
   validation; forms remain custom. Shared dependency read/write/reset is the default, with opt-in
   owner-only mutation enforced through trusted caller binding. Preserve user overrides and lifecycle state.
5. **Build on completed naming.** Verify the baseline once, follow its resulting contracts for new APIs
   and retain its regression checks. Do not apply retired blanket naming bans or repeat its refactors.
6. **Finish the whole active scope.** Phase 6 has separate API, provenance and replacement checkpoints.
   None is silently dropped because the settings/discovery work is substantial. Strong security isolation,
   general lazy activation and speculative package-manager work remain outside this goal.
7. **Contracts are maintained when they change.** Migrate all owned callers, fixtures, templates and public
   docs at each checkpoint; regenerate affected schemas/API reports then. Stored user data requires
   idempotent migration under the repository's current migration rules; code needs no compatibility aliases.

## Working setup and checkpoint workflow

### Kickoff

Pin the chosen starting commit and verify it contains the completed naming work (`3d389b9c8`) and this
goal. Record the base SHA, naming completion SHA, goal branch and worktree path. If naming was merged
with preserved history, verify ancestry. If squash/rebase changed its commit identity, record the landing
commit and verify the resulting contracts and archived validation instead of insisting on the old SHA.
Master is a suitable base once that integration has landed; do not branch from a tree missing naming.

The initial branch and worktree were created from master `d7e77829a`. On 2026-10-12 the user promoted
this goal into the main checkout at `/Users/spankyed/Develop/Projects/AgentBuddy`, keeping the branch
`session/settings-pack-contracts` and its commits. Continue there; do not create another worktree merely
because the original kickoff used one. Preserve unrelated concurrent work and use isolation only when
requested or clearly necessary under CLAUDE.md. The promotion supersedes the original worktree requirement.

If an existing goal branch lacks naming, integrate the completed commits once through the repository's
`session:check` workflow before implementation. Resolve conflicts and validate the combined candidate,
then incorporate only the tested result. No repeating naming-branch fetch/merge loop is required.

### Each implementation checkpoint

Run focused checks and the required checkpoint validation, inspect the staged diff, and commit a usable
logical change before starting the next. Record its commit and evidence in Progress. Large phases have
multiple checkpoints; Phase 6's three workstreams each have their own commits and evidence.

Apply settled naming rules to new interfaces as ordinary implementation review. If separately authorized
integration work later becomes necessary, follow CLAUDE.md's pinned integration validation; the completed
naming branch is not an automatic source of future changes.

## Phases

### Phase 0 — Isolate the work and establish the baseline

Establish the branch from a committed state containing completed naming and this goal. The initial
worktree setup is complete and the branch is now promoted to the main checkout. Inspect the linked plans
against that code, record current contribution/setting entry points, and verify the naming baseline once.
Use existing isolated fixtures for stored-data and app checks.

**Done when:** the branch/worktree and source SHA are recorded, setup succeeds, source work is untouched,
and baseline failures or stale survey claims are investigated and accounted for before affected work starts.

### Phase 1 — Contribution inventory and shared foundation

Follow the inventory and foundation checkpoints in
[discovery without activation](../plans/discovery-without-activation.md), shared diagnostics in
[manifest maturity](../plans/manifest-maturity.md#2-share-precise-validation-and-diagnostics), and the
settings contract prototype in [settings architecture](../plans/settings-architecture.md).

Cover every supported registration/extension field, its owners, static metadata/assets, dynamic results
and runtime binding. Establish one validated descriptor reader and host catalog, including host-owned
contributions. Prototype the schema/type/defaults contract and trusted settings caller binding. Publish
settings metadata and generated bindings coherently, with ownership and stale-build checks.

**Done when:** the inventory has no unclassified supported fields; the first settings projection reads
without pack execution; diagnostics distinguish invalid from incomplete; mismatched bindings, conflicts
and failed rebuilds are covered before consumer migration. Mutation checks prove the relevant guards.

### Phase 2 — Complete settings ownership and interfaces

Implement the remaining [settings architecture](../plans/settings-architecture.md) checkpoints in
reviewable slices: host app ownership and migration; pack groups and handles; feature-schema conversion;
assistant lifecycle separation; window runtime; custom forms and product surface.

Use the existing draft helper, request correlation and typed paths. Fix Projects snapshot mutation,
disposal and stale-array writes. Validate defaults and overrides consistently; preserve orphaned overrides.
Migrate stored documents before the new writer validates them, including import/restore paths.

**Done when:** the settings plan's acceptance checks pass for all three owners; host settings work with
no default-setup; disabled definitions remain readable/validated; shared/owner policies hold through typed
and untyped supported paths; reset/defaults, restored data, custom forms and multiple windows behave correctly.

### Phase 3 — Complete discovery and remove obsolete glue

Finish the [discovery plan](../plans/discovery-without-activation.md) on Phase 1's foundation. Extend
checked binding/freshness per kind before migrating settings/details/help, shell navigation, references,
editor contributions and palette readers. Remove the audited runtime discovery unions and duplicate
projections without deleting real execution, readiness, teardown or user-content notification machinery.

**Done when:** all discovery acceptance checks pass, including poisoned executable pack/dependency entries,
zero activation or user-data writes during discovery, disabled/failed pack metadata, ownership diamonds,
atomic catalog updates and stale frontend completion rejection. Actual queries still execute their required
providers. Source watch/codegen publication cannot pair new bindings with stale descriptors.

### Phase 4 — Entity navigation

Implement [entity opening](../plans/open-entity.md) using the catalog and readiness coordinator. Prove
short-code resolution before migrating affected callers. Declare build-checked destinations once; keep
entity ownership distinct from the feature that opens an entity. Migrate callers before deleting old
reference navigation callbacks.

**Done when:** claimed eligible destinations are unambiguous; missing/disabled destinations have useful
results; readiness delivery rejects stale revisions; stored references open the right entity, including
short-code round trips. Required guards and the plan's focused/E2E checks pass.

### Phase 5 — Frontend failure boundaries

Implement the frontend workstream of [fault isolation](../plans/pack-fault-isolation.md). Scope contributed
canvas, panel and custom-form failures to their pane, with the catalog owner named and a safe recovery
path. Keep the shell and settings runtime outside those boundaries.

**Done when:** throwing contribution fixtures leave another pane and host settings usable; declarations
and defaults survive failure; retries cannot revive unloaded artifact revisions. Do not implement process
isolation or change the security model here.

### Phase 6 — Finish the three contract workstreams

Deliver these independently, committing each validated logical checkpoint:

| Workstream | Implementation owner | Done when |
|---|---|---|
| Consumed APIs | [API consumption](../plans/declared-capabilities.md) | Actual APIs/granularity are audited; generated and host-bound facades agree; undeclared supported APIs and unavailable required providers fail usefully; content targets respect supported SDK/dependency contracts; settings policy remains intact |
| Dependency provenance | [Manifest maturity, section 4](../plans/manifest-maturity.md#4-preserve-dependency-provenance-and-reproducibility) | Exact version, origin and content identity survive cache reuse and inspection; linked development remains explicit; differing resolutions are explainable. A new frozen-resolution mode is conditional on distribution needing it, not required speculatively |
| Shipped-pack replacement | [Replacement](../plans/replaceable-shipped-packs.md) | Deliberate forks survive restart/reload; app-managed updates remain supported; disable, uninstall and restoration stay distinct; overrides survive; pre-publication failure retains the old artifact/catalog; activation failure does not claim rollback of arbitrary user-data effects |

These share catalog identities and existing caller/refresh contracts; no new inventory or sandbox is
introduced. Re-audit old paths, CLI refusals and install records before changing them. Settle the concrete
consumption declaration/granularity and removal-suppression record through the linked plans' prototypes
before implementing their dependent behavior; record the selected designs there.

**Done when:** all three rows and their linked verification pass, with affected external-pack fixtures,
templates and public contracts updated. No workstream is merely marked “follow up” to close this goal.

### Phase 7 — Final review and completion

Review the entire implemented diff for correctness and completeness
against the inventory and each plan's acceptance criteria. Fix omissions and bugs, and commit them. Check failure paths, artifact revisions, dependency ownership, import
migration, multiple windows, disable/uninstall/reinstall, and external authoring.

Run focused checks as changes are made, `npm run chain` at validated checkpoints, and the full strict
chain on the final committed tree. Include the affected real app/external-pack/packaged-authoring checks
from the linked plans and current repository instructions; do not substitute schema acceptance for behavior.
Record the final commit, exact commands/results and naming completion SHA.

**Done when:** all required implemented behavior and checks pass; the tree is clean; naming is complete
and integrated; every phase has evidence. Add Outcome, archive this goal and completed subsystem plans,
repair incoming/outgoing links and commit closure. Keep the roadmap/reference docs where they remain useful;
do not archive unfinished or deferred work as completed. Publishing or PR merge remains separately requested.

## Deferred

- [Lazy activation](../plans/deferred/lazy-activation.md), including boot-performance implementation.
- [Security isolation](goal-pack-security-isolation.md) and out-of-process backend execution.
- Storage/LMDB, advisory-lock and console-transaction redesign; plugins-to-surfaces, logs extraction
  and distribution work outside the required dependency provenance contract.
- A new registry/package manager, speculative optional integrations, generated settings forms and new
  preference scopes. The package-dist watcher follow-up is separate; required descriptor freshness is not.

## Constraints

Follow root and package CLAUDE instructions, including isolated test storage, bounded process cleanup,
change-controlled typed EARS behavior and stored-data migrations. Do not touch production app data,
release metadata or unrelated concurrent work. Install dependencies and generate output independently
in each worktree. Fix failing checks rather than relax assertions; mutation-check new contract guards.

Commit usable logical checkpoints with explicit paths and reviewed staged diffs. No pushes, publishing,
release workflows or PR operations without separate authorization. No compatibility aliases or a
permanent legacy settings/discovery path after migrating callers and stored data. An unresolved required
contract or failing acceptance check keeps the goal open; document blockers instead of calling it complete.

## Progress

Record the completed naming baseline at kickoff, then implementation evidence as work proceeds:

| Checkpoint | Commit | Validation / outcome |
|---|---|---|
| Naming prerequisite | `3d389b9c8` | Ancestry verified against master `d7e77829a`; archived completion included |
| Kickoff / Phase 0 | `70408039e`; base `d7e77829a` | Initial isolated setup, independent `npm ci`, default-setup/runtime builds and six doc checks passed. Full strict chain passed: 30 steps, `npm run chain -- --strict --all --cores 2` (270.9s). |
| Contribution inventory | `b5761c0db` | BE/FE registration and nested metadata coverage audited in discovery plan; six doc checks passed. |
| Main-checkout promotion | Branch preserved at `b5761c0db` | Both checkouts were clean; switched main checkout to `session/settings-pack-contracts` at user request. |
| Schema prototype | Disposable `/private/tmp/apack-settings-schema-prototype` | Ajv 8.20.0 / json-schema-to-typescript 15.0.4 passed pure validation, optional/nullable/enum/record/array/local-reference and generated-type probes; no runtime contracts changed yet. |
| Shared diagnostics | `fd11b82ff` | SDK checks 52, CLI resolution/report checks 66, external validation checks 10 and doc links 6 passed. Incomplete-result guard mutation was caught. `npm run chain -- --strict --cores 4` passed all 30 steps (229.6s); evidence `node_modules/.cache/apack-chain/runs/2026-10-12T11-30-43Z-30065`. `validate --json` is read-only and exits 0/1/2 for valid/invalid/incomplete. |
| Settings contract kernel | `839dec923` | 29 focused validator/generator checks passed, including strict generated-type checks and guard mutations. Public SDK API reports regenerated. `npm run chain -- --strict --cores 1` passed (13.2s, 28 cached); evidence `node_modules/.cache/apack-chain/runs/2026-10-12T12-12-30Z-16840`. Earlier concurrent app runs passed functional assertions but timed out closing Electron; isolated retries and the serial chain passed. No settings consumers switched yet. |
| Shared snapshot reader | `d801b5580` | 118 focused snapshot/manifest/format checks and six doc checks passed; schema-refusal and original-record name guard mutations were caught. Producer, CLI, harness and loader validate the same current-format data contract. `npm run chain -- --strict --cores 1` passed (152.3s, 23 cached); evidence `node_modules/.cache/apack-chain/runs/2026-10-12T12-51-44Z-96251`. An earlier process-cleanup assertion failed; four isolated checks and the final chain passed unchanged. Descriptor/catalog publication, settings conversion and trusted caller binding remain unfinished. |
| Declaration/runtime agreement | `23b4b026a` | Manifest identities agree across snapshots and generated BE/FE bindings; loaders refuse mismatches before registration. Active origins retain the accepted identity. Fixed resolved-path require-cache cleanup exposed by version-changing reloads. 87 focused checks, 150 lifecycle checks, six doc checks and four guard mutations passed. Reviewed SDK API reports. Strict chain passed (259.9s, nine cached); evidence `node_modules/.cache/apack-chain/runs/2026-10-12T13-39-03Z-69678`. Full descriptor/catalog, staging coherence and trusted settings caller binding remain required. |
| Inline pack declarations / catalog prototype | `18116c99a` | 137 focused checks, six doc checks and three guard mutations passed. Reviewed manifest editor schema and SDK API report. Strict chain passed (310.2s, one cached); evidence `node_modules/.cache/apack-chain/runs/2026-10-12T14-08-48Z-18516`. An architecture check initially mistook schema prose for a pack entity name; clarified the prose without weakening the check. Host catalog owns immutable snapshots and reads disabled pack groups without activation. Production consumers, full descriptors, staging coherence and trusted handles remain unfinished. |
| Staging declaration coherence | `b085edd3d` | Current-format snapshots and source/installed manifests must agree before staging or teardown, including installs with unknown target format. Foreign-format policy stays explicit. Temporary staging is cleaned on refusal. 364 host pack checks, 27 release-fixture checks, six doc checks and three guard mutations passed. Strict chain passed (180.9s, 16 cached); evidence `node_modules/.cache/apack-chain/runs/2026-10-12T14-28-19Z-88313`. Release stand-ins now regenerate declarations and ignore build output; release implementation/metadata unchanged. Full source-input freshness, descriptor/binding completeness and runtime settings integration remain required. |
| Authored-input scopes / publication stability | `44cc56fb1` | Shared scope covers module sources outside src, generated bundle entries and all asset extensions; codegen tracks captured declarations and SDK source. Builds refuse persistent authored-input changes before publication and retain the previous artifact. 42 focused checks and three guard mutations passed. Strict chain passed (282.0s, one cached); evidence `node_modules/.cache/apack-chain/runs/2026-10-12T14-44-50Z-20334`. Complete external/dependency identities, a coherent frozen build view, descriptor completeness and runtime settings integration remain required. |
| Async codegen / schema-derived pack group types | `b6ec616b0` | `generatePackFiles` now returns a Promise across SDK/CLI callers. Facades export schema-derived `PackGroupSettings`; per-group referenced types remain independent. Generation holds its lock through settlement and preserves prior files/stamp on rejection. 156 focused checks, six doc checks, SDK/CLI typechecks and two mutations passed; removal of type isolation or generation awaiting is caught. Strict chain passed all 30 steps (333.0s); evidence `node_modules/.cache/apack-chain/runs/2026-10-12T15-08-26Z-56743`. Feature conversion, typed group handles, trusted caller policies, production catalog integration and complete artifact/dependency freshness remain unfinished. |
| Inline feature declarations / schema-derived feature types | `74a48e0f3` | All 11 shipped definitions, external fixtures and scaffolds use inline JSON Schema/defaults; navigation visibility belongs to `plugin.defaultVisible`. The conversion audit compared 844 probes with the previous effective-value schemas. Focused host checks (453), shipped checks (47), schema/codegen edge checks (102) and scaffold/dependency-runtime integration checks (13) passed. Three guard mutations caught schema ownership, non-JSON writes and unsafe generated object literals. Reviewed editor schema, SDK reports and shipped facade. Strict chain passed (226.6s, 14 cached); evidence `node_modules/.cache/apack-chain/runs/2026-10-12T15-55-35Z-29737`, including external and packaged app checks. Two earlier runs exposed stale fixture assertions; both were corrected and verified. Host ownership, pack handles, trusted policies, forms, stored-data migration and production catalog/freshness integration remain required. |
| Installed artifact verification / accepted identity | `b7d1d10fe` | The shared reader validates declarations against verified file bytes before runtime execution and refuses concurrent declaration/artifact replacement. Installer identity checks run before placement; shipped refresh verifies receipts before reporting current and repairs invalid copies. Focused host pack checks (382), install/refresh checks (78), restored race/docs checks (139), CLI/layout checks (78) and four guard mutations passed. CLI install tests now use isolated storage even when run directly. Strict chain passed (291.7s, one cached); evidence `node_modules/.cache/apack-chain/runs/2026-10-12T16-30-32Z-32191`, including external and packaged app checks. An earlier unrelated process-cleanup integration failure passed unchanged in isolation and subsequent chains. Source-build sealing, complete dependency/frozen-input identities, production catalog wiring, binding membership, frontend asset delivery and settings ownership/policies/migration remain required. |
| Producer-owned output receipts / verified staging | `8f137ced9` | Build publication now includes the canonical manifest and complete integrity inventory; reuse verifies the previous output, and staging/shipped comparison refuse edited output. Staging verifies copied bytes before replacing the prior stage. Focused pack/runtime/CLI/docs checks passed (480), three additional boot/lifecycle fixture checks passed (6), release fixture integration passed (27), and four guard mutations were caught and restored. Synthetic producers now seal their completed files. Final strict chain passed (208.5s, 17 cached), evidence `node_modules/.cache/apack-chain/runs/2026-10-12T16-52-29Z-8008`, including external-pack app, smoke and packaged authoring/app. Earlier runs identified unsealed simulated producers; those fixtures were corrected without relaxing guards. No release behavior/version metadata changed. Live DSL output writes, frozen authored/dependency/tool input views, accepted placement/frontend copies, production catalog wiring and checked bindings remain required; settings ownership and all later phases remain unfinished. |
| Staged DSL generation / frontend definition coherence | `20c8194e7` | DSL bundling writes directly into staged output; the frontend resolves and hashes that same definition tree. A real cold/failing/recovered/reused/removed-definition build proves preservation of the accepted artifact, receipts, read record and cache, matching frontend/declarations, reuse and removal of obsolete output. Missing staged definitions refuse the older published copy. Focused unit/docs checks (34), DSL integration (7) and three restored guard mutations passed. Strict chain passed (295.0s, one cached), evidence `node_modules/.cache/apack-chain/runs/2026-10-12T17-03-47Z-41045`, including external-pack, smoke and packaged authoring/app. The live DSL output write gap is closed; frozen authored/dependency/tool inputs, accepted placement/frontend copies, production catalog wiring and checked contribution bindings remain required, as do settings ownership and all later phases. |
| Verified installation candidates | `ccc9e605f` | Copies and verifies the complete accepted layout before teardown, compares the exact receipt including provenance, rechecks copied compatibility/ownership, and gives hooks an independent descriptor. Copy/validation refusals retain the prior files and skip teardown; hook refusal cleans the candidate without promising rollback of arbitrary hook effects. Broad host/CLI checks passed (476 tests, 36 files); five restored guard mutations failed their targeted assertions. An initial parallel chain hit the process-cleanup grandchild assertion; all four process tests passed unchanged in isolation. Strict serial chain passed (118.4s, 26 cached), evidence `node_modules/.cache/apack-chain/runs/2026-10-12T17-30-08Z-25422`; external-pack, smoke and packaged checks passed in the earlier run `2026-10-12T17-26-16Z-81782` and were reused. Frontend delivery/catalog publication, frozen inputs, checked binding completeness and settings ownership/migration remain unfinished. |

| Host app ownership / stored app migration | This checkpoint | Host JSON Schema/defaults and schema-derived SDK types now own hotkeys, personal info and ordered projects at `app`; default-setup no longer supplies them, and all active app consumers/forms use the new location. The host 0.4.0 raw migration preserves destination choices, orphan data and project/directory order, prunes copied historical defaults and handles the legacy projects wrapper. Real boot, reset and backup import checks passed. Fixed the shared writer admitting newly missing required fields and allowed removal of existing orphan section fields without new undeclared writes. Host/CLI lifecycle checks passed (546), rebuilt migration/settings checks passed (74), real import/docs checks passed (25), shipped migration/event checks passed (51), and the full shipped suite passed (834, two already skipped). Project form interaction checks passed (3); eight restored guard mutations were caught, with disposal strengthened after Vue's unmounted emit suppression hid the first probe. Reviewed public SDK API report and generated type parity. Strict chain passed (188.4s, 16 cached), evidence `node_modules/.cache/apack-chain/runs/2026-10-12T17-57-59Z-93144`, including external-pack app, smoke and packaged authoring/app. The final strengthened-test chain passed (64.7s, 21 cached), evidence `node_modules/.cache/apack-chain/runs/2026-10-12T18-02-21Z-20394`, reusing unchanged accepted app outputs. The earlier strict run identified an external fixture still asserting general; it was migrated and independently verified. Pack groups/handles, trusted policies, assistant lifecycle, window settings runtime/CAS, full catalog/binding/freshness and later phases remain unfinished. |

## Outcome

Pending implementation. At completion, record each phase's results, evidence, design corrections,
final naming completion SHA and any genuinely out-of-scope follow-ups.
