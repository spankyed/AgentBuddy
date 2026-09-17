# Migrate Seed Orchestration Out of Settings System

Settings system (`features/settings/be/system.ts`) currently owns seed data import, preview, and app reset — operations that belong to the core API's packs infrastructure, not a feature system.

## What Lives in Settings Today

Three seed-related concerns baked into the settings state machine:

1. **`IMPORT_PACK_SEEDS`** — Calls `seedData()` with a user-chosen directory, include filters, and import mode, then syncs the root flow setting and sends the bus `PACK_CHANGED`. Emits `PACK_SEEDS_IMPORTED` / `PACK_SEEDS_IMPORT_FAILED`.
2. **`PREVIEW_PACK_SEEDS`** — Calls `previewPackSeeds()` (`@abuddy/sdk/seed`, generic over a compiled seeds directory) and reports what's available. Emits `PACK_SEEDS_PREVIEW` / `PACK_SEEDS_PREVIEW_FAILED`.
3. **`toSeedInclude()`** — Converts the FE's JSON-safe include shape (`null | string[]`) into `SeedIncludeSet` (`true | Set<string>`).

These depend on `seedData` (from `@/__generated__/seeders`) and `previewPackSeeds`.

*Done since:* app reset left settings. `RESET_APP`'s `resetAppActor` only calls `services.appData.reset()`, which the host implements (`packages/abuddy-host/src/services/app-data.ts`): it empties the stores and keys, then runs each pack's `onInit` and boot seed and the app migrations. Settings still emits `APP_RESET_COMPLETE` / `APP_RESET_FAILED` and tells the brain to restart.

## Why Move It

- **Settings is the wrong owner.** Seed import/preview/reset are pack-level operations. Settings happens to be where the UI lives, but the system doing the work should be the one that understands packs.
- **The packs system already exists.** `packages/abuddy-host/src/packs/runtime/packs-system.ts` (the host `packs` system) handles install, uninstall, and enable/disable. Seed import and preview are the same domain — "manage what data a pack provides."
- **App reset is infrastructure.** Wiping the database, re-seeding, and running migrations is a host-level operation; it now lives in `services.appData.reset()`, and only its event still goes through settings.
- **Unblocks pack-scoped seeding.** Once the packs system owns seed orchestration, external packs can use the same preview/import flow without routing through settings.

## Target Architecture

### Packs system gains new events

```
PREVIEW_PACK_SEEDS  → PACK_SEEDS_PREVIEW / PACK_SEEDS_PREVIEW_FAILED
IMPORT_PACK_SEEDS   → PACK_SEEDS_IMPORTED / PACK_SEEDS_IMPORT_FAILED
RESET_APP           → APP_RESET_COMPLETE / APP_RESET_FAILED  (calls services.appData.reset())
```

The packs system (`packs-system.ts`) handles the operations. It already has access to pack metadata, boot hooks, and the seed pipeline.

### Settings becomes a pass-through

The settings FE plugin sends `PREVIEW_PACK_SEEDS` / `IMPORT_PACK_SEEDS` / `RESET_APP` to the **packs** system instead of settings. The settings backend system drops the event handlers, the outgoing event types, and the seed-related imports entirely.

### SDK / shared utilities

- `toSeedInclude()` moves to `@abuddy/sdk/utils` — it's a pure data conversion with no feature coupling.
- `previewPackSeeds()` is already a generic SDK utility (`@abuddy/sdk/seed`); the packs system can call it directly.

## Steps

### Phase 1 — Move handlers to packs system

1. **Extend packs system events.** Add `PREVIEW_PACK_SEEDS`, `IMPORT_PACK_SEEDS`, `RESET_APP` to `IncomingPacksEvents`. Add corresponding outgoing events.

2. **Move action implementations.** Lift `previewPackSeeds`, `importPackSeeds`, `resetAppActor`, and `onResetComplete`/`onResetFailed` from settings into the packs system. Move `toSeedInclude()` alongside or into SDK utils.

3. **Wire packs system to seed infra.** The packs system is host code, not a pack — it needs access to `seedData`. Since it already imports from `@abuddy/sdk`, `seedData` from `@abuddy/sdk/utils` and `previewPackSeeds` from `@abuddy/sdk/seed` work; the reset calls `services.appData.reset()`.

4. **Update `packsEvents` set** with the new event types so the bus routes them to the packs system.

### Phase 2 — Reroute the FE

5. **Update settings FE state machine.** Change the settings system sends of `PREVIEW_PACK_SEEDS` (now `sendToSystem('settings', { type: 'PREVIEW_PACK_SEEDS', ... })`) to target the `packs` system. Same for `IMPORT_PACK_SEEDS` and `RESET_APP`.

6. **Update settings FE incoming events.** The response events (`PACK_SEEDS_PREVIEW`, `PACK_SEEDS_IMPORTED`, etc.) now come from the packs plugin, not settings. Either:
   - The packs system emits to the settings plugin (knows the plugin ID), or
   - The FE subscribes to packs events directly.

   Option (a) is simpler — the packs system emits back to the `settings` plugin channel. The FE state machine's incoming event types stay the same.

### Phase 3 — Clean up settings

7. **Remove from settings system:** `PREVIEW_PACK_SEEDS`, `IMPORT_PACK_SEEDS`, `RESET_APP` event handlers and types. Remove the `seedData` and `previewPackSeeds` imports. Remove `toSeedInclude()`, `resetAppActor`, and the `resetting` state.

8. **Remove outgoing event types** from `OutgoingSettingsEvents`: `PACK_SEEDS_IMPORTED`, `PACK_SEEDS_IMPORT_FAILED`, `PACK_SEEDS_PREVIEW`, `PACK_SEEDS_PREVIEW_FAILED`, `APP_RESET_COMPLETE`, `APP_RESET_FAILED`.

### Phase 4 — preview disposition

9. *Done:* preview is the SDK's generic `previewPackSeeds()` (`@abuddy/sdk/seed`).

## Files Changed

| File | Change |
|------|--------|
| `packages/abuddy-host/src/packs/runtime/packs-system.ts` | Add preview/import/reset handlers |
| `packages/abuddy-sdk/src/utils/index.ts` | Export `toSeedInclude` (optional) |
| `packages/default-setup/src/features/settings/be/system.ts` | Remove seed handlers, imports, types, `resetting` state |
| `packages/default-setup/src/features/settings/fe/state.ts` | Route events to `packs` system instead of `settings` |

## Open Questions

- **Should `RESET_APP` live on packs or be a separate host system?** Reset wipes everything, not just pack data. Could argue for a dedicated "host" or "lifecycle" system. Packs is the pragmatic choice since it already exists.
- **Should the packs system emit directly to the settings FE plugin?** This creates a coupling (packs knows about settings). Alternative: packs emits to a general channel and the FE subscribes. The current pattern (systems emit to plugins via `emit(pluginId, ...)`) is established though.
