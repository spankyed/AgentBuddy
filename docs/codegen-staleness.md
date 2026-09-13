# Codegen Staleness: Problem & Plan

## Problem

Generated `__generated__/` files are a disconnected node in the build graph. They depend on three input categories but only regenerate on `npm install` (prepare hook) or an explicit `abuddy generate-entries`.

### Inputs that drive generation

| Input | Changes when... | Example |
|---|---|---|
| **Manifest** (`abuddy.json`) | Feature added/removed, plugin paths change, extensions change | Adding a 14th feature |
| **Generator template** (`generate-entries.ts`) | Codegen pattern changes | `registerPackFE()` -> `export default` |
| **Source files** (existence + content) | FE extension files, service modules, step types | Renaming a service export |

### What triggers regeneration

| Trigger | Runs `generate-entries`? |
|---|---|
| `npm install` | Yes (via `prepare` script) |
| `abuddy generate-entries` (manual) | Yes |
| `npm start` | Yes (via `prebuild:be`) |
| `npm run start:gen` | Yes (via `prebuild:be` + explicit call) |
| `npm run build:be` | Yes (via `prebuild:be`) |
| `npm run build` | Yes (via `prebuild:be`) |
| Branch switch (`git checkout`) | No (picked up on next `npm start`) |
| Vite dev server restart | No (picked up on next `npm start`) |

### Staleness scenarios

1. **Branch switch**: `__generated__/` is gitignored, so files survive `git checkout`. Branch A's generated files persist when you switch to branch B, even if the manifest, template, or features differ.

2. **Template change**: Editing `generate-entries.ts` (the codegen template) doesn't regenerate output. The on-disk files keep the old pattern until an explicit re-run.

3. **Manifest change**: Adding/removing a feature, changing a plugin path, modifying extensions in `abuddy.json` -- all require manual re-generation.

4. **Dev loop gap**: `npm start` runs `build:be` which runs `compile` (DSL compilation), but never runs `generate-entries` (pack barrel codegen). These are independent pipelines.

### Generation characteristics

- Produces **15 files** in **~0.8s**
- Pure sync I/O: reads manifest, checks file existence, reads a few service/step files
- No network calls, no node_modules scanning, no heavy compilation
- **No incremental checking**: always rewrites all files unconditionally
- **Idempotent**: safe to run repeatedly

---

## Current state: pack loading is already virtual

The **loading mechanism** for built-in packs now uses virtual modules on both sides:

- **BE**: `virtual:built-in-pack-loaders` (tsup esbuild plugin in `tsup.config.ts`) — scans `packages/` for `abuddy.json` at build time, generates a loader map of `import()` expressions. esbuild traces these and bundles the pack code as a separate chunk. Pack-loader.ts imports this module and calls loaders at boot.
- **FE**: `virtual:built-in-packs` (Vite plugin in `renderer/vite.config.ts`) — same discovery pattern, generates a lazy-loader map. `main.ts` imports this and calls `registerPackFE()` for each pack.

These virtual modules handle **how** packs are loaded (dynamically, disableably). They import FROM the on-disk `__generated__/pack-entry.ts` and `pack-entry-fe.ts`. The staleness problem is about how those on-disk files are **generated**, which is a separate layer.

### Two layers

```
Loading layer (virtual — done):
  virtual:built-in-pack-loaders  →  import('pack-entry.ts')
  virtual:built-in-packs         →  import('pack-entry-fe.ts')

Generation layer (on-disk — staleness lives here):
  pack-entry.ts, pack-entry-fe.ts    ← complex aggregation (systems, plugins, EARS, boot hooks)
  ears.ts, system-ids.ts, services.ts, types.ts, ...  ← simple re-export barrels
```

---

## Plan

Three changes, layered from immediate to structural.

### Phase 1: Wire generation into the dev loop — DONE

`generate-entries` now runs as part of `prebuild:be` (before `compile`), so every `npm start`, `npm run build:be`, and `npm run build` regenerates pack barrels. `start:gen` also runs it explicitly after `generate:defs`.

**Cost**: ~0.8s added to every start. Negligible next to `build:be`.

**Covers**: Template changes, manifest changes, branch switches (on next `npm start`).

**Doesn't cover**: Mid-session branch switches without restart (Phase 2 hash check would make adding more trigger points cheap).

### Phase 2: Content-hash freshness check — DONE

The generator now hashes its inputs (`abuddy.json` content + `generate-entries.ts` template source) with SHA-256 and writes `.inputs-hash` to `__generated__/`. On subsequent runs, if the hash matches, generation is skipped entirely.

```
__generated__/
  .inputs-hash        <- sha256(abuddy.json + generate-entries.ts content)
  pack-entry.ts
  pack-entry-fe.ts
  ...
```

When inputs are unchanged, `generate-entries` exits in ~5ms instead of ~0.8s. Use `--force` to bypass the check.

Also provides a diagnostic: if someone reports a staleness bug, check whether `.inputs-hash` matches current inputs.

### Phase 3: Virtualize simple barrels

The 15 generated files split into two categories with different virtualization tradeoffs:

**Simple re-export barrels** (strong candidates for virtual modules):
- `ears.ts` — re-exports EARS enums from `.abuddy/generated/ears`
- `system-ids.ts` — re-exports system IDs from each feature's system file
- `services.ts` — aggregates service exports from feature service modules
- `types.ts` — type barrel from each feature's types file
- `events.ts` — `PackEvents` and the typed `emit`/`sendToPlugin` facade
- `step-types.ts` — step type registry
- `contributions.ts` — pack contributions barrel
- `seeders.ts` — seeder aggregation

These are pure barrels: scan `abuddy.json`, generate `export { x } from '../features/y'`. A Vite/esbuild plugin can produce them on the fly from the manifest. Eliminates staleness for these files entirely.

**Complex pack entries** (keep as generated files):
- `pack-entry.ts` — aggregates 13 systems, services, EARS config, boot hooks, seed manifest, migrations, features list into a `PackRegistration` object
- `pack-entry-fe.ts` — aggregates 13 plugins, step FE definitions, tiptap plugins, app extensions, artifacts, blocks into a `PackFERegistration` object
- `dsl-register-fe.ts` — Monaco DSL type registration with rollup-plugin-dts output
- `defs.config.mjs` — rollup config for DSL def generation
- `flow-helpers.ts` — flow step helper generation

The aggregation logic for pack entries (~200 lines in `generate-entries.ts`) is non-trivial. Moving it into build plugins means duplicating it for Vite and tsup (or abstracting into a shared function — which is the codegen called from a different place). Phases 1+2 keep these files fresh with minimal friction.

**End state**: Simple barrels are virtual (zero staleness). Pack entries remain generated files kept fresh by Phase 1+2. The loading layer is already virtual.

---

## Related: FE barrel contamination

The staleness investigation uncovered a separate issue: the SDK `utils/index.ts` barrel mixes browser-safe and Node-only modules. FE-reachable SDK modules that import from the barrel pull `paths.ts` (process.env), `resolve-cli.ts` (child_process), etc. into the browser bundle.

**Fix applied**: Extracted `randomId` to `utils/random-id.ts`. FE-reachable consumers (`steps/runtime-errors.ts`, `ears/attribute-storage.ts`) import directly from that file, bypassing the barrel.

**Principle**: FE-reachable SDK modules must never import from the `utils/` barrel. Import the specific file instead. The barrel is a BE convenience -- inherently Node-only due to `paths`, `resolve-cli`, `media`, `export`, `seed`.
