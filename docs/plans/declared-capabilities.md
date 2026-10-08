# A pack declares what it consumes, not just what it provides

Compiled 2026-10-08 on `AS/one-action-cache`, from reading how a pack reaches the host's services after
`goal-one-kind-of-pack`. Every location below was checked against the tree on that date.

**This is the one item on the extension-host list whose cost grows with delay.** Retrofitting permissions
onto packs that assume ambient access is painful, and right now there is **one pack** to migrate and no
third-party pack to break — `resolveFromRemoteRegistry` (`abuddy-cli/src/commands/install.ts:17`) still
throws for every name.

## Context

`features[].services` in `abuddy.json` declares the services a feature **provides**
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

`#generated/services.ts` is generated per pack from `abuddy.json` and is what pack code imports. Its last
line is the whole of the gap:

```ts
export const services = sdkServices as unknown as Services;   // :61
```

A **cast**. The facade is type-level only; at runtime it hands back the SDK's ambient object, so the
manifest has no bearing on what is reachable. Making it a *constructed* object carrying only the declared
host services is a content change to codegen, not a new mechanism.

**The ambient path has to close with it.** Pack sources also import `services` straight from
`@abuddy/sdk/services` — both forms are present in `packages/default-setup/src` today — so the facade is
not exclusive. `check:specifiers` already rejects raw `broadcastToPlugin`/`sendToPlugin`/`sendToSystem`
imports in pack sources for exactly this reason; this is the same rule for the same kind of escape hatch,
and `abuddy validate`/`abuddy build` are where it binds for an external pack.

## The design

**1. The manifest declares capabilities.** Per feature, beside the services it provides:

```json
{ "id": "code", "capabilities": ["filesystem", "inference"] }
```

Host services only — a pack's own services and its dependencies' are already declared elsewhere, and
`logger`/`emitter`/`repository` are the SDK's own implementations over the bound bus and engine, so they
are the floor rather than a capability. The list to gate is the six the app implements: `appData`,
`traceStore`, `inference`, `secrets`, `filesystem`, `settings`.

**2. Codegen builds the facade from it**, so an undeclared service is absent at runtime and a type error at
compile time. The pack's own services and its dependencies' keep their current treatment.

**3. `check:specifiers` closes the ambient import**, following the event-send precedent exactly.

**4. The registry is the second gate**, for a pack whose bundle was not built by this repo's rules: it hands
a feature's services object only the declared keys. Codegen is the ergonomic gate; the registry is the real
one.

## Steps

1. The capability list in `manifest-schema.ts` plus `schema:update`, with the six gateable services as a
   closed union — a list and its type as one declaration, per the repo rule.
2. `generate-entries` builds `services` rather than casting it.
3. `check:specifiers` rule, with its firing case.
4. The registry gate, with a case that an undeclared service is absent.
5. default-setup declares what it uses — which is the migration, and the only pack to migrate.

## Verification

- A fixture pack declaring no capabilities and calling `services.secrets` fails: at compile time through the
  facade, and at runtime through the registry. **Both**, since each is a different reader's gate.
- `npm run chain`. The capability list reaching `abuddy.schema.json` needs `schema:update`, and the manifest
  type reaching the published surface needs `api:update`.
- default-setup's declared set is exactly what it uses: derive it by removing a capability and watching the
  typecheck name the call sites, rather than reading the list and believing it.

## Risks

**A closed union of service names is a published contract.** Adding a host service becomes a schema change
and an `api:update`, which is the point, but it is friction where there was none.

**The facade is per *pack*, the services are per *feature*.** `#generated/services.ts` is one module for the
whole pack, so a per-feature gate needs either a per-feature facade or the registry doing the real work with
the facade widened to the pack's union. The second is simpler and still closes the hole; say which was
chosen and why.

**It is not a sandbox.** A pack's code runs in the same process and can reach the bound runtime by other
means if it tries. This makes capabilities *declared, reviewable and enforced at the seam*, which is what
VS Code and Backstage do; containment is `pack-fault-isolation.md`'s subject and a different order of work.

## What this is not

- Not a user-facing permission prompt. The manifest is the prerequisite for one; the UI is separate.
- Not a change to how a pack reaches its *own* services or its dependencies'.
