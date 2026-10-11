# Migrate Content Orchestration Out of Settings System

> **Done** (`352f21ce5`), except `RESET_APP`, which stays in settings deliberately — see *Disposition* below.
>
> **The paths below were stale when the work started.** This was written while settings was a default-setup
> feature; it is the host's now (`packages/apack-host/src/features/settings/{be,fe}`), and so is the packs
> system (`packages/apack-host/src/features/packs/be/system.ts`) rather than `packs/runtime/packs-system.ts`.
> `Settings` is a host-declared entity beside `AppState`, which no pack may declare, so the store, its one
> writer and the system answering the view are the app's; what a pack owns is the *content* of every section
> but `plugins`, which is opaque to the host.

## Disposition

- **Moved**: `PREVIEW_PACK_CONTENT`, `IMPORT_PACK_CONTENT`, and `toContentSelection`, to the packs system. Their answers
  still go to the settings plugin, which draws them, so the FE's incoming types did not change — all host
  features share one `broadcastToPlugin`, and `host/settings` maps to `SettingsPluginEvents` whichever system
  sends. Only the sends moved.
- **Not moved**: `RESET_APP`. The Open Question below asked whether it belongs on packs; the code answers it.
  Reset is interlocked with backup import through `refuseResetWhileReplacing`, and both its exits run
  `tellEveryFeature` to re-baseline what each feature was last told. Moving it means reimplementing a mutual
  exclusion and a re-baseline across a system boundary, for no gain. The two content events had no such
  interlock — `whileBusy` never covered them — which is why they moved cleanly.
- **Not removed**: the outgoing types in `OutgoingSettingsEvents`. Step 8 says to remove them, which contradicts
  step 6's choice to answer the settings plugin: a plugin declares what it receives, and it still receives these.
  They carry a comment naming the packs system as their sender instead.
- **Unforeseen cost**: `@apack/testing`'s harness deliberately ran exactly one of the host's systems, settings.
  Content import moving means it runs two, since a pack's tests content their own compiled output constantly. That
  list is still hand-maintained and underived, and it is now longer.

Settings system (`features/settings/be/system.ts`) owned content data import, preview, and app reset — operations that belong to the packs infrastructure, not a feature system.

## What Lives in Settings Today

Three content-related concerns baked into the settings state machine:

1. **`IMPORT_PACK_CONTENT`** — Calls `importCompiledContent()` with a user-chosen directory, include filters, and import mode, then syncs the root flow setting and sends the bus `PACK_CHANGED`. Emits `PACK_CONTENT_IMPORTED` / `PACK_CONTENT_IMPORT_FAILED`.
2. **`PREVIEW_PACK_CONTENT`** — Calls `previewPackContent()` (`@apack/sdk/content`, generic over a compiled content directory) and reports what's available. Emits `PACK_CONTENT_PREVIEW` / `PACK_CONTENT_PREVIEW_FAILED`.
3. **`toContentSelection()`** — Converts the FE's JSON-safe include shape (`null | string[]`) into `ContentSelectionSet` (`true | Set<string>`).

These depend on `importCompiledContent` (from `#generated/appliers`) and `previewPackContent`.

*Done since:* app reset left settings. `RESET_APP`'s `resetAppActor` only calls `services.appData.reset()`, which the host implements (`packages/apack-host/src/services/app-data.ts`): it empties the stores and keys, then runs each pack's `onInit` and boot apply and the app migrations. Settings still emits `APP_RESET_COMPLETE` / `APP_RESET_FAILED` and tells the brain to restart.

## Why Move It

- **Settings is the wrong owner.** Content import/preview/reset are pack-level operations. Settings happens to be where the UI lives, but the system doing the work should be the one that understands packs.
- **The packs system already exists.** `packages/apack-host/src/features/packs/be/system.ts` (the host `packs` system) handles install, uninstall, and enable/disable. Content import and preview are the same domain — "manage what data a pack provides."
- **App reset is infrastructure.** Wiping the database, re-applying, and running migrations is a host-level operation; it now lives in `services.appData.reset()`, and only its event still goes through settings.
- **Unblocks pack-scoped applying.** Once the packs system owns content orchestration, external packs can use the same preview/import flow without routing through settings.

## Target Architecture

### Packs system gains new events

```
PREVIEW_PACK_CONTENT  → PACK_CONTENT_PREVIEW / PACK_CONTENT_PREVIEW_FAILED
IMPORT_PACK_CONTENT   → PACK_CONTENT_IMPORTED / PACK_CONTENT_IMPORT_FAILED
RESET_APP           → APP_RESET_COMPLETE / APP_RESET_FAILED  (calls services.appData.reset())
```

The packs system (`features/packs/be/system.ts`) handles the operations. It already has access to pack metadata, boot hooks, and the content pipeline.

### Settings becomes a pass-through

The settings FE plugin sends `PREVIEW_PACK_CONTENT` / `IMPORT_PACK_CONTENT` / `RESET_APP` to the **packs** system instead of settings. The settings backend system drops the event handlers, the outgoing event types, and the apply-related imports entirely.

### SDK / shared utilities

- `toContentSelection()` moves to `@apack/sdk/utils` — it's a pure data conversion with no feature coupling.
- `previewPackContent()` is already a generic SDK utility (`@apack/sdk/content`); the packs system can call it directly.

## Steps

### Phase 1 — Move handlers to packs system

1. **Extend packs system events.** Add `PREVIEW_PACK_CONTENT`, `IMPORT_PACK_CONTENT`, `RESET_APP` to `IncomingPacksEvents`. Add corresponding outgoing events.

2. **Move action implementations.** Lift `previewPackContent`, `importPackContent`, `resetAppActor`, and `onResetComplete`/`onResetFailed` from settings into the packs system. Move `toContentSelection()` alongside or into SDK utils.

3. **Wire packs system to apply infra.** The packs system is host code, not a pack — it needs access to `importCompiledContent`. Since it already imports from `@apack/sdk`, `importCompiledContent` from `@apack/sdk/utils` and `previewPackContent` from `@apack/sdk/content` work; the reset calls `services.appData.reset()`.

4. **Update `packsEvents` set** with the new event types so the bus routes them to the packs system.

### Phase 2 — Reroute the FE

5. **Update settings FE state machine.** Change the settings system sends of `PREVIEW_PACK_CONTENT` (now `sendToSystem('settings', { type: 'PREVIEW_PACK_CONTENT', ... })`) to target the `packs` system. Same for `IMPORT_PACK_CONTENT` and `RESET_APP`.

6. **Update settings FE incoming events.** The response events (`PACK_CONTENT_PREVIEW`, `PACK_CONTENT_IMPORTED`, etc.) now come from the packs plugin, not settings. Either:
   - The packs system emits to the settings plugin (knows the plugin ID), or
   - The FE subscribes to packs events directly.

   Option (a) is simpler — the packs system emits back to the `settings` plugin channel. The FE state machine's incoming event types stay the same.

### Phase 3 — Clean up settings

7. **Remove from settings system:** `PREVIEW_PACK_CONTENT`, `IMPORT_PACK_CONTENT`, `RESET_APP` event handlers and types. Remove the `importCompiledContent` and `previewPackContent` imports. Remove `toContentSelection()`, `resetAppActor`, and the `resetting` state.

8. **Remove outgoing event types** from `OutgoingSettingsEvents`: `PACK_CONTENT_IMPORTED`, `PACK_CONTENT_IMPORT_FAILED`, `PACK_CONTENT_PREVIEW`, `PACK_CONTENT_PREVIEW_FAILED`, `APP_RESET_COMPLETE`, `APP_RESET_FAILED`.

### Phase 4 — preview disposition

9. *Done:* preview is the SDK's generic `previewPackContent()` (`@apack/sdk/content`).

## Files Changed

| File | Change |
|------|--------|
| `packages/apack-host/src/features/packs/be/{system,types}.ts` | Preview/import handlers, `toContentSelection`, the two incoming events |
| `packages/apack-host/src/features/settings/be/{system,types}.ts` | Remove the apply handlers, helper, imports and transitions |
| `packages/apack-host/src/features/settings/fe/machine.ts` | Route the two sends to `packs` |
| `packages/apack-testing/src/harness.ts` | Register the host `packs` system beside `settings` |

## Open Questions

- **Should `RESET_APP` live on packs or be a separate host system?** Reset wipes everything, not just pack data. Could argue for a dedicated "host" or "lifecycle" system. Packs is the pragmatic choice since it already exists.
- **Should the packs system emit directly to the settings FE plugin?** This creates a coupling (packs knows about settings). Alternative: packs emits to a general channel and the FE subscribes. The current pattern (systems emit to plugins via `emit(pluginId, ...)`) is established though.
