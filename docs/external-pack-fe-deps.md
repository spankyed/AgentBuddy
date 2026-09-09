# External Pack FE Dependency Resolution

## Problem

External pack FE entries load via `import(/* @vite-ignore */ 'pack://{packId}/dist/fe.js')`. When the pack's code does `import { ref } from 'vue'`, the browser can't resolve `vue` -- there's no module map, and the pack doesn't ship its own copy. `window.__abuddy` has the modules, but nothing wires them to the pack's import statements.

---

## Options

### Option A: CJS + require shim (simple, ~20 lines)

Pack FE entries output CJS format (which Vite/rollup support natively). Instead of `import()`, the host fetches the pack's JS as text and executes it via `new Function`, providing a `require` shim that maps shared dep names to `window.__abuddy`:

- Pack's CJS output: `const { ref } = require('vue');`
- Host's require shim: `require('vue')` -> `window.__abuddy.vue`

This is exactly how the BE's `withHostResolution()` works -- patching require resolution. Same pattern, FE side.

**Changes:**

- `pack-loader.ts` -- rewrite `loadPackFEEntry()` to fetch-as-text + CJS execution with require shim
- `host-deps.ts` -- add `@abuddy/sdk/fe` to shared deps list
- SDK -- provide a pack build preset (Vite config) that outputs CJS with shared deps externalized

**Pros:** Minimal code change, proven pattern (mirrors BE), no protocol changes, no IPC.

**Cons:** Packs must output CJS (not ESM). `new Function` usage (same security posture as current `import()` of untrusted pack code -- no worse).

---

### Option B: Protocol-level ESM shims (clean, more work)

Packs output ESM with shared deps externalized and import paths rewritten to `pack://__host__/{dep}`. The `pack://` protocol handler generates shim modules:

- Pack's ESM output: `import { ref } from 'pack://__host__/vue';`
- Protocol handler: serves ESM shim that re-exports from `window.__abuddy.vue`

**Changes:**

- `PackProtocol.ts` -- add `__host__` hostname handler that generates shim modules
- `host-deps.ts` -- send export keys to main process via IPC (so shims know what to re-export)
- SDK -- provide pack build preset that externalizes + rewrites import paths

**Pros:** Natural ESM, tree-shaking from pack side works.

**Cons:** More moving parts (IPC for export introspection, protocol changes, shim generation). Export lists for each shared dep need maintenance.
