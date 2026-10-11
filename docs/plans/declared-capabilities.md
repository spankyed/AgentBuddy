# A pack declares what it consumes, not just what it provides

Compiled 2026-10-08 on `AS/one-action-cache`, from reading how a pack reaches the host's services after
`goal-one-kind-of-pack`. Every location below was checked against the tree on that date.

**This is the one item on the extension-host list whose cost grows with delay.** Retrofitting permissions
onto packs that assume ambient access is painful, and right now there is **one pack** to migrate and no
third-party pack to break — `resolveFromRemoteRegistry` (`apack-cli/src/commands/install.ts:17`) still
throws for every name.

## Context

`features[].services` in `apack.json` declares the services a feature **provides**
(`pack-registration.ts:57-58`: *"The keys of the services the feature provides"*). **Nothing declares what
a feature consumes.** Every pack reaches all nine host services — `logger`, `emitter`, `repository`,
`appData`, `traceStore`, `inference`, `secrets`, `filesystem`, `settings` (`packs/registry.ts:31`) —
including the two with real reach: `secrets` (the user's API keys as metadata) and `filesystem` (files and
folders on disk, as text).

`HOST_SERVICE_NAMES` exists only for **collision detection**: `registry.ts:422` refuses a pack whose own
service key takes a host name. It is not an allow-list of consumption.

So there is no answer today to "what can this pack do", which is the question an install prompt asks, a
review asks, and an incident asks.

## The enforcement point already exists

`#generated/services.ts` is generated per pack from `apack.json` and is what pack code imports. Its last
line is the whole of the gap:

```ts
export const services = sdkServices as unknown as Services;   // :61
```

A **cast**. The facade is type-level only; at runtime it hands back the SDK's ambient object, so the
manifest has no bearing on what is reachable. Making it a *constructed* object carrying only the declared
host services is a content change to codegen, not a new mechanism.

**The ambient path has to close with it.** Pack sources also import `services` straight from
`@apack/sdk/services` — both forms are present in `packages/default-setup/src` today — so the facade is
not exclusive. `check:specifiers` already rejects raw `broadcastToPlugin`/`sendToPlugin`/`sendToSystem`
imports in pack sources for exactly this reason; this is the same rule for the same kind of escape hatch,
and `apack validate`/`apack build` are where it binds for an external pack.

## The design

**1. The manifest declares capabilities.** Per feature, beside the services it provides:

```json
{ "id": "code", "capabilities": ["filesystem", "inference"] }
```

Host services only — a pack's own services and its dependencies' are already declared elsewhere. The list
to gate is the six the app implements: `appData`, `traceStore`, `inference`, `secrets`, `filesystem`,
`settings`. `logger` and `emitter` are the floor: the SDK's own implementations over the bound bus, with
nothing to withhold.

**`repository` is not the floor, and gating it would not be enough** — see *The data layer is the real
gap*, which is where this plan stops being about services.

**2. Codegen builds the facade from it**, so an undeclared service is absent at runtime and a type error at
compile time. The pack's own services and its dependencies' keep their current treatment.

**3. `check:specifiers` closes the ambient import**, following the event-send precedent exactly.

**4. The registry is the second gate**, for a pack whose bundle was not built by this repo's rules: it hands
a feature's services object only the declared keys. Codegen is the ergonomic gate; the registry is the real
one.

## The data layer is the real gap

**A capability list over services leaves the most sensitive surface open**, and this plan would be
misleading without saying so. Three paths reach a pack's and every other pack's rows, and only the first
looks like a service:

1. **`services.repository`** — the typed repositories, which an earlier draft of this plan called "the
   floor". It is not; it is data access.
2. **`untypedQx` / `untypedTx` from `@apack/ears`** — and this one is *documented as a pack affordance*:
   the root guide says pack code "queries untyped with `untypedQx`". Gating the repository while this stays
   open locks the front door and leaves the side door in the manual.
3. **Content**, which touch `services` not at all. An applier calls
   `createEntityWithDefaults(record.entity, …)` (`apack-sdk/src/content/format-applier.ts:164`) with the entity name
   taken from the pack's compiled content data.

**What is enforced today is declaration, not use.** The registry refuses a pack that *declares* a reserved
entity type or one another pack already declared (`packs/registry.ts:37`, `:324`). The engine's
`isEntityType` (`apack-ears/src/transaction.ts:28`) asks whether a name is a known entity type, never
whose it is — it has no concept of packs. So a pack may read every row in the app, and write rows of any
declared type, including another pack's.

### The decision this forces, which is not mine to make

Restricting the data layer contradicts a documented affordance. Either:

- **the data layer stays open by design** — defensible for a local single-user app where packs are
  installed deliberately, and the right answer is to *write that down* so it is a decision rather than an
  oversight, and to scope this plan's title to services; or
- **data access becomes a declared scope** — which is a different shape from a service list: not a boolean
  per name but a set of entity types, and read distinct from write. That is OSGi's import/export packages
  or a filesystem permission, not a flag, and it is a larger plan than this one.

### The cheap piece worth doing either way

**A pack's compiled content may only create entity types the pack declares** — derivable at build time from
`apack.json`'s `ears.entities` against the `record.entity` values in the compiled content data, and refused by
`apack validate` and `apack build`. It closes the content path without touching runtime queries or the
untyped affordance, and it is the same shape as the externals subset check `goal-one-kind-of-pack` landed
(`apack-cli/tests/build/pack-externals.spec.ts`): two declarations, one derived comparison, a build-time
refusal.

It is worth doing whichever way the decision above goes, because a pack applying another pack's entity types
is a bug under either model.

## Steps

1. The capability list in `manifest-schema.ts` plus `schema:update`, with the six gateable services as a
   closed union — a list and its type as one declaration, per the repo rule.
2. `generate-entries` builds `services` rather than casting it.
3. `check:specifiers` rule, with its firing case.
4. The registry gate, with a case that an undeclared service is absent.
5. default-setup declares what it uses — which is the migration, and the only pack to migrate.
6. The apply-ownership check above, which is independent of 1-5 and can land first.

## Verification

- A fixture pack declaring no capabilities and calling `services.secrets` fails: at compile time through the
  facade, and at runtime through the registry. **Both**, since each is a different reader's gate.
- `npm run chain`. The capability list reaching `apack.schema.json` needs `schema:update`, and the manifest
  type reaching the published surface needs `api:update`.
- default-setup's declared set is exactly what it uses: derive it by removing a capability and watching the
  typecheck name the call sites, rather than reading the list and believing it.

## Risks

**A closed union of service names is a published contract.** Adding a host service becomes a schema change
and an `api:update`, which is the point, but it is friction where there was none.

**The facade is per *pack*, the services are per *feature*.** `#generated/services.ts` is one module for the
whole pack, so a per-feature gate needs either a per-feature facade or the registry doing the real work with
the facade widened to the pack's union. The second is simpler and still closes the hole.

**It is not a sandbox.** A pack's code runs in the same process and can reach the bound runtime by other
means if it tries. This makes capabilities *declared, reviewable and enforced at the seam*, which is what
VS Code and Backstage do; containment is `pack-fault-isolation.md`'s subject and a different order of work.

## What this is not

- Not a user-facing permission prompt. The manifest is the prerequisite for one; the UI is separate.
- Not a change to how a pack reaches its *own* services or its dependencies'.
