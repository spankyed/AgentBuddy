# Pack Loading & Registration

Backend pack infrastructure. Four modules handle discovery, loading, registration, and lifecycle for both built-in and external packs.

## Architecture

### Built-in packs

Discovered from `packages/` by scanning for `abuddy.json` with `builtIn: true`. Loaded every boot — no enable/disable mechanism (they ship with the app).

- **Dev**: `loadBuiltInPacks()` in `pack-loader.ts` calls `discoverBuiltInPacks()` at runtime, then `await import()`s each pack's `src/pack-entry` directly.
- **Prod**: The tsup build (`packages/api/tsup.config.ts`) rewrites `loadBuiltInPacks()` at bundle time. The `rewrite-pack-loader` esbuild plugin scans `packages/` for `abuddy.json` during the build, then replaces the function body (between `@tsup-rewrite-start/end` markers) with hardcoded `require()` calls. The resulting bundle has no runtime discovery — packs are baked in. The function signature also changes (drops params, becomes sync), but JS silently handles the mismatch since callers pass unused args and `await` a non-promise.

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
| `pack-loader.ts` | Discovery, loading, registration orchestration, seed hashing |
| `pack-registration.ts` | In-memory mutable registry. Collision detection (EARS, services, steps, artifacts, blocks) with rollback. Queried by API core instead of importing registries directly |
| `pack-registry.ts` | JSON file CRUD for external pack install state (`~/.agentbuddy/pack-registry.json`) |
| `pack-api.ts` | tRPC router exposing loaded external packs to the frontend |

## Boot sequence (in `setup/backend.ts`)

```
1. loadBuiltInPacks()        — discover + import → registerPack() each
2. earlySystem hooks         — logs system starts before anything else
3. loadExternalPacks()       — discover + reconcile registry + load enabled
4. registerExternalPacks()   — registerPack() each, wire shutdown hooks
5. hydrateSharded()          — EARS policy now sees all entity types
6. createDefaultSettings     — all packs (built-in + external)
7. runMigrations()           — host version migrations
8. runPackMigrations()       — per-pack version migrations
9. runRegisteredBootSeeds()  — all packs
10. seedPackData()           — external pack JSON seeds (hash-checked)
11. start backend actor
```

External packs register **before** hydration (step 3-4) so their EARS entity types are visible to the partition policy resolver at step 5.

## tsup rewrite details

The `@tsup-rewrite-start/end loadBuiltInPacks` markers in `pack-loader.ts` delimit the function body that gets replaced during production builds. The rewrite:
- Runs `discoverBuiltInPackEntries()` in tsup.config.ts at build time (not runtime)
- Generates one `require()` + `registerPack()` call per discovered built-in pack
- Also replaces `esmRequire(` → `require(` globally in the file (CJS compat)

If you add a new built-in pack, it's picked up automatically by both paths — dev via runtime filesystem scan, prod via the build-time scan in tsup.config.ts.
