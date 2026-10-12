> Written 2026-10-12 in the settings/discovery planning session.

```text
# Goal: complete settings and discoverable pack contracts

Implement docs/goals/goal-settings-and-pack-contracts.md. Read CLAUDE.md, Background, Decisions,
Integration workflow, Phases and Constraints first. The surveyed base is cf8bc7c1b on
session/naming-contracts; start from the current committed state of that branch, not master.
Create a dedicated branch and worktree as explicitly requested. Preserve the source checkout's
uncommitted work; never share dependencies, generated output or the index between worktrees.

Follow the linked subsystem plans without duplicating their designs here. This goal owns execution,
checkpoints and completion; manifest-maturity owns the roadmap and subsystem plans own contracts.
Audit actual code before implementation. Record evidence-based corrections in the owning plan.

Commit each validated implementation checkpoint before beginning the next. After every checkpoint,
check session/naming-contracts for newer commits. Merge tested committed updates, resolve conflicts
and validate the combined result before proceeding, following Integration workflow. Do not reimplement
naming changes independently. Naming must be complete, validated and integrated at final sign-off.

Finished when:
- Phases 0–7 meet their Done when conditions, including all three Phase 6 workstreams.
- Host, pack and feature settings use the common declarative contract and migrated stored data.
- Every supported contribution is discoverable without executable pack/dependency activation;
  generated bindings, catalog identities, updates and source-build freshness agree.
- Entity navigation, frontend boundaries, supported consumed APIs, dependency provenance and
  explicit shipped-pack replacement satisfy their linked plans and external-pack checks.
- The latest agreed naming completion commit is an ancestor of this branch, its validation is recorded,
  and no naming merge/conflict or required implementation remains deferred to a later integration pass.
- Changed public schemas, API reports, templates and docs agree; final validation passes.
- Record outcomes, corrections and validation, then archive this goal and completed subsystem plans
  with repaired links. Deferred work remains deferred.

Commit as you go, including integration resolutions. Do not push, tag, open/merge PRs, publish,
trigger release workflows or edit release/version metadata unless separately requested. Follow the
Constraints for isolated test data, typed EARS, migrations and validation. No compatibility shims.
```

# Complete settings and discoverable pack contracts

Status: planned. This is the execution goal for the six active items in
[manifest maturity](../plans/manifest-maturity.md); lazy activation is deferred.

## Background (2026-10-12, at cf8bc7c1b on session/naming-contracts)

The settings and discovery designs have been reconciled but are not implemented. Their documentation
commits were moved to master and the naming branch rebased onto them. The current committed naming
branch contains the resulting plans and successive naming refactors, so branching from master would
omit the naming API baseline used by this work.

The naming goal is moving from its active location to
[the archive](../archive/goals/goal-naming-conventions.md). Its current status says implementation complete,
final validation pending. An archive path alone is not evidence of completion. Recheck both locations
and actual committed outcomes at kickoff; do not import uncommitted source changes or claim validation
from a moving working tree.

The six items are naming integration, shared foundation, settings, full discovery, navigation/fault
boundaries, and API consumption/provenance/replacement. The last item contains three distinct deliverables.
Current code paths and names must be re-audited after each naming integration. The linked plans contain
historical surveys alongside target contracts; a survey is not a claim about the current tree.

## Decisions

1. **One working branch, isolated from naming development.** Fork the current committed naming state
   in a dedicated worktree. Naming continues on its source branch; integrate updates throughout this goal.
   The user explicitly authorized branching/worktree creation and incremental commits for execution.
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
5. **Integrate naming rather than duplicate it.** Merge its tested commits, adapt this branch's new APIs
   to the resulting conventions and fix conflicts immediately. Do not apply retired blanket naming bans.
6. **Finish the whole active scope.** Phase 6 has separate API, provenance and replacement checkpoints.
   None is silently dropped because the settings/discovery work is substantial. Strong security isolation,
   general lazy activation and speculative package-manager work remain outside this goal.
7. **Contracts are maintained when they change.** Migrate all owned callers, fixtures, templates and public
   docs at each checkpoint; regenerate affected schemas/API reports then. Stored user data requires
   idempotent migration under the repository's current migration rules; code needs no compatibility aliases.

## Integration workflow

### Kickoff

Record the current committed source tip and branch name (`session/naming-contracts`), the goal branch,
worktree path and naming tip already incorporated. Use the repository session workflow:

```sh
npm run session:new -- settings-pack-contracts <pinned-source-commit>
```

This creates `session/settings-pack-contracts` with its own dependencies and builds. Continue all edits,
validation and commits there. If that name is already in use, resume the matching goal worktree or choose
an unused explicit name; do not overwrite a branch. The goal doc must be committed and present in the
chosen starting state before execution. Existing source-checkout changes belong to their author.

### After every implementation checkpoint

1. Run the checkpoint's checks, inspect the staged diff and commit its logical changes. The goal worktree
   must be clean before integration. Record the implementation commit and evidence in Progress.
2. Resolve the naming source to an exact committed SHA and compare ancestry with the goal branch.
   If its tip is already an ancestor, record “no new commits” and continue. Never copy its dirty files.
   If it is distributed remotely, fetch its configured remote and check that its local/remote tips agree;
   handle divergence explicitly instead of guessing which is authoritative.
3. For new commits, follow `npm run session:check -- <pinned-naming-sha>` from the clean goal checkout.
   This tests a detached combined candidate under the repository's strict integration workflow.
   If refs advance during validation, pin the new tip and recheck. Do not mix tested and untested commits.
4. If conflict-free validation passes, merge that tested naming SHA into the goal branch. If the candidate
   conflicts, resolve the conflicts in the candidate and inspect semantic changes. Install/build its own
   dependencies and outputs (the helper stops before setup on a merge conflict), then run its full strict
   chain following the session helper’s setup/validation commands. Record both pinned parents and the validated resolution commit.
   Fast-forward the clean goal branch to that tested merge commit only while its original HEAD is unchanged.
   Never merge conflict markers, stage unrelated work or weaken an assertion merely to combine branches.
5. Confirm the merged naming tip is an ancestor, record the integration commit and checks, and ensure the
   worktree is clean. Check the naming tip again before starting the next checkpoint; repeat if it advanced.

Apply this loop to sub-checkpoints inside large phases, not just the six umbrella items. Integrations are
committed as they happen. Do not rewrite or push the naming source branch as part of this workflow.

### Final naming closure

Repeat the loop at final sign-off. Confirm the naming goal's implementation and validation are complete,
then record the exact naming completion SHA and prove it is an ancestor of the goal branch. If naming
remains unfinished, continue useful independent work but keep this goal open; an early archive is not a
substitute for completion. If a new naming commit arrives during final checks, integrate and revalidate
before closing. A later unrelated branch update does not invalidate a recorded completion boundary.

## Phases

### Phase 0 — Isolate the work and establish the baseline

Create the worktree from the current committed naming state. Inspect the linked plans against that code,
record current contribution/setting entry points and naming completion status, and perform an initial
integration check. Use existing isolated fixtures for stored-data and app checks.

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

Deliver these independently, committing and synchronizing naming after each logical checkpoint:

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

Perform final naming closure, then review the entire implemented diff for correctness and completeness
against the inventory and each plan's acceptance criteria. Fix omissions and bugs, commit them, and repeat
the integration loop when needed. Check failure paths, artifact revisions, dependency ownership, import
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

Record implementation and integration as work proceeds:

| Checkpoint | Implementation commit / evidence | Naming SHA integrated | Integration commit / evidence |
|---|---|---|---|
| Kickoff | Pending | Pending | Pending |

## Outcome

Pending implementation. At completion, record each phase's results, evidence, design corrections,
final naming completion SHA and any genuinely out-of-scope follow-ups.
