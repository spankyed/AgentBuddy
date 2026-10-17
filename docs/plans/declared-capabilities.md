# Declare the APIs a pack consumes

Status: A1 selection and A2 declaration, pre-import/admission and read-only diagnostics are implemented.
A3 runtime/type filtering and lifetime binding are next. Remaining discovery/build ownership work stays active in the [owning goal](../goals/goal-settings-and-pack-contracts.md); it blocks only
the slices that consume its missing guarantees. This is an API dependency contract, not a security sandbox.

## Problem

The manifest declares provided services, but consumption of host and dependency APIs is mostly implicit.
Generated service types alone do not restrict runtime objects. The 2026-10-08 survey found a per-pack
facade casting an ambient SDK object, direct SDK service imports, and `permissions` used as display
metadata. The A1 audit/prototype below confirms those paths and records the selected contract.

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
- Keep provided-service declarations distinct from consumed APIs. Use pack-level qualified refs in
  `consumes.services`, as selected in A1; do not restore the old per-feature `capabilities` sketch.
  A per-feature contract requires genuine feature-bound facades and execution context, not a widened pack union presented as isolation.
- A declared dependency does not automatically mean every API it provides is consumed. Required API
  availability is validated before activation. Optional integrations wait for a concrete consumer.

Settings retain [shared dependency read/write/reset by default](settings-architecture.md), with opt-in
owner-only mutation. Baseline settings availability and satisfying the selected target’s mutation
policy are separate checks; neither replaces the other. Host app settings follow the host SDK contract.

The settings ownership review found a supported administration path that the inventory must resolve:
`_createPackServices()` forwards `AppDataService` without caller scoping, including whole-database
`reset()` and `importBackup()`. Default-setup's Database feature consumes both. These operations can
replace restricted settings without using the targeted settings writer. The first implementation slice
separates onboarding into `services.onboarding`; appData now holds only administration. Prototype an
explicit administration consumption/grant contract using that real Database consumer before selecting
syntax. Ordinary settings access must not implicitly grant whole-data administration; types and runtime
facades must agree. This addresses supported API authority, not arbitrary Node execution confinement.

## Delivery

### Current-code inventory (2026-10-12, interface split updated 2026-10-17)

The following findings are from the working settings candidate, rather than the earlier survey:

| Supported route | Current behavior | Required contract |
|---|---|---|
| Generated `services.settings` and settings handles | Bound at accepted registration; revoked on unload; target mutation policy checked | Retain caller identity and lifetime. Consumption declarations must not replace target policy. |
| Generated `services.appData` | Four administration methods forwarded through the ambient host delegate | Require explicit administration consumption; preserve reset/import effect and failure semantics. |
| Generated `services.onboarding` | Separate `isComplete`/`complete` interface over host-owned AppState; in-memory host/harness share the contract | Allow selection without exposing appData; bind its accepted caller/runtime lifetime with the other mediated services. |
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

A1's bounded prototype exercised onboarding without administration, Database with administration,
selected versus unrelated providers, retained methods after replacement/rebind and the actual action
runner. Preserve those cases in production acceptance. The selected contract is pack-level; no
feature-local isolation or general sandbox is introduced.

1. Audit actual consumption in default-setup, fixtures, scaffolds and supported local/URL pack installs.
   Record which APIs are explicit, which are an intentional SDK baseline, and which cannot be mediated
   by this facade. A1 below records that audit and the selected prototype; A4/A5 own the real authoring/runtime migration.
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

### First implementation slice: onboarding versus data administration

Source `b39c189b8` separates the three onboarding action sources' completion API from Database's
reset/export/import/backup inspection API. `services.onboarding.isComplete()` / `.complete()` represent
host lifecycle state, while `services.appData` retains whole-data administration. Onboarding belongs to
the host and uses its owning engine's existing AppState row, not a pack feature or preference group.
The in-memory host, harness, authored actions, fixtures and public reports are migrated; old appData
methods are removed. This establishes API granularity, not permission enforcement.

Owning-engine, reset/restore and generated-service acceptance is recorded in the owning goal's
onboarding evidence. Retain it for final validation; do not repeat that extraction or rebuild the pack
just to choose consumption syntax. The subsequent combined A1 prototype records that choice below.

### A1 prototype decisions (2026-10-17)

The bounded prototype ran real `generatePackFiles`, host registration/replacement and the existing
action runner. A generated onboarding consumer sees its selected Search service and no appData or
unrelated installed service; removing those members produces actual TypeScript property diagnostics.
The real Database reset handler runs with the administration facade and emits success. The SDK flow
query it uses is registered normally; EARS/repositories are not put behind a new permission model.
Private-field service methods retain their receiver when destructured. Retained methods refuse after
provider replacement (including replacement reusing the same service object), caller retirement/rebind
and host replacement. Reacquiring a service after provider replacement uses its new accepted instance.
Action sends retain `from` and `via` attribution. See the owning goal's evidence record for the script,
results and boundaries; this prototype is not a production runtime implementation or a strict gate.

Use this contract for A2–A5:

```json
{
  "consumes": {
    "services": ["host/onboarding", "search-pack/search"]
  }
}
```

- Consumption is pack-wide. The refs name a provider pack and its service key; they are not feature
  refs (service keys retain their existing identifier grammar). `consumes.services` is a unique list,
  separate from the service exports the pack provides. Do not add another authored provider inventory.
- The intentional SDK baseline is logger, emitter, repository and caller-bound settings. Its own
  declared services are available to a pack. Everything else requires an explicit service ref.
  Onboarding is separate from appData administration; no per-feature isolation is claimed within a
  pack consuming both. Explicit baseline/own refs are redundant but have the same meaning.
- A non-host provider must be the pack itself or a declared direct dependency, and must directly
  declare that service. Selecting a dependency's transitive/consumed facade members is not ownership.
  Reuse the common catalog's accepted authored/native declarations and existing API collision checks.
- Registration validates required declaration availability; a call checks accepted provider readiness.
  An unavailable provider refuses with caller, service and provider named. Do not activate it lazily.
- The host constructs the accepted selection and supplies it to generated bindings. A registration
  cannot request more authority by changing a generated type or supplying a different caller ID.
  Generate the type projection from the same normalized selection: own services, baseline, selected
  HostServices members and `Pick` of each directly owning dependency's provided services.
- Retained service objects, nested service objects and methods retain their caller/provider generation.
  Retirement, disablement or host replacement refuses new operations. A new property lookup by a live
  caller may acquire a current compatible provider; it must not revive an already retained handle.
  Refresh the generated exported facade on caller rebind so retained root facades also stay retired.
- Preserve private receivers and method binding. Do not cache wrappers only by service object identity:
  the same object can occur in two registration generations. Scope caches by accepted ownership.
- Calls already started may settle against their original accepted implementation; report actual
  reset/import commit outcomes rather than pretending retirement rolls back effects. Settings
  subscriptions keep their existing suppression/cleanup owner. A3 must handle inference agent methods
  as new calls and define stream retirement explicitly, without wrapping ordinary result data in a
  general security membrane. Returned resources with further operations need named adapters/checks.
- Carry the accepted facade into action execution. Its logger/emitter attribution must retain that
  binding lifetime. Remove the supported ambient service-import bypass with actual consumer migration.

Additional audit boundaries remain explicit: generated repositories, SDK EARS helpers, content appliers,
frontend settings/secret ports and direct Node/package imports are distinct routes. The first four
use their existing ownership/policy contracts; this service declaration is not a claim to confine
arbitrary JavaScript. Database-console administration and user-authored actions need their real A4
checks. Preserve current shared-settings policy and the documented query model.

| Route / producer | Actual consumer and entry point | Ownership and migration |
|---|---|---|
| SDK logger/emitter and host engine repository | `services/index.ts`; action sends and generated repository/service facades | Intentional baseline; capture the accepted host, preserve the documented query model and sender labels. |
| Scoped settings | `_createPackServices`, generated settings handles, host `createPackSettingsBinding` | Baseline; preserve accepted pack identity, target policy and subscription cleanup. |
| Host I/O and lifecycle services | Onboarding actions, Database, query/LLM steps, library embeddings; contracts in SDK `services/` | Six explicit groups: onboarding, appData, traceStore, inference, secrets, filesystem. Default-setup's user-authored action surface intentionally supports all six, including APIs without a shipped action call site. |
| Pack-provided services | `generateServices` and registry API ownership; default-setup provides chat/artifact/threads/cli/codex/library/action/prompt/brain/scheduler/database | Own services implicit; selected services of direct providers explicit. Preserve classes/private receivers and validate ownership from declarations, not a dependency's intersected facade. |
| Ambient SDK services import | `extensions/steps/llm/runtime.ts` and `features/actions/be/services/action.ts` in default-setup | Migrate to the generated facade and remove the supported ambient bypass in A3/A4; host/test composition gets an internal accessor where needed. |
| User-authored actions | `runActionCode`, ActionService and brain's `getAppServices` | Brain already passes generated services; ActionService still passes the ambient union. Both must use the executing pack's accepted facade with attributed logger/emitter. |
| EARS/repositories and database console | Generated `ears.ts`/`repository.ts`, SDK repositories, Database query/transaction helpers | Existing engine/declared repository ownership remains. No new entity grants or confinement claims. |
| Content appliers/writers | Generated content runtime and SDK `content/writers.ts`, host apply/registry | Existing entity/writer ownership remains. A4 validates targets through normalized declarations/dependencies; applier execution is not a service grant. |
| Fixtures, scaffolds and install paths | External-pack repository actions use the baseline; its harness-isolation spec needs host/inference, and shared-engine.spec.ts still imports ambient services. CLI action/service templates use generated Services or provide their own object. Local/URL/GitHub installs converge on verified build/staging before runtime loading. | Migrate those fixtures, preserve mockService behavior through the accepted selection, keep baseline-only scaffolds minimal, and apply the same pre-import host checks regardless of origin. |
| Frontend ports | SDK `fe/settings.ts`, `fe/secrets-client.ts` over the bound window host | Preserve their existing owner/policy and window lifetime. Backend service refs do not expose a new frontend transport. |
| Direct Node/package access | Default-setup code/library services and external authored JavaScript | Outside this API facade's mediation; security isolation remains separate. |

A2 foundation `1a0de64fb` implements canonical host names/baseline, shared authored/native grammar,
one direct service-ownership/selection projection, build-time provider checks and schema assistance.
Catalog tests retain requests in native/source/disabled installed data without activation and reject
a changed request with stale source identity. The A2 admission checkpoint now resolves requirements
through one catalog snapshot before runtime import and again before registration bindings. It checks
direct service ownership, provider versions, enablement, invalid installed declarations and providers'
own requirements; cycles use the prospective candidate contract. A source-only preview can satisfy
another source consumer, never an installed/native consumer. Invalid installed data cannot be masked
by source previews. CLI validation checks available dependency declarations independently of source
validation/codegen; unavailable local data produces an incomplete report. Human inspection lists
qualified service requests; JSON inspection retains the authored declaration.

This proves declaration availability, not executable readiness: a provider may still fail while loading.
A3 must bind the accepted service implementations and handle provider failure/replacement and caller
retirement. Implement lifetime/filtering and generated types together before migrating all consumers
and completing external runtime/docs acceptance. Do not add a runtime `consumes` inventory when the
host already holds the accepted declaration.

Rechecked the service proxy, `_createPackServices`, SDK `generateServices` and Database consumer on
2026-10-16. The ambient runtime union, generated dependency intersections and settings-only binding
remain present. A1 confirms those gaps; preserve them as A3 work rather than repeat the baseline audit.
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
the A1 qualified-ref contract is settled. Do not repeat the prototype to choose syntax.

### Preserve the A1 decisions through implementation

Record each supported route's producer, real consumer, current entry point, provider identity,
accepted caller/lifetime owner and disposition: intentional baseline, explicitly consumed API, internal
host operation, or a documented route outside service-facade mediation. Cover generated services,
direct supported SDK imports, repositories/EARS, content appliers and user-authored actions. Each row
needs a concrete migration or existing-proof link; lack of a failing test does not close the inventory.

Use the selected API groups and pack granularity; feature-local
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
