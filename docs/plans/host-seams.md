# The Host Sends As Itself, And Its Features Stop Reaching Through Each Other

Surveyed 2026-09-24 at `550379da2` on `AS/plugin-contract`.

Four special cases the host still carries. They are one plan because the first unblocks the second, and
the fourth removes the last one the same investigation turned up.

## What's True Today

**The `settings` designation is legacy.** `settings` was a default-setup feature before it became the
host's; the role survived the move. `hostRegistration` sets `designation: 'settings'`
(`features/registration.ts:56`), the renderer's FE registration repeats it
(`renderer/src/views/packs/plugin.ts:22`), and nine call sites resolve it at runtime — `settings/be/system.ts:28`,
`renderer/src/runtime/settings.ts:12,13`, `WebApp.vue:202,203`, `PluginsTab.vue:150`, `Toolbar.vue:96,110`,
`ToolbarPluginContextMenu.vue:27,59`. Every one is the app resolving *its own* plugin. `HOST.settings` is
the same address, known at compile time. The `hasDesignation('settings')` guards ask whether a settings
plugin exists, which since the move is always yes.

**The host's sends can't say who sent them.** `Message.from` is stamped only by `defineEvents(packId)`
(`abuddy-sdk/src/events/index.ts:249`), which a pack's `#generated/events` calls. The host uses the
untyped free sends, so its messages carry no sender. Its broadcast targets: 22 to `HOST.packs`, 15 to
`settingsView()`, 2 to `HOST.application`. With the designation gone all 39 are compile-time constants,
so the host's sends can be *typed* against `HostPluginEvents`/`HostSystemEvents` — which already exist —
not merely stamped.

**Actions are the other half.** `services.emitter.broadcastToPlugin` is declared
`typeof untypedBroadcastToPlugin` (`abuddy-sdk/src/services/index.ts:40`), the raw function, and an
action runs outside any pack scope. Those two gaps are objections 1 and 2 in
`docs/goals/wont-do/goal-sender-enforced-audiences.md`.

**`fe/public.ts` survives only in the host, for one type.** It is gone from default-setup, replaced by
two mechanisms rather than renamed: the contract (`fe/contract.ts`, types only) and the readers
`#generated/fe` generates. The host's three `fe/public.ts` export runtime values, and have two consumers:
`abuddy-host/src/fe/index.ts:8-10` re-exports all three (the package's export surface, not a crossing),
and `features/packs/fe/frontends.ts:7` imports the type `ShellPackFrontends` from
`../../application/fe/public.ts` — the only cross-feature host frontend import there is.
`ShellPackFrontends` (`features/application/fe/types.ts:12`) is a port: the shell takes it, the packs
feature implements it. The exception in `scripts/check-import-specifiers.ts` (`HOST_SRC_ROOT`, and the
`public` branch in `findCrossFeatureImports`) exists for that single import.

## What We're Not Doing

**No `abuddy.json` for the host.** The manifest schema refuses `host` as a pack id
(`manifest-schema.ts:213`) — a rule that stops a pack impersonating the app. `discoverBuiltInPacks` scans
`packages/` for manifests, so one there is a standing hazard. `hostRegistration(systems)` is parameterised
by which systems the caller runs (9 call sites) where a generated registration is static. And the host
would build through a bespoke path rather than `abuddy build`. Of the four benefits, two are void:
`eventTypes<E>()` already makes the hand-written `PACKS_PLUGIN_EVENT_TYPES` impossible to drift, and the
contract-leaf rule guards a codegen cycle the host cannot have. The one benefit worth having is what
step 2 delivers without a manifest.

The host is the pack `host` in the *addressing* sense — every feature at `<packId>/<featureId>` — and not
in the *packaging* sense, which is what a manifest describes. Its pack-shaped things stay hand-written
where a hand-written one can be type-checked: `hostRegistration`, `HostShell`, `HostPluginEvents`,
`HostSystemEvents`.

**No table of blessed exceptions** for the `fe/public.ts` rule. One was written in the shape of
`RESOLVES_DIST_BY_DESIGN` and reverted: it makes the retired pattern permanent and documented instead of
removing its cause, which is one misplaced interface.

## Steps

### 1 — Delete the `settings` designation

Remove `designation: 'settings'` from `hostRegistration` and the renderer's FE registration. Replace every
`getDesignated('settings')` with `HOST.settings`; delete the `hasDesignation('settings')` guards.
`settingsView()` becomes `HOST.settings` directly.

Goes first: it makes the host's send targets compile-time constants, which is what lets step 2 be typed
rather than only stamped.

### 2 — `createSends`, and the host sends as itself

Add `createSends({ resolve?, from? })` returning the three sends. The untyped exports become
`createSends({})`, `defineEvents` becomes `createSends({ resolve: refOf, from: packId })`, and the host
binds `createSends({ from: HOST_PACK_ID })`, typed against `HostPluginEvents`/`HostSystemEvents`. Drops
the `from?` third parameter from `untypedBroadcastToPlugin`, `untypedSendToSystem` and
`_sendToLocalPlugin`.

### 3 — Actions send as their pack

Give `services.emitter` a pack identity, threaded through the action sandbox
(`default-setup/src/extensions/steps/action/sandbox.ts`).

### 4 — Move the port, delete the exception

Move `ShellPackFrontends` (and any sibling on `application/fe/public.ts:6` the packs feature implements)
into `abuddy-host/src/fe/`, which both features already import from. Point `features/packs/fe/frontends.ts`
at it. Then delete `HOST_SRC_ROOT`, the `public` branch in `findCrossFeatureImports`, and the spec case
pinning the exception.

Fold the three `fe/public.ts` barrels into `abuddy-host/src/fe/index.ts`, or rename them for what they
are. Not `contract.ts` — a contract is type-only, and these hold runtime exports.

Independent of 1–3; can land in any order relative to them.

## Files Changed

| File | Change |
|------|--------|
| `packages/abuddy-host/src/features/registration.ts` | Drop `designation: 'settings'` |
| `packages/renderer/src/views/packs/plugin.ts` | Drop `designation: 'settings'` |
| `packages/abuddy-host/src/features/settings/be/system.ts` | `settingsView()` → `HOST.settings` |
| `packages/renderer/src/runtime/settings.ts`, `views/WebApp.vue`, `views/settings/canvas/tabs/PluginsTab.vue`, `views/layout/Toolbar.vue`, `views/layout/ToolbarPluginContextMenu.vue` | `getDesignated('settings')` → `HOST.settings`; drop the `hasDesignation` guards |
| `packages/abuddy-sdk/src/events/index.ts` | `createSends`; untyped exports and `defineEvents` built from it; `from?` parameter goes |
| `packages/abuddy-host/src/**` (39 broadcast sites) | Send through the host's bound sends |
| `packages/abuddy-sdk/src/services/index.ts` | `emitter` carries a pack identity |
| `packages/default-setup/src/extensions/steps/action/sandbox.ts` | Thread the pack id to the emitter |
| `packages/abuddy-host/src/features/application/fe/types.ts` → `src/fe/` | Move `ShellPackFrontends` to the seam |
| `packages/abuddy-host/src/features/packs/fe/frontends.ts` | Import the port from `src/fe/` |
| `scripts/check-import-specifiers.ts` | Delete `HOST_SRC_ROOT` and the `public` branch |
| `packages/abuddy-cli/tests/build/import-specifiers.spec.ts` | Drop the case pinning the exception |
| `packages/abuddy-host/src/features/*/fe/public.ts` | Fold into `src/fe/index.ts`, or rename |

## Open Questions

- **Does a pack may claim the `settings` role once the host stops?** Either answer is fine; leaving it
  unstated is how the designation survived the move in the first place.
- **Does reassessing `goal-sender-enforced-audiences.md` follow?** Steps 2 and 3 remove both of its
  load-bearing objections. Its other reasons — the snapshot-format break, and designing the policy with
  no third-party pack in existence — still stand, so this is a separate decision.
