# Migrate Seed Orchestration Out of Settings System

Settings system (`features/settings/be/system.ts`) currently owns seed data import, preview, and app reset — operations that belong to the core API's packs infrastructure, not a feature system.

## What Lives in Settings Today

Four seed-related concerns baked into the settings state machine:

1. **`IMPORT_SETUP_PACK`** — Calls `seedData()` with a user-chosen directory, include filters, and import mode. Emits `SETUP_PACK_IMPORTED` / `SETUP_PACK_IMPORT_FAILED`.
2. **`PREVIEW_SETUP_PACK`** — Calls `previewSetupPack()` to read compiled artifacts from a directory and report what's available. Emits `SETUP_PACK_PREVIEW` / `SETUP_PACK_PREVIEW_FAILED`.
3. **`RESET_APP`** (resetAppActor) — Wipes LMDB, recreates default settings, seeds data, runs migrations. Emits `APP_RESET_COMPLETE` / `APP_RESET_FAILED`. Also tells brain to restart.
4. **`toSeedInclude()`** — Converts the FE's JSON-safe include shape (`null | string[]`) into `SeedIncludeSet` (`true | Set<string>`).

These depend on `seedData` (from `@/__generated__/seeders`), `previewSetupPack` (from `registries/seed/preview.ts`), `resetLmdbFiles`, `createDefaultSettings`, and `runMigrations`.

## Why Move It

- **Settings is the wrong owner.** Seed import/preview/reset are pack-level operations. Settings happens to be where the UI lives, but the system doing the work should be the one that understands packs.
- **The packs system already exists.** `packages/api/src/core/packs/packs-system.ts` handles install, uninstall, and enable/disable. Seed import and preview are the same domain — "manage what data a pack provides."
- **App reset is infrastructure.** Wiping the database, re-seeding, and running migrations is a host-level operation. It doesn't depend on any feature-specific state.
- **Unblocks pack-scoped seeding.** Once the packs system owns seed orchestration, external packs can use the same preview/import flow without routing through settings.

## Target Architecture

### Packs system gains three new events

```
PREVIEW_SETUP_PACK  → SETUP_PACK_PREVIEW / SETUP_PACK_PREVIEW_FAILED
IMPORT_SETUP_PACK   → SETUP_PACK_IMPORTED / SETUP_PACK_IMPORT_FAILED
RESET_APP           → APP_RESET_COMPLETE / APP_RESET_FAILED
```

The packs system (`packs-system.ts`) handles the operations. It already has access to pack metadata, boot hooks, and the seed pipeline.

### Settings becomes a pass-through

The settings FE plugin sends `PREVIEW_SETUP_PACK` / `IMPORT_SETUP_PACK` / `RESET_APP` to the **packs** system instead of settings. The settings backend system drops the event handlers, the outgoing event types, and the seed-related imports entirely.

### SDK / shared utilities

- `toSeedInclude()` moves to `@abuddy/sdk/utils` — it's a pure data conversion with no feature coupling.
- `previewSetupPack()` already reads from compiled JSON using SDK types (`SetupPackPreview` from `@abuddy/sdk/build`). It can move to the SDK as a utility, or stay in the packs module. Currently in `registries/seed/preview.ts` — it uses pack-specific types (`FlowDSL`, `ExportedLibrary`, `ExportedNotes`) for parsing, so it may need to become generic or stay pack-provided for now.

## Steps

### Phase 1 — Move handlers to packs system

1. **Extend packs system events.** Add `PREVIEW_SETUP_PACK`, `IMPORT_SETUP_PACK`, `RESET_APP` to `IncomingPacksEvents`. Add corresponding outgoing events.

2. **Move action implementations.** Lift `previewSetupPack`, `importSetupPack`, `resetAppActor`, and `onResetComplete`/`onResetFailed` from settings into the packs system. Move `toSeedInclude()` alongside or into SDK utils.

3. **Wire packs system to seed infra.** The packs system is in core API, not a pack — it needs access to `seedData`. Since it already imports from `@abuddy/sdk`, `seedData` from `@abuddy/sdk/utils` works. For `previewSetupPack`, either:
   - Import from the SDK (`@abuddy/sdk/build`) if it can be made generic, or
   - Accept it as a registered callback from the pack (via `PackBootHooks` or a new hook).

4. **Update `packsEvents` set** with the new event types so the bus routes them to the packs system.

### Phase 2 — Reroute the FE

5. **Update settings FE state machine.** Change `trpc.bus.send.mutate({ systemId: settings, type: 'PREVIEW_SETUP_PACK', ... })` to `systemId: 'packs'`. Same for `IMPORT_SETUP_PACK` and `RESET_APP`.

6. **Update settings FE incoming events.** The response events (`SETUP_PACK_PREVIEW`, `SETUP_PACK_IMPORTED`, etc.) now come from the packs plugin, not settings. Either:
   - The packs system emits to the settings plugin (knows the plugin ID), or
   - The FE subscribes to packs events directly.

   Option (a) is simpler — the packs system emits back to the `settings` plugin channel. The FE state machine's incoming event types stay the same.

### Phase 3 — Clean up settings

7. **Remove from settings system:** `PREVIEW_SETUP_PACK`, `IMPORT_SETUP_PACK`, `RESET_APP` event handlers and types. Remove `seedData`, `previewSetupPack`, `resetLmdbFiles`, `createDefaultSettings`, `runMigrations` imports. Remove `toSeedInclude()`, `resetAppActor`, and the `resetting` state.

8. **Remove outgoing event types** from `OutgoingSettingsEvents`: `SETUP_PACK_IMPORTED`, `SETUP_PACK_IMPORT_FAILED`, `SETUP_PACK_PREVIEW`, `SETUP_PACK_PREVIEW_FAILED`, `APP_RESET_COMPLETE`, `APP_RESET_FAILED`.

### Phase 4 — preview.ts disposition

9. **`registries/seed/preview.ts`** currently uses pack-specific types (`FlowDSL`, `ExportedLibrary`, `ExportedNotes`). Two options:
   - **Move to SDK as a generic preview utility** — parse JSON blobs without domain types, return a generic shape. The SDK already defines `SetupPackPreview`.
   - **Register as a packs-system callback** — the pack provides the preview function during registration (new optional `PackBootHooks.preview` field), the packs system calls it.

   Option (b) is more aligned with the manifest-driven pattern — each pack knows how to preview its own artifacts.

## Files Changed

| File | Change |
|------|--------|
| `packages/api/src/core/packs/packs-system.ts` | Add preview/import/reset handlers |
| `packages/abuddy-sdk/src/utils/index.ts` | Export `toSeedInclude` (optional) |
| `packages/default-setup/src/features/settings/be/system.ts` | Remove seed handlers, imports, types, `resetting` state |
| `packages/default-setup/src/features/settings/fe/state.ts` | Route events to `packs` system instead of `settings` |
| `packages/default-setup/src/registries/seed/preview.ts` | Move or register as hook |

## Open Questions

- **Should `RESET_APP` live on packs or be a separate host system?** Reset wipes everything, not just pack data. Could argue for a dedicated "host" or "lifecycle" system. Packs is the pragmatic choice since it already exists.
- **Should `previewSetupPack` become a `PackBootHooks.preview` callback?** Adds a field to the registration contract but keeps pack-specific parsing in the pack.
- **Should the packs system emit directly to the settings FE plugin?** This creates a coupling (packs knows about settings). Alternative: packs emits to a general channel and the FE subscribes. The current pattern (systems emit to plugins via `emit(pluginId, ...)`) is established though.
