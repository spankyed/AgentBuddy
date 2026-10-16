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
- Phases 0–7 meet their Done when conditions, including restored manifest-consolidation M1–M6 and all three Phase 6 workstreams.
- Host, pack and feature settings use the common declarative contract and current-format stored data.
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

Status: in progress on `session/settings-pack-contracts`; naming conventions are complete. This executes the remaining work items, including restored manifest consolidation, in
[manifest maturity](../plans/manifest-maturity.md), building on the completed naming prerequisite.
Lazy activation is deferred.

## Live execution ledger (reconciled 2026-10-16)

This ledger owns current execution status and ordering. The phases below retain all completion
requirements; subsystem plans retain detailed contracts and acceptance cases. Dated checkpoint notes
are historical evidence, not additional live backlogs. Their old “next,” “remaining” and prerequisite
statements do not override this ledger. Where a subsystem plan still requires the entire freshness
workstream before every discovery migration, use the per-deliverable dependencies below instead.
No requirement is waived by this reconciliation, and no final acceptance is claimed.

“Implemented” means source checkpoints exist; it does not mean final committed-source acceptance is
complete. “Partial” identifies implementation still required. Final verification is tracked separately
so completed implementation is not repeatedly scheduled as new work.

| Deliverable | Implementation status and source evidence | Remaining implementation / exit condition |
|---|---|---|
| Naming and checkout baseline (Phase 0) | Complete: `3d389b9c8`; promoted checkout recorded below | No naming integration or repeated baseline project. |
| Shared declaration/catalog foundation (Phase 1) | Implemented foundation; contribution coverage remains partial | Close the remaining field-by-field classification and native/authored coverage with the discovery rows below; do not build another catalog. |
| Settings (Phase 2) | Implemented: catalog integration `f3416ad2f` and subsequent settings checkpoints in the evidence record | Final three-owner, policy, reset/import, disabled/failed owner, custom-form and multiple-window acceptance; no new extraction. |
| Manifest consolidation M1–M6 | Implemented and checkpoint-validated through `0994ae787`; own-key preservation `29f0cc556` | Preserve all 17 reconciled decisions, both naming outcomes and generated EARS/content behavior in final acceptance; do not restart consolidation. |
| Settings/help/info/reference/step/command discovery (Phase 3) | Implemented reader migrations: `2169d29f8`, `6c876c9ba`, `20ab75efe`, `c776d1c5d`, `76df2f0e5`, `71fad4013`, `8ec5285ed`, `f7d63434c`, command catalog `ff48438cd` | Final all-kind acceptance, including source-free inspection, inactive owners and checked runtime eligibility. |
| Live editor composition (Phase 3) | Implemented: `8863043a6` | Complete cold-document/provider readiness and real typing/replacement acceptance; fix demonstrated omissions without restarting composition. |
| Remaining discovery consumers (Phase 3) | Partial; viewer readers `a278d4116` and shell default/dispatch `69860e4be` implemented | Navigation inventories/order/visibility implemented in `cfcbb53f9`; complete final window/loader acceptance; DSL producer/readers are implemented in `8ed188046` / `39e48e66e` and await final worker acceptance. Flow reference/rename/missing-target inspection is implemented in `7196d61d3`; complete its final external acceptance. Audit services, repositories, events, native fields and static assets; migrate each actual gap and remove superseded discovery stores. |
| Build input/publication and freshness (Phase 3) | Partial; finite checkpoints B1–B6 below | Finish the common producer contract and four passive consumer migrations; installed discovery must remain source-free and activation-free. |
| Entity navigation (Phase 4) | Reference identity, producer `94148c9e0`, catalog/admission `479c75e01` and owned routing/reference migration `cd9c57de6` implemented | Finish blueprint node revealing without its timer, address abandoned Library document loads, and close handler/stored-message acceptance under open-entity.md. |
| Frontend boundaries (Phase 5) | Implemented and locally accepted: `713a6c1fd`, including the real external-pack window | Preserve pane/form containment, attributed nonfatal diagnostics and retired-instance refusal through final committed-source strict acceptance. |
| Consumed APIs (Phase 6) | Inventory/prototype requirements documented; implementation outstanding | Settle declarations and granularity, generate matching runtime/type facades, mediate administration and dependency APIs, and migrate real consumers. |
| Dependency provenance (Phase 6) | Cache/admission `ff4358588`, inspection and verified-build checkpoints in the evidence record implemented; overall closure partial | Verify exact origin/version/content through reuse and inspection, integrate remaining freshness dependencies, and close the linked acceptance matrix. Do not restart cache/provenance storage. Frozen resolution remains conditional on a distribution requirement. |
| Shipped-pack replacement (Phase 6) | Substantially implemented: ownership/suppression `03745e1dc`, replace/restore `85a7e955b`, subsequent live-control/source-update checkpoints in the evidence record | Reconcile and close remaining restart/reload, overrides and failure acceptance against landed implementation; implement only identified gaps. Do not restart replacement. |
| Final review/acceptance (Phase 7) | Outstanding | Audit every phase and reconciled manifest requirement on committed source, run final strict `--all`, record evidence and archive only completed work. |

### Bounded build-input and freshness checkpoints

Completed prerequisites: captured compiler installation/session reuse (`aba660aed`), shared authored
scope (`882d2a50b`), public cancellation (`6641b2c99`), startup capture (`37890aa9b`), publication
alias-processing repair (`c85fc178a`), and ordered effective execution-options/runtime-version hashing
(`65a189cb7`), early launch identity (`3929897a3`), and authored bytes/membership before
preloads (`bbf05ec00`). These are source evidence, not a claim that the full strict gate passes.

| Checkpoint | Required outcome and acceptance boundary | Dependencies |
|---|---|---|
| B1 — Launch and remaining input coverage | Reconcile current capture against actual supported compiler paths. The launch audit preserves inherited NODE_OPTIONS and forwarded export conditions; supervisor entry modes are not worker configuration. Early launch identity and authored bytes/membership are implemented through `bbf05ec00`. Close remaining executable/native-runtime ownership and pre-startup/dependency/resolution gaps. Enumerate concrete missing inputs before implementing; prove relevant changes invalidate/refuse publication while equivalent runs preserve identity and resolution. Ordered options already landed; do not reimplement them. | Existing captured installation/startup view. |
| B2 — Frontend compiler generation | Own backend and actual Vite compiler generations coherently; successful compiler refresh cannot leave the frontend using the old compiler. Preserve HMR, useful paths, recovery and awaited retirement. | B1 inputs needed by the frontend handoff, not unrelated discovery consumers. |
| B3 — Remaining resource lifetime | Audit native/background work and required platform-specific descendant handling against existing cancellation. Close demonstrated ownership gaps so build-owned work cannot outlive final validation/disposal. Retain required one-shot/dev/platform cases; public cancellation is already implemented. | Relevant B1/B2 owners; no security sandbox or general resource-confinement expansion. |
| B4 — Persist successful input/output association | Publish the completed input record atomically with sealed output. Failed or incoherent builds retain the incumbent; readers can validate the association without executing pack/compiler code. Startup observations alone are not this record. | Complete relevant B1–B3 producer ownership. |
| B5 — Passive freshness consumers | Migrate archive, prebuilt tests, default-fork preparation and drive to the common record. Preserve manual builds, deterministic reuse, source-free installed inspection and deliberately stale drive behavior. Remove replaced freshness heuristics. | B4. |
| B6 — Converged acceptance | Resolve affected failures from preserved evidence and focused reproducers, then run the required converged strict checkpoint. The final committed-source strict `--all` remains Phase 7. | Converged B1–B5 source; focused checks accompany each earlier checkpoint. |

The latest recorded strict run failed; focused publication and retarget/refusal/repair cases now pass.
Other preserved watch/frontend and Electron-teardown failures are unresolved acceptance items, not proof
of a common cause. Diagnose the smallest failing case before another broad run. Do not reopen the
publication repair as outstanding implementation without new evidence.

### Execution order and change control

Last closed checkpoint: Phase 5 frontend boundaries, `713a6c1fd`. Focused Vue/lifetime checks and the
real external-pack Electron case pass: failed panes/forms preserve other panes, host settings and
defaults; retired frontend retry is refused. The staged source and built runtime matched that proof.
Final whole-goal strict acceptance remains open.

Current Phase 4 source checkpoint: `cd9c57de6`, following producer `94148c9e0` and catalog/admission
`479c75e01`. One child actor owns entity intent, the invoked existence query and final delivery;
readiness carries a token. Feature handlers are direct, reference callbacks are removed, verified test
metadata is captured once, and offline inspection shows compiled destinations. Sixty shell checks and
the real external-pack Electron reference click pass. See [checkpoint evidence](../evidence/settings-and-pack-contracts.md#entity-opening-lifecycle-checkpoint-2026-10-16).
Strict run `2026-10-16T22-31-16Z-68388` failed the import boundary and facade report; both are corrected
and individually verified. Its authoring and external contract steps pass. Later gate steps and final
committed-source strict `--all` remain unproven; no passing broad gate is claimed.

Next: preserve blueprint node revealing as a separate Flows operation and replace its caller timer
with feature-owned load/reveal coordination. Reproduce and fix Library's unconditional
`DOCUMENT_LOADED` navigation so an abandoned request cannot reopen an editor. Close the six handlers'
state-specific cases and the stored-message reference click into another feature. The existing external
preview click is runtime evidence, not that stored-message proof. Do not restart the implemented
reference identity, destination catalog, shell lifecycle or unrelated compiler work.

1. Finish Phase 4 entity destinations and caller migration. Phase 5 containment is already locally
   accepted; retain its checks for final verification rather than schedule another implementation.
2. Close the remaining discovery inventory: classify supported registration fields, native declarations,
   events and static assets; identify actual reader/loader gaps and finish those migrations. Each slice
   names the declaration, binding and publication guarantees it consumes. A producer dependency blocks
   only the affected slice, not all installed-data readers.
3. Complete B1–B6. Before changing B1 or B3, record a finite matrix of supported paths, existing owners,
   concrete uncovered requirements and the check that closes each gap. Review existing implementation
   first; do not treat an audit heading as authorization for another general capture/resource framework.
4. Implement consumed APIs and close the actual remaining provenance/replacement gaps. Reuse landed
   ownership, inspection and replacement behavior rather than replaying historical plans.
5. Complete Phase 7 across the entire preserved scope using the acceptance register below.

Before each checkpoint, record its concrete change, acceptance cases and dependency. Close it with
source/evidence before selecting another. A newly found concern must name the observed defect or
required acceptance gap, the existing requirement it serves, and a finite exit condition. An existing
requirement remains required even before a failing reproducer exists; investigating it is not permission
to implement an unlimited generalization. Proposals expanding the agreed scope require an explicit user
decision. Keep research hypotheses separate from demonstrated defects and required acceptance checks.

Keep detailed historical logs in [the evidence record](../evidence/settings-and-pack-contracts.md) for traceability. Update this ledger when a checkpoint closes;
do not append a new competing live backlog or repeatedly copy all remaining work into every evidence
entry. No scope is dropped, validation weakened, deferred work revived or implementation certified by
this documentation change.

### Final acceptance register

This is the cross-phase closure checklist. Subsystem plans retain their detailed cases; link existing
coverage and source evidence here as each row converges, recording missing checks explicitly. A row
with missing or indirect evidence remains open. Existing local passes need not be rerun separately
before the final gate unless their inputs or asserted behavior change. This register does not replace
required checkpoint validation or the final committed-source strict `--all`.

| Scope | Required closure evidence | Current disposition |
|---|---|---|
| Foundation and manifest | Complete supported-field classification; all 17 consolidation decisions and both naming outcomes; generated EARS typed/untyped behavior, ownership, canonical writer, schema/API reports and external authoring | Implemented checkpoints exist; final cross-phase audit pending. |
| Settings | Host, pack and feature ownership; same-name groups, shared/restricted policy, disabled/failed owners, reset/import, custom forms and multiple windows | Existing settings evidence in the evidence record; reconcile exact coverage before final gate. |
| Discovery | Every supported kind/native field and static asset; source-free poisoned pack/dependency inspection, inactive owners, collisions, atomic updates and checked bindings; no activation/user-data writes | Partial inventory/loader implementation remains; discovery checklist owns the per-kind cases. |
| Editor and content | Actual Monaco worker/cold document and typing through replacement; shared-library disposal; static flow edges, rename/missing-target diagnostics and honest dynamic status | Local producer/reader checks exist; real-window and external acceptance remain. |
| Build ownership/freshness | Finite B1/B3 path matrices, frontend generation replacement/HMR, atomic successful input/output association, four passive consumers, preserved failure retention and deterministic reuse | B1–B6 remain partial; preserve failed run evidence and diagnose exact cases. |
| Entity navigation | Build-checked destinations, conflicts/disabled/missing/retired delivery, typed guard, complete caller migration and stored-reference Electron case | In progress; canonical reference identity is already implemented. |
| Frontend containment | Pane/form failures preserve other panes, host settings/defaults; retries reject retired instances in main/popout paths | Locally accepted in `713a6c1fd`; preserve through final gate. |
| API consumption | Audited declaration granularity, generated/runtime facade agreement, undeclared/unavailable API diagnostics, content/dependency contracts and settings policy | Implementation remains; linked plan owns prototype and acceptance. |
| Provenance/replacement | Exact origin/version/content through reuse/inspection; explicit linked development; fork restart/reload, managed updates, disable/remove/restore, override retention and failed-publication incumbent | Substantial source exists; reconcile remaining cases against linked plans. |
| Final committed tree | Requirement-by-requirement audit, reviewed schema/API/docs/templates, required strict `--all` and real authoring/app checks on recorded committed source | Outstanding; archive only after every row is proven. |

## Background (2026-10-12, at 3d389b9c8 on session/naming-contracts)

The [naming goal](../archive/goals/goal-naming-conventions.md) is complete and archived, with its outcome
and validation recorded. Commit `3d389b9c8` closes that work. The settings/discovery plans and this goal
are already on its branch; use that completed state or a later integration containing it as the baseline.
Do not restart naming implementation or require ongoing synchronization with the finished branch.

At kickoff, settings and discovery were designed but unimplemented. That historical baseline comprised
shared foundation, settings, full discovery, navigation/fault boundaries, and API consumption/provenance/
replacement. The live ledger now distinguishes landed implementation from unfinished work and final
verification. Historical surveys in the linked plans are not current-code claims.

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
   docs at each checkpoint; regenerate affected schemas/API reports then. There are no users to support
   through old-format compatibility. Normal boot/import use the current settings contract only; the
   developer backup is a separate explicit operation if conversion proves necessary.

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
logical change before starting the next. Record its commit and validation in [the evidence record](../evidence/settings-and-pack-contracts.md), then update the live ledger. Large phases have
multiple checkpoints; Phase 6's three workstreams each have their own commits and evidence.

Follow [bounded validation](../../CLAUDE.md#keep-validation-bounded). Define the checkpoint's claims
and checks before its broad run. Diagnose failures from preserved logs and the smallest reproducer;
after a fix, run the failing case and affected suite. Another broad run needs a stated coverage gap or
the required converged checkpoint/final gate, not reassurance after each edit. An unexplained recurring
failure stops broad reruns: report the exact blocker and next diagnostic action. Do not expand the
implementation into unrelated test infrastructure or performance work without an explicit scope decision.
Required gates and the final committed-source strict `--all` acceptance remain required.

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
reviewable slices: host app ownership and current-document validation; pack groups and handles; feature-schema conversion;
onboarding state/preferences separation; window runtime; custom forms and product surface.

Use the existing draft helper, request correlation and typed paths. Fix Projects snapshot mutation,
disposal and stale-array writes. Validate defaults and overrides consistently; preserve orphaned overrides.
Validate the current document through the common installed catalog, including import/restore paths.
Do not add automatic historical-format conversion; backup preflight must refuse invalid candidates
before replacing live data.

**Done when:** the settings plan's acceptance checks pass for all three owners; host settings work with
no default-setup; disabled definitions remain readable/validated; shared/owner policies hold through typed
and untyped supported paths; reset/defaults, restored data, custom forms and multiple windows behave correctly.

### Required manifest consolidation before extending Phase 3

Implement [manifest consolidation](../plans/manifest-consolidation.md) M1–M6. The original entity/shape
ownership, relations, module-reference, lifecycle, checks, feature-description, format-key and canonical
writing outcomes were not optional. Preserve all 17 reconciled decisions and the original phase checks,
with explicit replacements/exclusions recorded there. M1–M6 source checkpoints are committed and audited in the evidence record. Their remaining cross-phase requirements
continue in Phase 3; preserve the consolidated grammar while expanding other consumers. The required
[own-key preservation correction](../plans/manifest-consolidation.md#required-own-key-preservation-correction-2026-10-15)
closed the reopened M1 preservation condition in `29f0cc556`, before the next discovery-reader switch.

**Done when:** every required consolidation row has source/validation evidence; generated EARS and
typed/untyped behavior are preserved; unchanged authored content keeps compiled identity and ordinary
boot/apply behavior; all native/source/installed and loosely typed readers, authoring tools, schemas,
reports, fixtures/templates and public docs agree. Required field descriptions and canonical writing
have explicit checks. The completed naming baseline, current format constants, existing settings
contract and release metadata remain intact. No compatibility, inferred existence or volatility addition.

### Phase 3 — Complete discovery and remove obsolete glue

The live execution ledger above owns status and execution dependencies; the discovery plan's
[current checklist](../plans/discovery-without-activation.md#current-discovery-checklist)
provides detailed consumer contracts, source checkpoints and remaining acceptance. Historical audits and dated
“next/remaining” notes in this goal are checkpoint evidence, not a second current backlog; later work
supersedes their status claims without dropping unmet requirements. Keep build-freshness consumers
separate from discovery consumers, and retain every later phase below.

Finish the [discovery plan](../plans/discovery-without-activation.md) on Phase 1's foundation. Extend
checked binding/freshness per kind before migrating settings/details/help, shell navigation, references,
editor contributions and palette readers. Remove the audited runtime discovery unions and duplicate
projections without deleting real execution, readiness, teardown or user-content notification machinery.

**Done when:** all discovery acceptance checks pass, including poisoned executable pack/dependency entries,
zero activation or user-data writes during discovery, disabled/failed pack metadata, ownership diamonds,
atomic catalog updates and stale frontend completion rejection. Actual queries still execute their required
providers. Source watch/codegen publication cannot pair new bindings with stale descriptors. Compiled
content inventory includes static flow/action edges and named rename/missing-reference checks with
honest dynamic-reference status. `apack pack info` shows actual contribution identities and useful
metadata, including unbuilt/unavailable status without source-file-count substitution. Facade field,
constant and cache naming are consistent (`facades`, `PACK_TYPES_FACADE`); missing required facades
fail by dependency name with a rebuild remedy, preserving capability-based acceptance and DSL defs.

### Phase 4 — Entity navigation

Implement [entity opening](../plans/open-entity.md) using the catalog and readiness coordinator. Preserve
canonical entity IDs through stored-reference round trips before migrating affected callers. Labels and
short codes remain presentation; do not add short-code lookup or old-format fallback. Declare build-checked destinations once; keep
entity ownership distinct from the feature that opens an entity. Migrate callers before deleting old
reference navigation callbacks.

**Done when:** claimed eligible destinations are unambiguous; missing/disabled destinations have useful
results; readiness delivery rejects stale revisions; stored references preserve canonical entity IDs
through serialization/parsing and open the right entity even when display codes collide. Required
guards and the plan's focused/E2E checks pass.

### Phase 5 — Frontend failure boundaries

Implement the frontend workstream of [fault isolation](../plans/pack-fault-isolation.md). Scope contributed
canvas, panel and custom-form failures to their pane, with the catalog owner named and a safe recovery
path. Keep the shell and settings runtime outside those boundaries.

**Done when:** throwing contribution fixtures leave another pane and host settings usable; declarations
and defaults survive failure; retries cannot revive unloaded build revisions. Do not implement process
isolation or change the security model here.

### Phase 6 — Finish the three contract workstreams

Complete these independently, committing each validated logical checkpoint. Provenance and shipped
replacement already have substantial landed implementation; audit their remaining gaps against the
live ledger and recorded source rather than treating all three workstreams as unimplemented:

| Workstream | Implementation owner | Done when |
|---|---|---|
| Consumed APIs | [API consumption](../plans/declared-capabilities.md) | Actual APIs/granularity are audited; generated and host-bound facades agree; undeclared supported APIs and unavailable required providers fail usefully; content targets respect supported SDK/dependency contracts; settings policy remains intact |
| Dependency provenance | [Manifest maturity, section 4](../plans/manifest-maturity.md#4-preserve-dependency-provenance-and-reproducibility) | Exact version, origin and content identity survive cache reuse and inspection; linked development remains explicit; differing resolutions are explainable. A new frozen-resolution mode is conditional on distribution needing it, not required speculatively |
| Shipped-pack replacement | [Replacement](../plans/replaceable-shipped-packs.md) | Deliberate forks survive restart/reload; app-managed updates remain supported; disable, uninstall and restoration stay distinct; overrides survive; pre-publication failure retains the old build/catalog; activation failure does not claim rollback of arbitrary user-data effects |

These share catalog identities and existing caller/refresh contracts; no new inventory or sandbox is
introduced. Re-audit old paths, CLI refusals and install records before changing them. Settle the concrete
consumption declaration/granularity through the linked plan's prototype before implementing its
dependent behavior. The removal-suppression record is already implemented; preserve its selected
contract and test actual gaps rather than redesigning it from the old proposal.

**Done when:** all three rows and their linked verification pass, with affected external-pack fixtures,
templates and public contracts updated. No workstream is merely marked “follow up” to close this goal.

### Phase 7 — Final review and completion

Review the entire implemented diff for correctness and completeness
against the inventory, all reconciled original requirements in manifest consolidation, and each plan's acceptance criteria. Fix omissions and bugs, and commit them. Check failure paths, build revisions, dependency ownership, import
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

- [Lazy activation](../plans/lazy-activation.md), including boot-performance implementation.
- [Security isolation](goal-pack-security-isolation.md) and out-of-process backend execution.
- Storage/LMDB, advisory-lock and console-transaction redesign; plugins-to-surfaces, logs extraction
  and distribution work outside the required dependency provenance contract.
- A new registry/package manager, speculative optional integrations, generated settings forms and new
  preference scopes. The package-dist watcher follow-up is separate; required descriptor freshness is not.

## Constraints

Follow root and package CLAUDE instructions, including isolated test storage, bounded process cleanup,
change-controlled typed EARS behavior and the current data contract. Do not touch production app data,
release metadata or unrelated concurrent work. Install dependencies and generate output independently
in each worktree. Fix failing checks rather than relax assertions; mutation-check new contract guards.

Commit usable logical checkpoints with explicit paths and reviewed staged diffs. No pushes, publishing,
release workflows or PR operations without separate authorization. No compatibility aliases or
old-format settings/discovery paths, including temporary boot/import fallback or invalid-value exemptions.
An unresolved required contract or failing acceptance check keeps the goal open; document blockers
instead of calling it complete.

## Evidence

Checkpoint history and validation logs live in [the evidence record](../evidence/settings-and-pack-contracts.md).
The live ledger and acceptance register above own current work and closure. Preserve unresolved
requirements recorded in that history; moving evidence does not complete or exclude them.

## Outcome

Pending implementation. At completion, record each phase's results, evidence, design corrections,
final naming completion SHA and any genuinely out-of-scope follow-ups.
