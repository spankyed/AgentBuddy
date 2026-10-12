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

## Delivery

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

## Verification and handoff

A declared API works through generated and host-bound access; an undeclared API is absent through both
supported paths. A fixture with unavailable required dependencies fails with the owning pack and API
named. Removing a declaration exposes its real call sites at typecheck. Dependency settings obey shared
and owner-only policy regardless of consumption declarations. Content validation accepts legitimate shared
entities and rejects unsupported targets.

Regenerate changed schema/API reports, migrate docs/templates and run `npm run chain`. Feed the settled
consumption/caller contract into the security goal. Preserve API availability versus provider readiness
for any future activation work; lazy activation is currently deferred. This work need not wait for shipped-pack replacement.
