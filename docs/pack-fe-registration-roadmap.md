# Pack FE Registration & Renderer Decoupling — Roadmap

## Problem

The renderer is coupled to default-setup in three ways:

1. **Direct import** — `main.ts` → `packs/built-in.ts` → `@default-setup/pack-entry-fe` exports `plugins` and `defaultPlugin`. The renderer reaches into default-setup's source to get its FE contributions.

2. **TypeScript transitive compilation** — `vue-tsc` follows that import chain into default-setup's source tree, hitting 400+ internal `@/` imports. The renderer's `tsconfig.app.json` carries 6 pack-specific path mappings so TypeScript can resolve them. The renderer has no business knowing about default-setup's internal directory structure.

3. **Scattered FE registration** — Default-setup registers its FE contributions through 7 separate mechanisms (direct exports, SDK calls, side-effect imports). There's no unified FE registration API. External packs will need one.

Meanwhile, external packs already have a clean boundary — they're pre-compiled, loaded at runtime, and the renderer never sees their source.

## Terminology

**Feature** — a vertical slice with both a BE system and FE plugin. Lives in `features/<name>/` with `be/` and `fe/` subdirectories. Example: `features/threads/`.

**Plugin** — the FE UI unit specifically. The `Plugin` type (id, label, state machine, canvas, panel). What users see in the Settings "Plugins" tab.

**System** — the BE XState machine for a feature.

**Service** — a stateless BE module (e.g., `llm`, `database`, `settings`). Services live inside their owning feature's `be/services/` directory but are registered at the pack level for cross-feature access.

The directory `default-setup/src/plugins/` is currently named after the FE concept, but it contains full features (BE + FE). It will be renamed to `features/`.

---

## Current State

### BE Registration (already consolidated)

One `PackRegistration` object in `pack-entry.ts`:

```
systems, services, ears, boot, migrations, steps, artifacts, blocks
```

Single call to `registerPack()`. Clean.

### FE Registration (scattered — 7 mechanisms)

| # | What | Pattern | File |
|---|---|---|---|
| 1 | Plugin definitions | Direct export | `pack-entry-fe.ts` |
| 2 | Default plugin | Direct export | `pack-entry-fe.ts` |
| 3 | Plugin designations | `registerPluginDesignations()` | `registries/plugins.ts` |
| 4 | App extensions | `registerAppExtension()` | `registries/app-extensions.ts` |
| 5 | Tiptap extensions | `tiptapPluginRegistry.register()` | `registries/tiptap-register-fe.ts` |
| 6 | Artifact viewers | `artifactRegistry.registerViewer()` | `artifacts/register-fe.ts` |
| 7 | Block components | `blockRegistry.registerComponent()` | `blocks/register-fe.ts` |

Three different patterns (export, function call, side-effect import). The renderer consumes #1 and #2 via direct import. #3–#7 fire as transitive side effects.

---

## Roadmap

### Phase 1: Rename `plugins/` → `features/`

**Scope**: Internal to `packages/default-setup/` only. ~270 import path updates, zero external references.

**Changes**:
- Rename `src/plugins/` directory to `src/features/`
- Update all `@/plugins/*` imports to `@/features/*` within default-setup
- Update relative imports in `src/registries/` that reference `../../plugins/`
- Update `CLAUDE.md` terminology

**Why first**: Establishes the naming convention before the new registration API bakes it in. Mechanical change, no behavior change.

### Phase 2: FE Pack Store (SDK)

**New module**: `packages/abuddy-sdk/src/fe/pack-store.ts`

```typescript
interface PackFERegistration {
  id: string;
  plugins: Plugin[];
  defaultPlugin?: Plugin;
  artifactViewers?: ArtifactViewerDef[];
  blockComponents?: BlockComponentDef[];
  tiptapExtensions?: TiptapExtensionDef[];
  appExtensions?: AppExtensionDef[];
}

function registerPackFE(registration: PackFERegistration): void;
function getPackPlugins(): Plugin[];
function getDefaultPlugin(): Plugin | undefined;
```

`registerPackFE()` is the single entry point. Internally it distributes to the existing SDK registries (`artifactRegistry`, `blockRegistry`, `tiptapPluginRegistry`, `registerAppExtension`, `registerPluginDesignations`). Pack authors construct one object and make one call.

**SDK exports**: Add `./fe/pack-store` to `package.json` exports. Re-export `registerPackFE` from `@abuddy/sdk/fe`.

**Why**: Consolidates 7 FE registration mechanisms into 1. Same pattern as BE's `PackRegistration`.

### Phase 3: Migrate `pack-entry-fe.ts`

**Modify**: `packages/default-setup/src/pack-entry-fe.ts`

Before:
```typescript
import { plugins, defaultPlugin } from './registries/plugins';
import './registries/tiptap-register-fe';
import './registries/app-extensions';
export { plugins, defaultPlugin };
```

After:
```typescript
import { registerPackFE } from '@abuddy/sdk/fe';
import { plugins, defaultPlugin } from './registries/plugins';
import { tiptapExtensions } from './registries/tiptap-plugins';
import { appExtensions } from './registries/app-extensions';
import { artifactViewers } from './artifacts/register-fe';
import { blockComponents } from './blocks/register-fe';

registerPackFE({
  id: 'default-setup',
  plugins,
  defaultPlugin,
  artifactViewers,
  blockComponents,
  tiptapExtensions,
  appExtensions,
});
```

No exports. The pack registers itself as a side effect of being imported.

**Refactor register files**: The existing `register-fe.ts` files currently do imperative registration (side effects). Refactor them to export declaration arrays instead, and let `registerPackFE()` handle the actual registration. This makes the data declarative and testable.

### Phase 4: Renderer Decoupling

**Goal**: The renderer's source code has zero references to any specific pack. It only knows the pack store API.

#### 4a. Virtual Module Plugin (Vite)

Add `injectBuiltInPacks()` to `vite.config.ts`:

- Discovers built-in packs that have `pack-entry-fe.ts` (same convention-based discovery already used)
- Generates a virtual module `virtual:built-in-packs` containing side-effect imports:
  ```javascript
  import '@default-setup/pack-entry-fe';
  // future packs auto-discovered
  ```
- Adding a new built-in pack with `pack-entry-fe.ts` automatically includes it — no renderer changes

#### 4b. Renderer Entry Changes

**Modify `main.ts`**:
```typescript
import 'virtual:built-in-packs';  // triggers registration (before module body)
import { getPackPlugins, getDefaultPlugin } from '@abuddy/sdk/fe/pack-store';

const plugins = getPackPlugins();
const defaultPlugin = getDefaultPlugin();

export const applicationState = createActor(createApplicationState(), {
  input: { defaultPlugin, plugins, initialPluginId, ... }
}).start();
```

ES module evaluation order guarantees `virtual:built-in-packs` is fully evaluated (including all registration calls) before the module body runs.

**Add type declaration** (in `env.d.ts`):
```typescript
declare module 'virtual:built-in-packs' {}
```

TypeScript sees the empty declaration and never enters default-setup's source tree.

**Delete**: `packs/built-in.ts` (replaced by virtual module), `plugins/index.ts` (dead code — nothing imports it).

### Phase 5: tsconfig Cleanup

**Remove from `tsconfig.app.json`**:
```diff
- "@default-setup/*": ["../default-setup/src/*"],
- "@/registries/*": ["../default-setup/src/registries/*"],
- "@/plugins/*": ["../default-setup/src/plugins/*"],
- "@/steps/*": ["../default-setup/src/steps/*"],
- "@/blocks/*": ["../default-setup/src/blocks/*"],
- "@/artifacts/*": ["../default-setup/src/artifacts/*"],
```

The renderer's tsconfig has zero knowledge of any pack. Only SDK aliases and the `@/*` catch-all remain.

The `resolvePackAtAliases()` Vite plugin (already implemented) handles runtime resolution for HMR — it resolves `@/` imports within pack source against that pack's own `src/` directory.

---

## What Stays the Same

- **Vite `resolvePackAtAliases()` plugin** — already implemented, resolves `@/` imports within pack source for HMR
- **Dynamic namespace aliases** — `@default-setup/*` generated by convention-based discovery for Vite
- **External pack loading** — unchanged (main.ts:146-160, runtime via tRPC + `loadPackPlugins()`)
- **BE `PackRegistration`** — already consolidated, no changes needed
- **`Plugin` type** — FE XState actor type, unchanged
- **Settings "Plugins" tab** — user-facing, unchanged

## End State

| Concern | Before | After |
|---|---|---|
| Renderer source references default-setup | `built-in.ts` re-exports | Zero (virtual module) |
| tsconfig pack paths | 6 entries | 0 |
| TypeScript enters pack source | Yes (400+ transitive imports) | No (`declare module`) |
| FE registration mechanisms | 7 (3 patterns) | 1 (`registerPackFE`) |
| Adding a built-in pack FE | Edit `built-in.ts` + tsconfig + vite config | Just add `pack-entry-fe.ts` |
| Feature directory name | `plugins/` (ambiguous) | `features/` (clear) |
| Built-in vs external registration | Different code paths | Same `registerPackFE` API |
