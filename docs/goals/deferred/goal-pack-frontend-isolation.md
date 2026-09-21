> **Written in session** `b9ed13ae-1ac2-48e4-ae3d-6e96f091dbb1` (Claude Code, 2026-09-17). Resume it with `claude -r b9ed13ae-1ac2-48e4-ae3d-6e96f091dbb1`.

```
# Goal: external pack frontends run isolated from the app window, reaching the app only through the SDK

Implement docs/goals/goal-pack-frontend-isolation.md on a branch cut from master.
Read Background, Open decisions, Phases and Constraints first. The Open decisions must be settled with the
user before Phase 1; if any is still marked open, stop and ask.
Where a detail isn't specified, pick the conventional option, note it in the final summary, and keep
going. No backward compatibility in code: change signatures, move modules, migrate every in-repo caller,
test, fixture, template and doc in the same change, and fix forward.

Finished when:
- Phases 1–4 are implemented and each meets its "Done when"; every new guard, helper or test is
  mutation-checked.
- An external pack's frontend code can't read `window.electronAPI` (the API token included), the host's
  API client, or the app window's DOM and globals; an E2E spec proves it with a fixture pack that tries.
- External pack frontends still work through the SDK: the fixture packs, the example pack and
  test:packaged-authoring pass unchanged in behaviour.
- npm run typecheck, api:check (sdk, ui, ears), packages:build + packages:check, and the renderer,
  sdk, cli and default-setup unit suites pass.
- npm run build, the E2E suite, npm run test:external-pack, npm run test:packaged-authoring and the
  example pack's `abuddy test --app-root <repo>` pass.
- A final summary: phase → done/deferred, evidence, and the conventional choices made.

Never:
- commit, stage, push or tag unless the user asks in this session. When asked, commit in logical
  chunks (conventional messages, no Co-Authored-By or session lines) with `git commit -- <paths>`,
  and check `git diff --cached` first: something outside the session stages files.
- npm publish, create GitHub releases, or trigger workflows (dry runs only).
- open, copy or modify ~/Library/Application Support/abuddy* or any real data dir.
- pkill/killall Electron or node; launch the app outside the test env without an isolated
  ABUDDY_USER_DATA_DIR.
- run bare tsc on packages/preload, `npm install` in the example pack, or edit version/release
  metadata.
- change the typed EARS types' behaviour (packages/abuddy-sdk/TYPED-EARS.md) to make a call site compile.
- add backward-compat shims or loosen a failing assertion instead of investigating.
- isolate the built-in pack (default-setup) unless Open decision 1 chose B.
```

## Background (2026-09-17, at 5f1642a6b)

**How external pack frontends run today.**
- The renderer loads an installed pack's frontend with a dynamic `import()` of `pack://<packId>/runtime/fe.js` (`packages/renderer/src/packs/pack-loader.ts:35`).
  - The code runs in the app window's own JavaScript realm, with the same globals as the host.
  - It shares the host's `@abuddy/sdk` and `@abuddy/ui` through `window.__abuddy`, and renders its plugins (Vue components) into the app's DOM.
- A pack's plugins are XState machines the application actor spawns. They talk to the backend through `@abuddy/sdk/events`: `sendToSystem` goes over the frontend port's transport (the host's tRPC client, `bus.send`).

**What that code can reach.** Anything the app window can, because the host and the pack share one realm:
- **`window.electronAPI`**, the whole preload surface (`packages/preload/src/index.ts`):
  - `fileUtils.readFile` / `readFileBase64` read any file the user can read (`file:read`, `packages/main/src/modules/window-manager/WindowManager.ts:233`, with no path check);
  - `shell.openPath` opens any file with its default app;
  - the `browser.*` tab controls;
  - `media.*` writes;
  - `apiToken`.
- **The API token.** `electronAPI.apiToken` lets code open its own WebSocket to the API with full access (`bus.send` to any system, `secrets.add`/`replaceValue`/`delete`/`allowUnprotected`, `packages/api/src/core/router/secrets-router.ts`). Branch `AS/api-token-req` removed `apiToken` from the SDK's published `Window.electronAPI` type (`packages/abuddy-sdk/src/fe/electron-api.ts`) so pack authors aren't pointed at it, but the preload still exposes it at runtime. The renderer reads it through its own type (`packages/renderer/src/core/trpc.ts`).
- **The app window itself:** the DOM, the host's actors (`window.applicationState`), other packs' plugins, and anything the user types.

**Where the boundary already holds.**
- Web pages in the in-app browser (`BrowserTabManager`, `WebContentsView` with `sandbox: true` and no preload) can't reach any of this.
- App windows deny `window.open` (`packages/main/src/modules/ExternalUrls.ts`) and block navigation to other origins (`BlockNotAllowdOrigins.ts`).
- The API listens on loopback only and requires the run's token (`packages/api/src/setup/websocket.ts`).

So installing an external pack today means trusting it as much as the app itself. The token work closed the API to web pages and other local processes, but not to pack frontends.

**What depends on the shared realm.**
- `@abuddy/ui` components render inside the host's DOM and styles; with `fe.bundleUi` a pack bundles its own copy.
- Host-shared frontend state lives in `@abuddy/sdk/fe`: `useActorSystem`, menu state, the tiptap plugin and DSL type lookups (`FePackRegistryView`).
- Pack extensions the host renders directly: app extensions (`getAppExtension`), tiptap plugins, blocks and artifact viewers (`fe` facets of `BlockDefinition` / `ArtifactDefinition`), step forms.
- The E2E fixture (`@abuddy/testing`) finds pack plugins through `window.applicationState` and matches the `pack://` URL.

## Open decisions (settle with the user before Phase 1)

1. **Which packs are isolated.** — *open*
   - **A. External packs only.** The built-in pack (default-setup) keeps running in the app window. It ships with the app and is trusted like host code. This is less work, and built-in plugins keep their full host integration.
   - **B. All packs.** One model for everyone. default-setup would have to work through the same isolated surface, which is a much larger migration.

2. **The isolation mechanism.** — *open*
   - **A. A sandboxed iframe per pack** inside the app window, on its own origin (a `pack://<id>` page with `sandbox="allow-scripts"`, no `allow-same-origin`). The host talks to it through `postMessage`.
     - **Pros:** it renders inline where plugins render today, and has no preload, so no `electronAPI`.
     - **Cons:** `@abuddy/ui` and styles load inside each frame; host-rendered extensions (tiptap plugins, blocks, step forms) can't be plain components shared across the boundary.
   - **B. A `WebContentsView` per pack**, like browser tabs: its own process, with a minimal preload that exposes only the SDK bridge.
     - **Pros:** the strongest isolation (a separate renderer process).
     - **Cons:** positioning views over the app layout (as the browser plugin does), more memory per pack, and the same limit on shared components.
   - **C. A same-process realm (ShadowRealm, or an SES/`lockdown` compartment)** with only the SDK's objects passed in.
     - **Pros:** components could stay in the app DOM.
     - **Cons:** ShadowRealm isn't shipped in Electron's Chromium, a compartment needs a hardened runtime for every dependency, and DOM access would still have to be mediated. Highest risk.

3. **What crosses the boundary.** — *open*
   - **A. The pack-facing SDK only:** events (`sendToSystem`, incoming events), the lookups packs may read, `navigateToPlugin`, `secretsClient` (metadata only), and nothing from `electronAPI`. Anything a pack needs from the preload becomes an SDK call the host mediates (for example "pick a file" instead of "read any path").
   - **B. The SDK plus a per-pack, permissioned `electronAPI` subset**, declared in `abuddy.json` and shown to the user at install time.

4. **How extensions the host renders work** (tiptap plugins, blocks, artifact viewers, step forms, app extensions) for isolated packs. — *open*
   - **A. Not supported for isolated packs:** these extension types stay built-in-only until a follow-up designs them.
   - **B. Rendered inside the pack's isolated context**, with the host embedding that context where the extension appears (one frame per rendered block, say).
   - **C. Declarative only:** isolated packs describe blocks and viewers as data the host renders (schemas, templates), no pack code in the app window.

## Phases

### Phase 1 — the isolated host for one pack

- Build the chosen mechanism (Open decision 2) for a single external pack. The pack's `runtime/fe.js` loads there instead of through `import()` in the app window.
- The host side starts, embeds and stops the isolated context with the pack's lifecycle: activate, teardown, reload, and `packClientReady` (`packages/renderer/src/packs/pack-loader.ts`, the application actor).
- No `window.electronAPI`, `window.__abuddy` host objects or `window.applicationState` exist in the isolated context.

**Done when:** the `tests/fixtures/external-pack` fixture renders its plugin through the isolated host. A renderer unit spec shows the isolated context has no `electronAPI`. Mutation: loading the pack with `import()` again fails that spec.

### Phase 2 — the SDK bridge

- A message bridge carries what Open decision 3 allows, in both directions. The pack side implements `@abuddy/sdk/events`, the frontend lookups and `secretsClient` over it; the host side answers from its registry and transport. Pack code keeps importing `@abuddy/sdk` unchanged.
- The host validates every message: a pack can only send to systems it may address (`resolveName` rules), and only the calls the bridge defines.
- `@abuddy/ui` and styles load inside the isolated context. The FE bundler's `window.__abuddy` proxying is replaced for isolated packs: they bundle UI or load a host-provided copy into their context.

**Done when:**
- a fixture pack's plugin sends and receives events, reads lookups and lists secrets through the bridge;
- a unit spec refuses a message outside the bridge's set, and a send to a system the pack may not address;
- mutations: accepting any message, or any system address, fails those specs.

### Phase 3 — extensions and testing support

- Implement Open decision 4 for tiptap plugins, blocks, artifact viewers, step forms and app extensions.
- `@abuddy/testing` finds isolated plugins, and `abuddy test` / `abuddy init-tests` scaffolds keep working for pack authors (`packages/abuddy-testing/CLAUDE.md`).
- `abuddy dev`'s frontend hot reload (the `pack://` dev server proxy) works inside the isolated context.

**Done when:** the fixture packs, the example pack and `test:packaged-authoring` pass; `abuddy dev` reloads an isolated pack's frontend in an E2E spec.

### Phase 4 — proof and docs

- **The proof.** A new fixture pack tries to read `window.electronAPI`, `window.parent`, `window.top`, `document.cookie`, the host DOM and `localStorage` of the app origin, and to open a WebSocket to the API with a guessed or found token. An E2E spec asserts every attempt fails and reports it.
- **The preload.** It stops exposing `apiToken` to anything but the host's API client, if the mechanism allows it (for example a `contextBridge` function that opens the socket and never returns the token).
- **Docs.** Update `docs/public-facing` (the pack author guides: what a pack frontend can reach), `packages/renderer/CLAUDE.md`, `packages/preload/CLAUDE.md` and `packages/abuddy-sdk/CLAUDE.md`.

**Done when:** the proof spec passes, and fails when the pack is loaded the old way (mutation). The docs describe the boundary.

## Deferred

- **Trust in the app window itself.** Script injection there would still reach everything: several `v-html` renders don't escape their input (the logs search highlight, Quick Open file names, chat instructions). That's its own fix, tracked from the `AS/api-token-req` review.
- **Narrowing the preload for the host.** `file:read` takes any path, and `shell.openPath` opens any file. Scoping those for the host's own use is separate from isolating packs.
- **Backend pack isolation.** Pack backend code runs in the API process with full Node access. This goal covers frontends only.

## Constraints

- Commits only on request, in logical chunks, with no attribution lines; check `git diff --cached` first.
- No publishing, releases or triggered workflows.
- No real data dirs, no broad pkill; E2E runs in the test environment.
- Preload: build with `npm run build -w @app/preload`, never bare `tsc` (`packages/preload/CLAUDE.md`). Every surface change updates the SDK's `electron-api.ts` and `api:update`.
- The example pack: no `npm install` there (ask the user); release metadata isn't edited.
- Published packages: no `any` in pack-facing exports, the TypeScript floor, `api:update` after export changes.
- Build order: `packages:build` before the CLI suite; default-setup's runtime (`npm run compile`) before the api suites and E2E.
- Investigate failing tests; mutation-check every new guard.
- External packs are first-class: keep the fixture packs, the example pack and `test:packaged-authoring` passing at every phase.
