# Make pack manifests dependable contracts

Status: in progress; scope reconciled 2026-10-14. Originally written 2026-10-12 on `AS/feature-settings-rework`.

## Goal and sequence

The host and authoring tools should explain what a pack provides, what it needs, whether it can run,
and why it failed. Authors should discover mistakes before installation or activation, and a dependency
resolved on one machine should be explainable on another.

apack already has generated schemas and accessors, snapshots, artifact integrity checks, migrations and
host-version checks. Build on these mechanisms. The priority is completing their contracts rather than
adding fields because another ecosystem has them.

Completed prerequisite: [naming contracts](../archive/goals/goal-naming-conventions.md), closed in
`3d389b9c8`. Build on that result; no ongoing naming synchronization is required.
The [execution goal](../goals/goal-settings-and-pack-contracts.md) owns checkpoints and completion.

Deliver the remaining work in this order:

1. Close the contribution inventory and establish the common descriptor/catalog foundation, using
   [settings architecture](settings-architecture.md) as the first consumer. Include shared validation, diagnostics, checked binding and artifact freshness for each migrated kind. Do not create a temporary settings-only catalog.
2. Complete settings ownership, current-format stored data, typed access, shared/owner mutation policy,
   custom forms and the independent window runtime.
3. Complete the required [manifest consolidation](manifest-consolidation.md), checkpoints M1–M6,
   before extending more consumers across the old entity/shape split. Preserve generated EARS and
   unchanged compiled content identities; do not treat authored-contract changes as optional audits.
4. Complete [discovery without activation](discovery-without-activation.md) and delete superseded glue.
   Extend the foundation’s descriptor/codegen freshness and checked binding to every supported kind.
5. Deliver [entity navigation](open-entity.md) and frontend error boundaries from
   [fault isolation](pack-fault-isolation.md), using catalog destinations and explicit readiness.
6. Finish consumed-API contracts, dependency provenance and
   [shipped-pack replacement](replaceable-shipped-packs.md) as separate workstreams. Replacement depends
   on validated artifact publication and committed catalog updates; consumed APIs need not wait for replacement.

Treat each item as a separately scoped change with its own evidence and validation. This plan is the
roadmap; the linked plans hold subsystem design. Do not implement all of them as one manifest rewrite.

## Checkpoint handoffs

| Checkpoint | Required result before the next work starts |
|---|---|
| Naming — complete | Use the completed contracts as the starting baseline; do not repeat their refactors |
| Shared foundation | Contribution inventory, common descriptor reader/validator and catalog; settings definitions are the first projection. Migrated kinds have checked bindings and coherent build publication |
| Settings | Host/pack/feature ownership, current-format stored data, schema-backed handles and policy, custom forms and window runtime work on that foundation |
| Manifest consolidation | Entity/shape ownership, relations, lifecycle, checks, descriptions, format-key removal and canonical writing satisfy M1–M6 with preserved EARS/content behavior |
| Complete discovery | Every supported kind and static consumer uses descriptors; activation outcomes remain separate, stale loads are rejected and obsolete discovery glue is deleted |
| Navigation and boundaries | Catalog destinations drive entity opening; failing panes/forms leave the shell usable |
| API consumption, provenance, replacement | Independent follow-ups reuse catalog identities and caller binding; replacement distinguishes update ownership, disable and removal |

The settings and discovery delivery lists are parts of these checkpoints, not competing roadmaps.
Inventory all contribution kinds up front; migrate one kind at a time with its validation, binding and
freshness checks in place before switching its readers. Future contribution kinds extend that same
contract and coverage fixture. Discovery completeness is about supported declarations, not live query results.

## Plan ownership and supersession

This document owns ordering and remaining manifest decisions. Settings and discovery own their detailed
contracts. The following older designs are archived as absorbed/superseded, not marked implemented:

| Historical document | Current owner / disposition |
|---|---|
| [Convention-first manifest](../archive/plans/manifest-convention-first.md) and its example | Discovery keeps the complete generated descriptor; implicit contribution existence is rejected |
| [Declarative contributions](../archive/plans/declarative-contributions.md) | Discovery owns its inventory, data boundary and checked binding |
| [Manifest redesign goal](../archive/goals/goal-manifest-redesign.md) and its example | Remaining-work ledger below; the example is not a target schema |
| [Facade naming goal](../archive/goals/goal-defs-naming.md) | Descriptor work owns facade terminology and missing-contract diagnostics |

The [naming contracts goal](../archive/goals/goal-naming-conventions.md) is complete; its contracts are the baseline for this work.
Do not duplicate its renames in the settings/discovery implementation. Settings-specific names stay in
the settings plan, as that goal already specifies.

### Remaining-work ledger from the archived designs

| Item | Decision and destination |
|---|---|
| Complete generated inventory, event contracts and static assets | Adopt in discovery; declarations determine supported contributions, build materializes their complete descriptor |
| Conventional implementation paths | M4 completed in `11bdc7faa`: one scaffold path definition, declared-target validation/doctor and real external authoring agreement. No implicit existence or forced file renaming. M6 still owns final documentation/schema coverage |
| `provides` lists and filesystem-inferred existence | Reject as a second authority beside existing keyed declarations; do not implement the old feature grammar |
| Entity names/shapes and feature ownership | M1 implemented in `2fff8bb76`: merge declarations on owning features or `data.entities`, explicit null for untyped, one projection, preserved generated EARS and all readers |
| Relation identity maps | M2 implemented in `3ff590240`: `data.relations` wire lists, unchanged generated EARS/content, validated names/uniqueness/reservations, native bindings and collision/provenance behavior |
| `volatile` declarations | Do not resurrect removed partition policy without a real requirement; track storage semantics with the LMDB work |
| `boot`/`lifecycle` metadata | M3 implemented in `e063ec1a5`: explicit lifecycle targets, shared native/installed checked hook bindings, preserved order and byte-identical compiled content |
| Module-reference syntax | M1 uses one shape-reference parser; M4 type authoring implemented in `0e65ece42` uses explicit module paths with type-only export-star semantics. Shared named/default parsing and contained file resolution implemented in `4285d748c`. M4 grammar/inventory/conventional-export and authoring checks are complete through `11bdc7faa`; richer component/loading declarations remain intact. Full contribution-kind discovery and M6 coverage remain required |
| Schema descriptions, current-schema diagnostics, semver/ranges | Adopt in validation/diagnostics and every surface-changing checkpoint |
| Default navigation and feature descriptions | Feature descriptions implemented in `ae7a995bd` through schema, scaffold, native/catalog and inspection. M4 target/layout and native/frontend default-claim checks completed in `11bdc7faa`; first-registered cross-pack policy is documented and tested. Full discovery/navigation remains required |
| `builtIn` and shipped provenance | Replacement owns behavior changes; provenance is host-established, never author-declared trust |
| Build/check configuration and sidecars | Preserve build options; required M5 moves allowances to `checks.allow` and removes the sidecar, with unknown/non-switchable refusals. M6 centralizes current-shape writing/order |
| `extensions.fe` and `hostVersion` questions | Settled in consolidation: public `extensions.frontend` during its declarative migration; keep `hostVersion` for one host range. No blanket fe/be rename |
| Snapshot `defs` versus DSL definitions | Required `facades`, `PACK_TYPES_FACADE`, cache `facades/`, named required-facade refusals and unchanged capability-based acceptance; keep actual DSL defs |
| Format/version assumptions | Required M5 removes `$manifestVersion` and audits exact layout-stamp acceptance; preserve current snapshot/layout constants and release metadata, separately from facade capability acceptance |

The [complete reconciliation](manifest-consolidation.md) accounts for every original decision, both
naming questions, phase checks, flow/action dependency edges, CLI contribution inventory, authoring
tool agreement and unchanged-content identity. Each active requirement needs implementation evidence;
this ledger is not permission to downgrade an outcome to a survey.

### Other tracks and documents to revisit

- [Lazy activation](deferred/lazy-activation.md) is deferred by request, outside the active sequence.
  Revisit only when boot attribution justifies it; discovery completion does not trigger this work.
- [Dev-loop freshness](../goals/goal-dev-loop-freshness.md) remains a scoped follow-up; descriptor freshness
  needed by discovery belongs in discovery's checkpoints, not in an unrelated package watcher redesign.
- [Pack security isolation](../goals/goal-pack-security-isolation.md) remains a separate design-first goal.
  Reconcile its frontend isolation input there; security confinement is not required to discover data.
- [LMDB-only](../goals/goal-lmdb-only.md), console transactions and advisory locks remain a separate storage
  track. Settle their overlapping transaction/lock decisions together before changing persistence.
- Plugins-to-surfaces, logs extraction and distribution remain deferred. Re-audit their APIs after the
  earlier contract changes; none is a prerequisite here. [Stretch-projection removal](drop-the-stretch-projection.md)
  is independent tooling cleanup, not part of the manifest workstream.

Update affected active docs at each checkpoint; archive a completed plan with evidence then. Preserve
historical text in the archive, with status and successor links. Public docs describe shipped/current
behavior until the corresponding implementation lands, not merely because a plan changed.

## 1. Complete discovery without activation

The complete scope and acceptance criteria live in
[discovery without activation](discovery-without-activation.md).

Settings is the immediate example: app, pack and feature definitions become data that the host can read
without importing an executable settings module. Follow the dedicated settings plan for that work.

Next, inventory labels, icons, commands and other contributions. For each, distinguish the facts needed
to list or validate it from the implementation needed to execute it. Move metadata still hidden in
runtime exports into declarations only where a real consumer needs discovery before activation.

The manifest declares the contribution once; codegen derives runtime registration and snapshot metadata
from it. Avoid a second handwritten contribution inventory. Reuse the existing build pipeline and
provenance machinery instead of building a generic extension framework.

Targets: SDK manifest schema, snapshot model, `generate-entries.ts`, host registration and frontend
contribution loading. The [reference inventory](../reference/declarative-contributions.md) explains the
current gap; the discovery plan is the implementation contract, not the archived contribution plan.

Evidence: a pack with a runtime that throws on import can still be described from its built declarations.
The declared names, generated registration and discovery result agree. Existing pack behavior survives.

## 2. Share precise validation and diagnostics

The first implementation checkpoint introduces shared `PackDiagnostic` / `PackValidation` records.
Manifest and feature checks carry codes, severity, owner and paths; `apack pack validate --json` renders
one report. Exit codes are 0 valid, 1 invalid and 2 incomplete. Dependency failure names skipped checks
instead of claiming validity. Validation resolves existing artifacts without downloads or cache writes,
including a selected beta host; malformed manifests skip checks that require their shape. Build and
installation keep their strict refusals. Remaining semantic checkers must adopt the same records as their
contributions migrate; semver/range tightening below is still outstanding.

Introduce a shared diagnostic record with a stable code, severity, owning pack, manifest path and human
message. Include a source location or actionable suggestion when available; do not require every checker
to manufacture one. CLI text and machine-readable output are renderings of the same result. Use the
same semantic checks in validation, build and install where their inputs are available.

Report valid, invalid or incompletely checked, including which checks were skipped and why. An incomplete
authoring check should remain useful offline; strict build/install gates must not mistake it for successful
validation. Decide exit-code behavior explicitly when adding machine-readable output.

Tighten existing values before adding more fields:

- `version` currently accepts a semver-looking prefix rather than validating the complete string.
- `hostVersion` is an unrestricted string in the schema, despite being interpreted as a range later.
- Export/source references use several conventions. Preserve intentional differences (component default
  exports versus named runtime exports), document them, and share resolution/checking where they overlap.
- Check dependency/reference errors at the earliest phase that has enough information; the host remains
  responsible for conflicts involving unrelated installed packs.

Targets: `manifest-schema.ts`, `build/validate.ts`, codegen export checks, CLI validate/build and installer
diagnostics. Use current-schema errors; do not retain obsolete-key inventories or migration hints.

Evidence: invalid semver/ranges fail at the manifest path; missing dependencies produce an incomplete
result; text and machine output report the same underlying issue; install refuses an invalid artifact
without partially changing the installed pack.

## 3. Declare consumed APIs

The manifest describes provided services, but consumed host and dependency APIs remain implicit.
`permissions` is presently displayed metadata; it does not govern service access. Resolve that mismatch
before presenting it as a permission guarantee.

Inventory actual consumption first. Define required host APIs and dependency-provided APIs, then generate
owner-bound handles exposing the intended surface. Runtime binding and generated types must agree;
ambient SDK imports must not silently bypass an authoring contract. Reuse the existing generated services
facade and module checks. Start with the APIs actually consumed by default-setup.

Follow the [consumed-API plan](declared-capabilities.md), beginning with its inventory and granularity decision. EARS/repositories and direct Node access are separate surfaces; withholding a
service object does not contain an in-process JavaScript pack. Call the feature an API dependency contract
unless there is an enforcement boundary supporting a stronger claim.

The stronger permission/security boundary is a separate
[pack security isolation goal](../goals/goal-pack-security-isolation.md). It covers both backend and
frontend ambient access and requires a design/prototype before choosing an isolation mechanism.
This workstream establishes API dependency contracts; it does not implement that sandbox.

Evidence: an undeclared API is unavailable through normal generated access, required unavailable APIs
produce an actionable failure, and tests can provide only the declared dependencies. An explicit shared
API remains usable by dependent packs. Document the actual trust model.

Optional dependencies should wait for a concrete integration that can operate without its provider.
When needed, distinguish absent optional integration from a broken required dependency and load only
the associated contributions; do not scatter provider-presence checks through feature code.

## 4. Preserve dependency provenance and reproducibility

Resolution currently considers workspace, linked checkout, installed app, cache and network sources.
Ranges and downloaded artifact integrity are already checked. `fetch-deps.ts` explicitly notes that cache
entries lose their source, so the same cached version cannot explain where it came from.

Record exact version, source and content identity with the existing cached dependency artifact. Show that
information through existing inspection/doctor tooling. Distinguish declared range from resolved version,
and source location from identity; a local directory can change without moving.

When distribution requires repeatable resolution, add a frozen mode that uses recorded identities and
refuses a changed/unavailable dependency instead of selecting another machine-local candidate. Design its
lock metadata around the existing resolution pipeline, after provenance is reliable. Do not add a package
manager, registry, or redundant checksum system as part of this step.

Evidence: a cache hit retains origin; two resolutions expose why their artifacts differ; development
can intentionally use a linked build; frozen resolution cannot silently substitute that build for the
recorded artifact.

## 5. Make lifecycle and failure behavior explicit

Registration, replacement, disable, reload and uninstall checks belong to each discovery migration,
not a later hardening pass. Audit them for each contribution kind. Identify its
owner, collision/replacement policy, cleanup and observable notifications. Preserve intentional merging
of facets; exclusive ownership and multi-owner folding are different contracts.

Use the existing undo log and stores. Add shared implementation only when multiple contribution kinds
actually need the same behavior. Test that a failed registration does not remove another owner's data,
that replacement drops stale contributions, and that disposal removes listeners/resources.

Add frontend error boundaries around pack panes and forms with the pack named in the failure, a useful
recovery path and error reporting. The shell should remain usable when a contributed component throws.
Follow the frontend workstream of [pack fault isolation](pack-fault-isolation.md), checking what already landed.

Lazy activation is deferred, outside the active sequence: attribute boot cost before changing when
packs run. Derive activation from existing contributions where possible instead of making authors repeat
command/view declarations in an activation list. Preserve migration/content ordering and event delivery.
If resumed, use the [deferred lazy activation plan](deferred/lazy-activation.md) for the measured design.

Out-of-process backend packs are deferred. Synchronous EARS access makes this a data-contract redesign,
not simply a process-spawning task.

## Contract maintenance alongside every step

Make schema descriptions, public docs, templates and actual runtime behavior agree. Recent corrections
and their remaining acceptance illustrate the boundary:

- `builtIn` has been removed. App-source provenance and explicit update ownership replace the inert
  author-declared shipping privilege; pack authors cannot assert trusted origin.
- Reference metadata is now inline and validated for every pack. Its generated frontend aggregate
  remains pack-local; finish app-wide external binding/consumer integration before claiming full support.

Regenerate schemas/API reports when the public surface changes. Apply the repository's snapshot-format
rule when a reader would misinterpret a changed contract; do not bump package release versions. Update
existing plans if new evidence invalidates their assumptions, rather than leaving contradictory roadmaps.

## Research informing the direction

- [VS Code extension manifests](https://code.visualstudio.com/api/references/extension-manifest) distinguish
  contribution metadata, executable entry points, compatibility and dependencies. Adopt those meanings,
  not every marketplace field.
- [VS Code activation events](https://code.visualstudio.com/api/references/activation-events) document
  activation inferred from contributed commands/views. This supports deriving repeated facts.
- [JetBrains plugin dependencies](https://plugins.jetbrains.com/docs/intellij/plugin-configuration-file.html#depends)
  distinguish required providers from conditional integrations. Add that distinction when apack needs it.
- The Chrome permission comparison and stronger enforcement target are extracted into the
  [pack security isolation goal](../goals/goal-pack-security-isolation.md).

## Validation and scope

For each implemented item, use focused specs at the affected boundary, extend the external-pack fixture
when authoring behavior changes, regenerate changed contracts, and run `npm run chain`. Add targeted app
checks for lifecycle/error presentation. Check complete behavior, not just schema acceptance.

Keep marketplace categories, optional integrations, a new activation language and process isolation out
of the immediate work unless their named product or measurement trigger exists. Start with the shared
foundation and settings checkpoints; use the handoffs above to scope subsequent changes.
