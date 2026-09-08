# Move Entry Codegen to SDK

Execution plan for extracting `default-setup/scripts/generate-entries.js` into a reusable SDK function + pack-cli command.

## Problem

`generate-entries.js` lives in `default-setup` but is pack infrastructure. Any built-in pack needs the same codegen to turn `abuddy.json` into `__generated__/` files. The script currently hardcodes default-setup-specific import paths and export names, making it non-reusable.

## Current State

The codegen generates **9 files** in `src/__generated__/`:

| File | Driven by manifest? |
|---|---|
| `pack-entry.ts` | Partially (systems, services, EARS, boot paths yes; steps/artifacts/blocks/migrations/seed no) |
| `pack-entry-fe.ts` | Partially (plugins yes; steps-fe/artifacts-fe/blocks-fe/tiptap/extensions no) |
| `services.ts` | Fully manifest-driven (auto-discovers export patterns) |
| `ears.ts` | Fully manifest-driven |
| `system-ids.ts` | Fully manifest-driven |
| `event-channels.ts` | Fully manifest-driven |
| `types.ts` | Fully manifest-driven |
| `service-types.ts` | Fully manifest-driven |
| `contributions.ts` | Fully manifest-driven |

### What's still hardcoded

**BE entry** — 5 items have manifest paths that the codegen ignores:

| Import | Hardcoded path | Manifest field (unused) |
|---|---|---|
| `standardSteps` | `../extensions/steps/register` | `manifest.steps` |
| `standardArtifacts` | `../extensions/artifacts/register` | `manifest.artifacts` |
| `standardBlocks` | `../extensions/blocks/register` | `manifest.blocks` |
| `migrations` | `../migrations` | `manifest.migrations` |
| `runBootSeed` | `../registries/seed/index` | `manifest.boot.seed` |

**FE entry** — 5 items have no manifest counterpart at all:

| Import | Hardcoded path |
|---|---|
| `standardStepsFE` | `../extensions/steps/register-fe` |
| `artifactDefinitions` | `../extensions/artifacts/register-fe` |
| `blockDefinitions` | `../extensions/blocks/register-fe` |
| `tiptapPlugins` | `../extensions/tiptap-plugins` |
| `Welcome` (app extension) | `../extensions/Welcome.vue` |

**Export names** — all hardcoded: `standardSteps`, `standardStepsFE`, `artifactDefinitions`, `blockDefinitions`, `tiptapPlugins`, `runBootSeed`, `featureServices`, `migrations`.

## Design

### Convention over configuration

Instead of adding every export name to the manifest, standardize on well-known names the codegen enforces:

| Manifest field | BE export | FE export (at `-fe` suffix path) |
|---|---|---|
| `steps` | `steps` | `stepsFE` |
| `artifacts` | `artifacts` | `artifactsFE` |
| `blocks` | `blocks` | `blocksFE` |
| `migrations` | `migrations` | — |
| `boot.seed` | `seed` | — |

The FE counterpart path is derived by convention: if `steps` is declared at `src/extensions/steps/register.ts`, the FE version is at `src/extensions/steps/register-fe.ts`. The codegen checks `existsSync` and only includes it if present.

### Manifest schema extension

Add to `abuddy.json`:

```jsonc
{
  // existing fields unchanged...

  "fe": {
    "tiptapPlugins": "src/extensions/tiptap-plugins.ts",
    "appExtensions": {
      "welcome": "src/extensions/Welcome.vue"
    }
  }
}
```

External packs already use `"fe": { "entry": "dist/fe.js" }` — presence of `entry` signals pre-built (external), while `tiptapPlugins`/`appExtensions` signal codegen-target (built-in). Mutually exclusive.

### Where the code lives

- **`@abuddy/sdk/build`** — new export: `generatePackFiles(manifest, opts)`. Returns the 9 file contents. Owns template logic + `resolveServiceImport()` auto-discovery.
- **`pack-cli`** — new `generate-entries` command. Thin wrapper: reads `abuddy.json`, calls `generatePackFiles()`, writes to `src/__generated__/`. Separate from existing `generate` (EARS types).
- **`default-setup`** — deletes `scripts/generate-entries.js`. Package.json scripts call `abuddy generate-entries`.

## Execution

### Phase 1: Wire up existing manifest paths (prep, can land independently)

**Goal**: Eliminate the 5 BE hardcoded imports by reading from manifest fields that already exist.

1. In `generateBackendEntry()`, replace hardcoded paths with `toImportPath(manifest.steps)`, `toImportPath(manifest.artifacts)`, `toImportPath(manifest.blocks)`, `toImportPath(manifest.migrations)`, `toImportPath(manifest.boot.seed)`.
2. For FE, derive `-fe` paths from the same manifest fields: `toImportPath(manifest.steps.replace(/\.ts$/, '-fe'))` etc., guarded by `existsSync`.
3. Regenerate, typecheck.

**Files changed**: `scripts/generate-entries.js` only. Output unchanged.

### Phase 2: Standardize export names (prep, can land independently)

**Goal**: Rename exports to match conventions so the codegen can assume well-known names.

Renames:

| File | Old export | New export |
|---|---|---|
| `extensions/steps/register.ts` | `standardSteps` | `steps` |
| `extensions/steps/register-fe.ts` | `standardStepsFE` | `stepsFE` |
| `extensions/artifacts/register.ts` | `standardArtifacts` | `artifacts` |
| `extensions/artifacts/register-fe.ts` | `artifactDefinitions` | `artifactsFE` |
| `extensions/blocks/register.ts` | `standardBlocks` | `blocks` |
| `extensions/blocks/register-fe.ts` | `blockDefinitions` | `blocksFE` |
| `registries/seed/index.ts` | `runBootSeed` | `seed` |

Update all import sites (codegen template + any direct importers). Regenerate, typecheck.

**Files changed**: 7 source files + `scripts/generate-entries.js` + all generated files. Mechanical find-and-replace, typecheck-validated.

### Phase 3: Add FE extras to manifest (prep, can land independently)

**Goal**: Eliminate the remaining FE hardcoded paths.

1. Add `fe.tiptapPlugins` and `fe.appExtensions` to `abuddy.json`.
2. Update `generateFrontendEntry()` to read from `manifest.fe.*` — generate imports only if fields are present.
3. Regenerate, typecheck.

**Files changed**: `abuddy.json`, `scripts/generate-entries.js`. Output unchanged.

### Phase 4: Extract to SDK + pack-cli (atomic)

**Goal**: Move the codegen engine out of default-setup.

1. Create `packages/abuddy-sdk/src/build/generate-entries.ts`:
   - Move all template functions from `generate-entries.js`
   - Move `resolveServiceImport()` and helpers
   - Export `generatePackFiles(manifest: PackManifest, opts: { packRoot: string }): Record<string, string>`
   - Add to `@abuddy/sdk/build` barrel export

2. Create `packages/pack-cli/src/commands/generate-entries.ts`:
   - Import `generatePackFiles` from `@abuddy/sdk/build`
   - Read `abuddy.json`, resolve `packRoot`
   - Call `generatePackFiles()`, write each file to `src/__generated__/`
   - Register in `cli.ts` as `generate-entries`

3. Update `packages/default-setup/package.json`:
   - `"generate:entries": "abuddy generate-entries"`
   - `"prepare": "abuddy generate-entries"`

4. Delete `packages/default-setup/scripts/generate-entries.js`.

5. Verify: regenerate via pack-cli, typecheck, runtime test.

**Files changed**: New SDK file, new pack-cli command, delete codegen script, update package.json.

## What does NOT change

- External pack workflow (hand-authored entries, no codegen)
- `pack-cli init` scaffold (still creates `src/pack-entry-fe.ts` for external packs)
- `pack-cli generate` (EARS types — stays separate)
- Runtime registration APIs (`registerPackFE`, `registerPack`)
- Boot sequence
- The 9 generated file contents — same output, different owner

## Verification

After each phase:
1. `node scripts/generate-entries.js` (or `abuddy generate-entries` after phase 4)
2. `npm run typecheck` — FE + BE
3. `npm start` — dev mode boots, features load
4. Diff generated files against previous output — should be identical (phases 1-3) or equivalent (phase 2 with renames)
