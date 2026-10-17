# Declare the APIs a pack consumes

Status: planned after settings and complete discovery, as ordered by
[manifest maturity](manifest-maturity.md). This is an API dependency contract, not a security sandbox.

## Problem

The manifest declares provided services, but consumption of host and dependency APIs is mostly implicit.
Generated service types alone do not restrict runtime objects. The 2026-10-08 survey found a per-pack
facade casting an ambient SDK object, direct SDK service imports, and `permissions` used as display
metadata. Re-audit those paths against completed naming and discovery before choosing the declaration syntax.

Authors need an accurate answer to which supported APIs their pack requires, actionable failures when a
provider is unavailable, and tests that can supply just those dependencies. This does not establish what
arbitrary JavaScript can do in the host process.

## Inputs and contract

- Use the common catalog for available API identities and dependency ownership. Extend its descriptor
  and coverage fixture when adding consumption metadata; do not create another inventory.
- Reuse settings’ trusted caller binding and generated owner-bound handles. Do not derive identity from
  a caller-supplied pack ID or mistake a type cast for runtime filtering.
- Inventory host services, pack/dependency services, repositories, EARS queries, content appliers and
  ambient imports separately. A service-name list cannot describe every route to stored data or Node APIs.
- Keep provided-service declarations distinct from consumed APIs. Choose the consumption field and
  granularity from the inventory; do not ship the old per-feature `capabilities` sketch by default.
  The existing per-pack facade favors an initial pack-level contract. A per-feature contract requires
  genuine feature-bound facades and execution context, not a widened pack union presented as isolation.
- A declared dependency does not automatically mean every API it provides is consumed. Required API
  availability is validated before activation. Optional integrations wait for a concrete consumer.

Settings retain [shared dependency read/write/reset by default](settings-architecture.md), with opt-in
owner-only mutation. Declaring consumption of settings and satisfying the selected target’s mutation
policy are separate checks; neither replaces the other. Host app settings follow the host SDK contract.

The settings ownership review found a supported administration path that the inventory must resolve:
`_createPackServices()` forwards `AppDataService` without caller scoping, including whole-database
`reset()` and `importBackup()`. Default-setup's Database feature consumes both. These operations can
replace restricted settings without using the targeted settings writer. Inventory onboarding reads and
completion separately from backup inspection/export and destructive whole-data operations. Prototype an
explicit administration consumption/grant contract using that real Database consumer before selecting
syntax. Ordinary settings access must not implicitly grant whole-data administration; types and runtime
facades must agree. This addresses supported API authority, not arbitrary Node execution confinement.

## Delivery

### Current-code inventory (2026-10-12)

The following findings are from the working settings candidate, rather than the earlier survey:

| Supported route | Current behavior | Required contract |
|---|---|---|
| Generated `services.settings` and settings handles | Bound at accepted registration; revoked on unload; target mutation policy checked | Retain caller identity and lifetime. Consumption declarations must not replace target policy. |
| Generated `services.appData` | All methods forwarded through the ambient host delegate | Separate onboarding operations from database administration in the public interface and declarations. |
| Database feature | Calls `exportBackup`, `importBackup`, `readBackupSummary`, `reset` | Use this actual consumer to prove declared administration access, denial before effects and the actual failure/commit behavior. |
| Authored onboarding actions | `check-onboarding` and `ignore-onboarding-message` read completion; `onboarding-helpers` completes it | This lifecycle API must remain usable without granting backup/import/reset. Do not manufacture an assistant feature. |
| Other host services | Generated `Services` includes every `HostServices` member | Choose an intentional SDK baseline and require explicit consumption for the remainder; generate types and runtime members from the same selection. |
| Dependency-provided services | Types intersect declared dependencies; the runtime proxy returns every registered pack's service | Runtime visibility must match declared providers, not merely the generated intersection. Registration already refuses host-name and cross-pack collisions; preserve that protection. |
| Captured non-settings service objects | Ambient delegates resolve the currently bound host on each call | Bind all mediated services to the accepted runtime lifetime; a retained delegate must not silently act on a replacement registration or another bound host. |
| SDK `services` import | Public ambient proxy remains available | Remove this supported bypass for pack source through validation and the public surface as appropriate; deleting a generated type alone is insufficient. |
| Repository/EARS and user-authored actions | Generated repositories, engine helpers and injected action `Services` remain separate routes | Preserve the documented query model; carry the executing pack's accepted service facade into action execution. Do not claim service filtering confines database or Node access. |

The registration collision guard is in `apack-host/src/packs/registry.ts`; it already reserves all host
service names. The runtime/type mismatch is instead in SDK `resolveServices`, `_createPackServices`
and codegen's `generateServices`: the latter knows dependencies, while the runtime still consults a
global union. An administration-only fix would leave that larger mismatch intact.

Before choosing syntax, prototype these cases together: onboarding without administration; Database
with administration; one dependency service with another installed but undeclared provider; a retained
method after unload/re-registration; and content actions receiving the same accepted facade. Use a
pack-level declaration first unless the prototype demonstrates a need for genuine feature-local
facades. These are acceptance cases, not a new settings assembly or a blanket sandbox promise.

1. Audit actual consumption in default-setup, fixtures, scaffolds and supported local/URL pack installs.
   Record which APIs are explicit, which are an intentional SDK baseline, and which cannot be mediated
   by this facade. Settle pack/feature granularity and syntax with a representative generated prototype.
2. Add consumption metadata to the existing manifest/descriptor pipeline. Reuse shared diagnostics for
   unknown API names, unavailable required providers and dependency ownership errors.
3. Construct caller-bound runtime facades from that declaration; generate types from the same facts.
   Remove supported ambient service-import bypasses through the existing pack validation/build checks.
   Host binding must apply the same supported API contract even when a caller bypasses generated types.
4. Migrate every in-tree consumer and test. Keep settings policy and notifications unchanged. Report the
   actual API contract through pack inspection; do not label it a resource permission guarantee.
5. Validate compiled content entity targets against normalized supported declarations and dependencies,
   including shared SDK entities. This independent check may land earlier during discovery if its inputs
   are ready. It diagnoses content contracts without changing runtime query access.

Data/resource confinement belongs to the separate
[pack security isolation goal](../goals/goal-pack-security-isolation.md). This plan neither adds entity
read/write grants nor silently removes documented EARS affordances. Do not block supported API contracts
on a speculative sandbox, or claim they close direct Node or ambient runtime access.

## Bounded implementation checkpoints

Rechecked the service proxy, `_createPackServices`, SDK `generateServices` and Database consumer on
2026-10-16. The ambient runtime union, generated dependency intersections and settings-only binding
remain present; the dated inventory above is a starting point, not a completed current-code audit.
Use the active goal's execution order and existing catalog/runtime owners. These checkpoints partition
this workstream; they do not introduce another goal or require a new dependency container.

| Checkpoint | Concrete output | Closure evidence |
|---|---|---|
| A1 — Inventory and representative prototype | A finite API-route matrix and selected declaration/granularity, exercised through real codegen and host binding | Onboarding without administration; Database with it; declared versus unrelated installed dependency service; retained method after retirement; action execution with the accepted facade |
| A2 — Common consumption metadata | One normalized selection in the manifest/catalog pipeline, with explicit provider ownership and intentional SDK baseline | Unknown names, unowned providers and unavailable required APIs refuse with the consuming pack/API/provider named; offline inspection reads declarations without activation |
| A3 — Matching types and runtime access | Generated and host-bound service facades use the same accepted selection and runtime lifetime | Removing consumption fails real call sites; untyped supported access cannot retrieve undeclared services; retained objects/methods cannot rebind to another runtime or host |
| A4 — Real consumer and content migration | Default-setup, authored actions, fixtures, scaffolds and external authoring use the selected contract; compiled content targets use normalized entity/dependency declarations | Database/onboarding and dependency consumers run; settings policy remains intact; legitimate typed/untyped and shared SDK content targets pass, unsupported targets refuse |
| A5 — Converged acceptance and handoff | Schema/API reports, inspection, public docs and templates agree with the implemented contract | Focused acceptance plus required checkpoint validation and actual external-pack runtime proof; source commits and unresolved cases recorded in the owning goal's evidence record |

A4's content-target validation may land independently when its existing declaration inputs are ready.
Do not restart it if inspection finds it already implemented. A2/A3 depend on the settled A1 selection;
prototype names are not public contract until that decision is recorded.

### Decisions A1 must settle

Record each supported route's producer, real consumer, current entry point, provider identity,
accepted caller/lifetime owner and disposition: intentional baseline, explicitly consumed API, internal
host operation, or a documented route outside service-facade mediation. Cover generated services,
direct supported SDK imports, repositories/EARS, content appliers and user-authored actions. Each row
needs a concrete migration or existing-proof link; lack of a failing test does not close the inventory.

Select the smallest useful API groups from actual consumers. Start at pack granularity; feature-local
consumption requires an actual feature-bound execution/facade model. At pack granularity, separating
onboarding from administration does not isolate two features of a pack that consumes both. It gives
packs that only need onboarding a smaller supported interface. Do not describe that as per-feature
privilege isolation or invent an assistant feature to obtain it.

Keep four questions separate:

- What API does this pack consume, including any intentional baseline and access to its own services?
- Which declared provider supplies it, and does the accepted catalog contain that required contract?
- Is that provider ready now, or does the current lifecycle require waiting or refusing this call?
- Does the target operation's own policy permit it, such as restricted settings mutation?

Dependency declaration alone must not expose every provider service. Use stable identities from the
common catalog; do not make unrelated installation order determine resolution or availability. Missing,
disabled, failed, not-yet-ready and retired providers need explicit behavior under the existing lifecycle.
Do not add general lazy activation or silently redirect a retained handle to a replacement provider.

### Acceptance boundaries

Prove both generated types and runtime behavior, including destructured/retained methods, service
objects, subscriptions and pending results where the selected APIs expose them. Capture caller and
provider lifetimes through host-accepted bindings, not caller-supplied IDs or message labels. Define
retirement/cancellation and commit behavior for affected operations; do not promise rollback of already
committed backup/import/reset effects. Denied administration must fail before starting those effects.

Carry the executing pack's facade into user-authored actions and keep their existing attributed sends.
Removing supported ambient imports must migrate real callers and use existing validation/public export
boundaries; a build check is not confinement of arbitrary JavaScript. Retain documented EARS access,
repository ownership/collision behavior, shared/restricted settings policy and notification semantics.
Any proposed removal of a documented affordance needs an explicit design decision, not a type workaround.

Close each checkpoint with its implementation delta or evidence-only closure, focused acceptance,
source commit and remaining cases. Reuse existing proof; run broader validation at required checkpoints,
not repeatedly to choose syntax. A5 feeds the whole-goal final committed-source acceptance and does not
replace it. Actual API names, manifest syntax and any trusted administration policy must be recorded
from A1 evidence; this plan does not preselect security permission names or a consent UI.

## Handoff to security isolation

This plan supplies the [security goal](../goals/goal-pack-security-isolation.md) with supported API and
provider identities, generated/runtime facade agreement, accepted caller identity, runtime retirement
and revocation, and the onboarding versus database-administration separation. Repositories, EARS,
content appliers and user-authored action execution must be accounted for alongside services.

Security isolation owns confinement of ambient bypasses, authenticated broker connections,
resource/action grants, delegation and platform enforcement. An API dependency declaration is not a
resource grant. Naming/addressability and declared event membership are not caller authentication or
operation authorization. Keep requests, grants, provider availability and runtime readiness distinct.

The security audit and boundary prototypes may proceed in parallel with this work. Before production
integration, agree serializable operations, identity, administration, unavailable-provider errors and
retained-handle/in-flight revocation behavior. Prototype seams may be provisional; do not create a second
manifest/catalog or imply that filtering supported APIs confines arbitrary JavaScript.

## Verification and handoff

A declared API works through generated and host-bound access; an undeclared API is absent through both
supported paths. A fixture with unavailable required dependencies fails with the owning pack and API
named. Removing a declaration exposes its real call sites at typecheck. Dependency settings obey shared
and owner-only policy regardless of consumption declarations. Content validation accepts legitimate shared
entities and rejects unsupported targets.

Regenerate changed schema/API reports, migrate docs/templates and run `npm run chain`. Feed the settled
consumption/caller contract into the security goal. Preserve API availability versus provider readiness
for any future activation work; lazy activation is currently deferred. This work need not wait for shipped-pack replacement.

## Review evidence: repository availability (2026-10-13)

The actual engine previously used a prototype-bearing object for repository entries. Registering
`__proto__` changed inherited lookups rather than creating a discoverable own entry; removal did not
remove the inherited state. Missing `constructor`/`toString` also looked available. Commit `ccafe7396`
uses explicit keyed storage and verifies engine snapshots, lookup/removal and host replacement with
these names. The public types remain unchanged. Retain these tests when adding required-provider
checks; a declared API name cannot be considered available because it exists on Object.prototype.
This closes that concrete lookup defect, not the remaining API inventory, consumption declarations,
required providers or ambient/internal API audit.
