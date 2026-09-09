# Codegen Staleness: Problem & Plan

## Problem

Generated `__generated__/` files are a disconnected node in the build graph. They depend on three input categories but only regenerate on `npm install` (prepare hook) or an explicit `abuddy generate-entries`.

### Inputs that drive generation

| Input | Changes when... | Example |
|---|---|---|
| **Manifest** (`abuddy.json`) | Feature added/removed, plugin paths change, extensions change | Adding a 14th feature |
| **Generator template** (`generate-entries.ts`) | Codegen pattern changes | `registerPackFE()` -> `export default` |
| **Source files** (existence + content) | FE extension files, service modules, step types | Renaming a service export |

### What triggers regeneration today

| Trigger | Runs `generate-entries`? |
|---|---|
| `npm install` | Yes (via `prepare` script) |
| `abuddy generate-entries` (manual) | Yes |
| `npm start` | No |
| `npm run start:gen` | No (`generate:defs` only, not `generate:entries`) |
| `npm run build:be` | No |
| `npm run build` | No |
| Branch switch (`git checkout`) | No |
| Vite dev server restart | No |

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

## Plan

Three changes, layered from immediate to structural.

### Phase 1: Wire generation into the dev loop

Add `generate-entries` to the `prebuild:be` script so it runs on every `npm start` and `npm run build:be`:

```diff
- "prebuild:be": "npm run compile",
+ "prebuild:be": "npm run generate:entries -w @app/default-setup && npm run compile",
```

Fix `start:gen` -- the name implies "start with generation" but it only runs `generate:defs` (Monaco schemas), not `generate:entries` (pack barrels):

```diff
- "start:gen": "npm run build:be && npm run generate:defs -w @app/default-setup && node packages/dev-mode.js",
+ "start:gen": "npm run build:be && npm run generate:defs -w @app/default-setup && npm run generate:entries -w @app/default-setup && node packages/dev-mode.js",
```

**Cost**: 0.8s added to every start. Negligible next to `build:be`.

**Covers**: Template changes, manifest changes, branch switches (on next `npm start`).

**Doesn't cover**: Mid-session branch switches without restart.

### Phase 2: Content-hash freshness check

Inside the generator, hash the inputs (manifest content + template version) and write a `.inputs-hash` to `__generated__/`. On next run, skip regeneration if hash matches.

```
__generated__/
  .inputs-hash        <- sha256(abuddy.json + generate-entries.ts content)
  pack-entry.ts
  pack-entry-fe.ts
  ...
```

This drops the 0.8s cost to ~5ms when nothing changed, making it safe to add to more trigger points without friction.

Also provides a diagnostic: if someone reports a staleness bug, check whether `.inputs-hash` matches current inputs.

### Phase 3: Virtual modules (long-term)

The codebase already uses the virtual module pattern (`virtual:built-in-packs`). The generated barrel files are static -- their content is fully determined by the manifest at build time. They could be produced by a Vite/esbuild plugin on demand rather than written to disk.

This eliminates the staleness category entirely: no files to go stale. The "generated" code exists only in the build pipeline's memory. Branch switches, template changes, manifest edits -- all picked up immediately because the plugin reads inputs fresh on every build.

This is a bigger refactor (needs plugins for both Vite and tsup) but is the architecturally clean end state. The generated files become a build concern, not a source concern.

---

## Related: FE barrel contamination

The staleness investigation uncovered a separate issue: the SDK `utils/index.ts` barrel mixes browser-safe and Node-only modules. FE-reachable SDK modules that import from the barrel pull `paths.ts` (process.env), `resolve-cli.ts` (child_process), etc. into the browser bundle.

**Fix applied**: Extracted `randomId` to `utils/random-id.ts`. FE-reachable consumers (`steps/runtime-errors.ts`, `ears/attribute-storage.ts`) import directly from that file, bypassing the barrel.

**Principle**: FE-reachable SDK modules must never import from the `utils/` barrel. Import the specific file instead. The barrel is a BE convenience -- inherently Node-only due to `paths`, `resolve-cli`, `media`, `export`, `seed`.
