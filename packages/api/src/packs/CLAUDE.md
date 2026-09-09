# Pack Loading & Registration

Backend pack infrastructure. Four modules handle discovery, loading, registration, and lifecycle for both built-in and external packs.

## Architecture

### Built-in packs

Discovered from `packages/` by scanning for `abuddy.json` with `builtIn: true`. Loaded every boot. Built-in packs are pre-bundled in prod but designed to be disableable at runtime (architectural groundwork — no UI yet).

- **Dev**: `loadBuiltInPacks()` in `pack-loader.ts` calls `discoverBuiltInPacks()` at runtime, then `await import()`s each pack's `src/__generated__/pack-entry` directly. Returns `BuiltInPackInfo[]`.
- **Prod**: The tsup build (`packages/api/tsup.config.ts`) rewrites `loadBuiltInPacks()` at bundle time. The `rewrite-pack-loader` esbuild plugin scans `packages/` for `abuddy.json` during the build, then replaces the function body (between `@tsup-rewrite-start/end` markers) with hardcoded `require()` calls and a baked-in `BuiltInPackInfo[]` return value. The resulting bundle has no runtime discovery — packs are baked in. Both dev and prod versions take `packagesDir` and return `BuiltInPackInfo[]`, so callers use the return value directly.

### External packs

Installed by users into `~/.agentbuddy/packs/`. Each pack directory must have an `abuddy.json` manifest and optionally a `dist/index.js` entry.

On boot, `loadExternalPacks()`:
1. Discovers packs from the packs directory
2. Reconciles with `pack-registry.json` (adds new, removes missing, preserves `enabled` state)
3. Loads only enabled packs — host version check, CJS system loading with `withHostResolution()`, main entry extraction
4. Strips blocked features (`earlySystem`, `partitionPolicy`) from external packs

The registry (`pack-registry.json` in `~/.agentbuddy/`) is external-pack-only. It tracks install state and `enabled` flag. A future packs UI can disable a pack by setting `enabled: false`; uninstall by deleting the directory (reconciliation removes the entry on next boot).

## Modules

| File | Purpose |
|------|---------|
| `pack-discovery.ts` | Filesystem scanning for built-in and external packs, registry reconciliation |
| `pack-loader.ts` | Loading and registration orchestration (imports from discovery, re-exports for compat) |
| `pack-seed.ts` | Seed hash computation and data seeding for external packs |
| `pack-registration.ts` | In-memory mutable registry. Collision detection (EARS, services, steps, artifacts, blocks) with rollback. Queried by API core instead of importing registries directly |
| `pack-registry.ts` | JSON file CRUD for external pack install state (`~/.agentbuddy/pack-registry.json`) |
| `pack-api.ts` | tRPC router exposing the pack registry (built-in + external) to the frontend. Built-in entries have `builtIn: true` so the renderer can distinguish them from dynamically-loaded external packs |

## Boot sequence (in `setup/backend.ts`)

```
1. loadBuiltInPacks()        — discover + import → registerPack() each, returns BuiltInPackInfo[]
2. setBuiltInPacks()         — feed pack info to packs XState system (UI)
3. setBuiltInPacksForRegistry() — feed pack info to tRPC registry (FE queries this)
4. earlySystem hooks         — logs system starts before anything else
5. loadExternalPacks()       — discover + reconcile registry + load enabled
6. registerExternalPacks()   — registerPack() each, wire shutdown hooks
7. hydrateSharded()          — EARS policy now sees all entity types
8. createDefaultSettings     — all packs (built-in + external)
9. runMigrations()           — host version migrations
10. runPackMigrations()       — per-pack version migrations
11. runRegisteredBootSeeds()  — all packs
12. seedPackData()            — external pack JSON seeds (hash-checked)
13. start backend actor
```

External packs register **before** hydration (step 3-4) so their EARS entity types are visible to the partition policy resolver at step 5.

## Pack entry contract

A pack's `__generated__/pack-entry.ts` (built-in) or `dist/index.js` (external) must export a `registration` object conforming to `PackRegistration` from `@abuddy/sdk/framework`:

```typescript
export const registration: PackRegistration = {
  id: string;              // unique pack identifier
  systems: PackSystemDef[];  // XState machines + event sets
  services?: Record<string, unknown>;
  steps?: StepDefinition[];
  artifacts?: ArtifactDefinition[];
  blocks?: BlockDefinition[];
  ears?: PackEARS;           // entity types + relation kinds + partition policy
  boot?: PackBootHooks;      // earlySystem, createDefaultSettings, seed, shutdown
  migrations?: PackMigration[];
};
```

Each `PackSystemDef` has `{ id, machine, events, designation? }`. Designations are auto-extracted during `registerPack()` — systems with a `designation` field get their designations registered automatically via `registerDesignations()`. Pack authors set designations on the system, not separately.

## Collision detection

`registerPack()` in `pack-registration.ts` checks for collisions before storing a registration:

| What | Checked against | On collision |
|------|----------------|--------------|
| EARS entity type values | All registered packs' entity values | Throws (blocks registration) |
| EARS relation kind values | All registered packs' relation values | Throws (blocks registration) |
| Service keys | All registered packs' service keys | Throws (blocks registration) |
| Step types | SDK `stepRegistry` | Throws — **with rollback** of any steps/artifacts/blocks already registered in this call |
| Artifact types | SDK `artifactRegistry` | Same rollback behavior |
| Block types | SDK `blockRegistry` | Same rollback behavior |

EARS and service collisions throw before anything is stored, so no cleanup is needed. Step/artifact/block registrations happen sequentially and roll back on failure — if the third step type collides, the first two are unregistered.

## Host resolution for external packs

`withHostResolution()` in `pack-loader.ts` temporarily patches Node's `Module._resolveFilename` so external packs can `require('@abuddy/sdk')` and host-provided packages (`xstate`, `zod`) even though the packs live in `~/.agentbuddy/packs/`, outside the monorepo's `node_modules`. Without this shim, `require('@abuddy/sdk')` from an external pack would fail with MODULE_NOT_FOUND. The patch is scoped — it's applied only during the `require()` call and restored in a `finally` block.

## Blocked features for external packs

Two capabilities are stripped from external packs during loading:

- **`earlySystem`** — Runs before EARS hydration (step 2 in boot). External packs register at step 3-4, after earlySystem hooks have already fired. Allowing it would either require reordering boot (risky) or silently not running the hook (confusing). Stripped with a warning log.
- **`partitionPolicy`** (`excludedEntityTypes`, `secretEntityTypes`) — Controls which entities go to volatile/secrets stores vs primary LMDB. Letting external packs route data to alternative stores without sandboxing could corrupt persistence. Stripped with a warning log; all external pack data routes to primary partition.

## External pack FE entry convention

External packs declare a FE entry point in their manifest:

```json
{
  "fe": { "entry": "dist/fe.js" }
}
```

The renderer loads `pack://{packId}/{fe.entry}` via dynamic import. The module must export a `PackFERegistration`-shaped object (or a subset): `{ plugins?, steps?, artifacts?, blocks?, tiptapPlugins?, appExtensions? }`. The renderer calls `registerPackFE()` with it. If plugins are present, they're also merged into the application actor via `PACK_PLUGINS_LOADED`.

Packs without `fe.entry` fall back to per-plugin loading from `plugins[].plugin.entry` in the manifest (the legacy path — plugins only).

External pack FE modules cannot call `registerPackFE()` themselves — they don't share the host's SDK module instance (they'd register into a separate copy of the registries). The host always mediates.

## tsup rewrite details

The `@tsup-rewrite-start/end loadBuiltInPacks` markers in `pack-loader.ts` delimit the function body that gets replaced during production builds. The rewrite:
- Runs `discoverBuiltInPackEntries()` in tsup.config.ts at build time (not runtime)
- Generates one `require()` + `registerPack()` call per discovered built-in pack
- Bakes a `BuiltInPackInfo[]` return value with `id`, `name`, `version`, `dir`, and `entry` from each pack's `abuddy.json` — the `dir` is computed at runtime from the `packagesDir` argument (set by `BUILT_IN_PACKS_DIR` env var)
- Also replaces `esmRequire(` → `require(` globally in the file (CJS compat)

Both dev and prod versions of `loadBuiltInPacks()` accept `packagesDir: string` and return `BuiltInPackInfo[]`. Callers use the return value directly — no separate `discoverBuiltInPacks()` call needed.

If you add a new built-in pack, it's picked up automatically by both paths — dev via runtime filesystem scan, prod via the build-time scan in tsup.config.ts.
