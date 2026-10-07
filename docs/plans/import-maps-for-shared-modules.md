# Share the host's modules with an import map, not a global and a generated proxy

Compiled 2026-10-07 on `AS/one-action-cache`, after fixing `abuddy run`'s frontend loop
(`fe-bundler.ts`'s `compiledSource`) and finding that every sharp edge in that area has one parent. Every
location, count and measurement below was checked against the tree on that date.

## Context

A pack's frontend must use **the host's instance** of Vue, `@abuddy/sdk`, `@abuddy/ears` and `@abuddy/ui` —
two Vue instances fail at runtime, and an unbound second SDK copy throws "No host is bound". Today that is
done with a global and a generated proxy:

- the renderer's `host-deps` virtual module (`renderer/vite.config.ts:70-86`) does
  `import * as X from '<specifier>'` for every shared specifier and assigns them onto `window.__abuddy`;
- the pack's bundler claims each shared specifier in `resolveId` and `load`s a **generated proxy module**
  (`generateGlobalProxy`, `fe-bundler.ts`) that reads the global and re-exports its names.

**The proxy re-exports from a runtime object, not a module, so it must name every export statically.** That
one requirement is the parent of all of the following:

| what exists | why |
|---|---|
| `discoverModuleExports`, `discoverSharedExports`, `discoverRuntimeExports` | the names have to be found |
| `compiledSource` and its two context branches | finding them needs compiled code, and a dev server will not give it the way a build does |
| `fe-bundler-dev-server.integration.spec.ts` | that dev branch had no coverage, and shipped broken |
| 69 name-equality cases plus a dev/build equivalence case in `fe-bundler-proxy-exports` | two mechanisms deriving one answer have to be held together |

It also has two defects nobody has hit:

- **`export const x = __m.x` is a snapshot, not a live binding.** Real ESM named imports track reassignment;
  these copy at evaluation time.
- A shared module exporting a name that is not a valid identifier generates a syntax error.

And its failure mode is a `console.warn` plus an `undefined` (`warnMissing`), where ESM would refuse at link
time naming the export.

**The alternative is a web standard.** An import map lets the pack keep `import { usePlugin } from
'@abuddy/sdk/fe'` **as written and external**, and the browser resolves it to the host's module. Nothing
needs to know the names, because `export * from` does not.

## Why this app can use it unconditionally

The usual objection to import maps is browser support. It does not apply here:

- Import maps shipped in Chromium 89; this app pins **Electron 37.2.4 (Chromium ~138)**. The support matrix
  is one row and the app controls it.
- The renderer is already an ESM context (`<script type="module">`, `renderer/index.html:161`).
- Dynamic `import()` honours the document's import map, which is how `packFrontendIO.importModule` loads a
  pack's entry from `pack://`.

## What it deletes

- `generateGlobalProxy`, `discoverModuleExports`, `discoverSharedExports`, `discoverRuntimeExports`,
  `compiledSource` and `DevEnvironmentLike` — and with them `packExternalsPlugin`'s `load` hook, which
  becomes externalisation only.
- `window.__abuddy` and its `env.d.ts` declaration.
- The dev/build divergence class, and so the equivalence case added on 2026-10-07 — its subject stops
  existing. `fe-bundler-dev-server`'s subject goes the same way.
- The 69 name-equality cases, replaced by one that asks whether the map names every shared specifier and
  whether each target resolves.

And it gains correct ESM semantics: live bindings, and a link-time error naming a missing export.

## The design

**One route shape, generated from the lists that already exist** (`getSharedFeDeps`, `getSdkFeModules`,
`getUiFeModules` in `@abuddy/host/build/shared-deps` — 8 SDK frontend modules, 68 `@abuddy/ui` modules, plus
the third-party shared deps).

**1. The host serves each shared specifier as a module.** A generated shim per specifier, `export * from
'<specifier>'`, at a stable path (`/@host/<specifier>`):

- **in dev**, a Vite middleware serves the shim and Vite resolves and transforms it normally;
- **in production**, the same shims are extra Rollup entries (`rollupOptions.input`, with
  `preserveEntrySignatures: 'exports-only'` so the entry keeps its exports), emitted as real chunks.

**2. The host declares the map.** A `<script type="importmap">` injected ahead of the module script by
`transformIndexHtml`, mapping each specifier to its shim URL — the dev route in dev, the emitted chunk in
production, which `transformIndexHtml` can read from `ctx.bundle` at build time.

**3. The pack bundler just externalises.** `packExternalsPlugin`'s `resolveId` returns
`{ id: specifier, external: true }` for a shared specifier and nothing else. Its `load` hook goes.

### The one piece of discovery that survives

`export *` does **not** re-export `default`, and most `@abuddy/ui` entries are a component's default export.
So a shim needs `export { default } from '<specifier>'` as well — and that is a build error for a module
without one. So the generator needs one bit per specifier, *does it have a default*, which is far less than
a name list and is available where it is needed: the host's build is always a build, where Rollup's
`ModuleInfo.exports` answers it.

There is precedent for the shape: `@abuddy/ui`'s own public entries are already generated shims that read
`export { default } from './x.vue'; export * from './x.vue';` (`exports:update`).

## Security

**There is no runtime boundary today, and this does not remove one.** `window.__abuddy`
(`renderer/vite.config.ts:85`) is a plain enumerable global: any code in the renderer, a pack's frontend
included, can read it and ignore the proxies. The proxies are module resolution, not containment. What
actually holds the line is **build time** — `check:specifiers` for this repo's packs and `abuddy build` for
external ones, refusing `@abuddy/host`, `_`-prefixed internals and `APP_ONLY_EXPORTS`
(`@abuddy/ears/lmdb`, *"the app's LMDB store"*).

An import map leaves that boundary where it was: the pack's source still names the specifier, so the same
build-time checks see the same thing. In one respect it is tighter — a bare specifier absent from the map
does not resolve at all, where today the global is open to whatever the host put on it.

### The shim route is an allow-list, and that is a requirement

**`/@host/<specifier>` must serve only the specifiers the map contains, and 404 everything else.** A route
that builds a shim from whatever specifier was requested is an arbitrary-module re-export endpoint: a pack
could ask for `/@host/@abuddy/host/secrets` or `/@host/@abuddy/ears/lmdb` at runtime and be handed a module
the build-time rules exist to forbid. Those rules never run at runtime, so nothing else would stop it.

Two things bound the exposure, and they are the reason this is a requirement rather than a reason not to
proceed:

- **Production has no such route.** The shims are emitted at build time from a fixed list, so the on-demand
  case is dev-only — which means `abuddy run` and `npm start`.
- **The modules worth protecting are not in the renderer.** `secretsStore`, the LMDB store and the
  migrations run in the API process; a shim re-exporting them into a browser context would mostly fail to
  resolve. The renderer's sensitive surface is the preload bridge and the API token, and any renderer code
  reaches those today either way.

**It needs a firing case**, because its subject is input: ask the route for a host-only specifier — one from
`APP_ONLY_EXPORTS` and one under `@abuddy/host` — and assert it is refused rather than served. A gate with
no case is a gate nothing has watched fail, and this one is the only runtime check in the design.

### Three smaller points

- **Do not serve the shims from a CORS-open server.** `abuddy run`'s pack dev server sets `cors: true`
  (`run.ts`). The host's shims belong to the renderer's dev server, not that one, and should not inherit it
   — otherwise any page in a browser can fetch the host's modules. Not an escalation, since it is shipped
  code, but no reason to widen the surface.
- **A future CSP gets slightly harder.** There is no CSP in the renderer today; an inline
  `<script type="importmap">` would need a nonce or a hash once there is one. Worth knowing before someone
  adds a CSP and finds the map blocked.
- **One door opens:** an import map can carry `integrity` for its targets, so shared modules could be
  subresource-integrity checked. A global has no equivalent. Not a reason to migrate, but it is a capability
  this design has and the current one cannot.

### What this is still not

Containment. If packs should be *restricted at runtime* rather than *checked at build time*, neither design
does that, and the renderer is the wrong place to attempt it — that is process isolation or a sandboxed
frame, and a far larger piece of work than this plan.

## Steps

### 0. The spike, before anything else

One specifier end to end: pick `@abuddy/sdk/fe`, emit it as an extra renderer entry, inject a one-entry
import map, and externalise that specifier in `packExternalsPlugin` instead of proxying it. Then load the
`external-pack` fixture's frontend and check three things:

1. the pack's import resolves to the host's module;
2. the binding is **live** — reassign a host export and the pack sees it;
3. it works under `file://`, which is how production loads the renderer
   (`WindowManager.ts:481`, `loadFile`);
4. the route refuses a specifier outside the map — try one from `APP_ONLY_EXPORTS`. Worth doing in the spike
   rather than after it: if the allow-list is awkward to place, that shapes where the route lives.

**If any of those fails, stop and record why.** Point 3 is the one that cannot be assumed: a packaged app
has no server, so the map's targets are relative `file://` URLs.

### 1. The host's side

Generate the shims and the map from the three shared lists, in the renderer's config beside the
`host-deps` plugin that is being replaced. Keep `window.__abuddy` in place for this step, so nothing breaks
while both exist.

### 2. The pack's side

`packExternalsPlugin` stops generating proxies. This is where the deletions land, and where
`fe-bundler-proxy-exports`' 69 cases and `fe-bundler-dev-server` lose their subject — each deleted case
says in its commit message which it was: subject gone, or awkward.

### 3. Remove the global

Delete `window.__abuddy`, the `host-deps` virtual module's object assembly and the `env.d.ts` declaration.
Keep the global for one release only if a packaged pack in the wild could still reference it — which today
nothing can, since no pack is distributed outside this repo (`resolveFromRemoteRegistry` throws for every
name), so delete it in the same change.

## Verification

- **The spike's three checks** above, which decide whether the rest happens.
- `npm run spec -- fe-bundler` for the plugin's suites, and `npm run chain` for the rest.
- **The fixture pack's frontend actually loading**, in both modes: `abuddy run` against the
  `external-pack` fixture (dev), and a packaged build (`npm run build-prod`) with the same pack installed.
  The second is the one that exercises `file://` and emitted chunk names.
- **One Vue instance, asserted rather than assumed**: the fixture pack renders a component that reads the
  host's Vue — if the map ever resolves to a second copy, that breaks loudly. `tests/packs/bundled-ui-pack`
  is the existing subject for the opposite case (a pack that deliberately carries its own `@abuddy/ui`), and
  it must keep working: `fe.bundleUi` means *do not* map those specifiers.
- **A missing export fails at link time**, which is the new failure mode: build a pack against a name the
  host does not have and confirm the error names the export, rather than warning and handing back
  `undefined`.

## Risks

**`file://` in production is the gating unknown.** Import maps are a document feature and the targets are
URLs; a packaged renderer is loaded with `loadFile`. Relative targets should resolve against the document,
but this is the spike's third check and the plan stops if it fails.

**Dev URL stability.** Vite's own module URLs carry hashes (`/node_modules/.vite/deps/vue.js?v=…`), which is
why the design serves shims at a stable `/@host/<specifier>` route rather than mapping to Vite's internals.

**The failure mode changes from degrade to refuse.** Today a pack importing a name the host lacks warns and
gets `undefined`; afterwards its frontend fails to load. That is better — it is loud, early and specific —
but it is a behaviour change, and `hostVersion` ranges are what should be catching the case first.

**`fe.bundleUi` must keep opting out.** A pack that bundles its own `@abuddy/ui` must not have those
specifiers mapped, or it gets the host's copy anyway. `bundlesUi(packDir)` already gates the proxy list and
must gate the map the same way — with a case, since this is the one path where mapping *more* is wrong.

## What this is not

- **Not Module Federation.** That is the ecosystem's standard answer to this problem (`shared: { vue: {
  singleton: true } }`) and it is the right one the day packs ship independently against several host
  versions. It brings a runtime and version negotiation that this repo has no subject for yet: one host
  version, and no third-party distribution — `resolveFromRemoteRegistry` throws for every name. Revisit when
  that stops being true.
- **Not a change to the backend's sharing.** Pack backend code gets the host's instances through a
  require-cache bridge (`withHostResolution`, `packs/runtime/bridge.ts`). That is CJS and a different
  mechanism for the same idea; import maps do not apply, and merging the two is not in scope.
- **Not a performance change.** The win is correct module semantics and the deletion of a name-discovery
  pipeline, not speed.
