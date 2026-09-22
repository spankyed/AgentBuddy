> **Written in session** `c9f31de2-e94c-46ea-a2ac-2898390dc27d` (Claude Code, 2026-09-22). Resume it with `claude -r c9f31de2-e94c-46ea-a2ac-2898390dc27d`.

```
# Goal: the renderer renders — pack management is the host's, as it is on the backend

Implement docs/goals/goal-frontend-host-boundary.md on AS/shell-owned-plugins, at or after 90f45841d —
the base its Background was surveyed at.
Before Phase 1, confirm the base: packages/renderer/src/packs/{state,pack-loader,pack-install,plugin}.ts
and packages/abuddy-host/src/fe/shell/ exist at HEAD. If they don't, stop and say so — the plan was
surveyed somewhere else.
Read Background, Decisions, Phases, Keeping the loop fast and Constraints first. Decisions are final:
implement them, don't reopen them or stop to ask.
Where a detail isn't specified, pick the conventional option, note it in the final summary, and keep
going. No backward compatibility in code: move modules, migrate every in-repo caller, test and doc in
the same change, and fix forward.

Finished when:
- Phases 1–3 are implemented and each meets its "Done when"; every new guard or helper is
  mutation-checked.
- packages/renderer/src/packs holds the Vue components and one composition module, and nothing that
  decides anything about packs.
- @abuddy/host/fe owns the packs machine, pack-frontend loading and the install request, and imports no
  Vue, no tRPC and no browser global: packages/abuddy-host/tests/boundaries.spec.ts is unchanged and
  passes.
- The check list passes once at the end: npm run typecheck, npm run test:unit, npm run build, npm test,
  npm run test:external-pack, npm run test:packaged-authoring. api:check and facade:check only if a
  published export moved (this goal moves host-internal code, so they shouldn't be needed).
- A final summary: phase → done/deferred, evidence, and the conventional choices made.

Commit as you go:
- Commit each phase when its "Done when" holds and the checks are green — not once at the end.
  Conventional message, no Co-Authored-By or session lines, `git commit -- <paths>` naming only that
  phase's files.
- Check `git diff --cached` first: something outside the session stages files, and a pathspec commit
  leaves the rest of the index alone.
- Don't push, tag, or open a PR unless the user asks.

Never:
- push, tag or open a PR unless the user asks in this session.
- npm publish, create GitHub releases, or trigger workflows (dry runs only).
- open, copy or modify ~/Library/Application Support/abuddy* or any real data dir.
- pkill/killall Electron or node; launch the app outside the test env without an isolated
  ABUDDY_USER_DATA_DIR.
- run bare tsc on packages/preload, `npm install` in the example pack, or edit version/release metadata.
- change the typed EARS types' behaviour (packages/abuddy-sdk/TYPED-EARS.md) to make a call site compile.
- add backward-compat shims or loosen a failing assertion instead of investigating.
- import Vue, tRPC or a browser global in @abuddy/host, or move the Packs view's .vue files (Decision 1).
- run the full chain per edit: each phase's "Done when" names the narrow checks (Keeping the loop fast).
```

# Goal: the renderer renders — pack management is the host's

The backend splits cleanly today: `packages/api` is transport, process boot and composition, and
`@abuddy/host` is what the app *does*. The frontend doesn't. `packages/renderer/src/packs` holds the
Packs plugin's machine, the pack-frontend loader and the install handling — app behaviour that has no
more to do with Vue than the pack runtime has to do with tRPC. This goal moves that behaviour into
`@abuddy/host/fe`, so a frontend is as replaceable as the API already is.

## Background

### What's there now (2026-09-22, at 502d870e7 on AS/shell-owned-plugins)

| File | Lines | What it is |
|---|---|---|
| `src/packs/state.ts` | 205 | The Packs plugin's XState machine. Vue-free. Mirrors the `host/packs` system's events and sends `INSTALL_PACK`, `UNINSTALL_PACK`, `TOGGLE_PACK_ENABLED`, `UPDATE_PACK`, `CHECK_FOR_UPDATES`, `GET_INSTALLED_PACKS` |
| `src/packs/pack-loader.ts` | 100 | Loads a pack's frontend: `import()` of `pack://<id>/<entry>?v=<rev>`, a `<link>` per stylesheet, `fePacks.registerPackFE`, and the unload that undoes both |
| `src/packs/pack-install.ts` | 25 | Parses `abuddy://install?pack=…&source=…` and sends `INSTALL_PACK` |
| `src/packs/plugin.ts` | 16 | The plugin definition: label, icon, machine, canvas |
| `src/packs/canvas/*.vue` | 569 | The Packs list and detail UI |
| `src/packs/__tests__/` | 3 files | The loader, the breadcrumb and `PackDetail` |

### The precedent

The app shell moved the same way (`docs/archive/goals/goal-host-shell.md`): its machine is
`@abuddy/host/fe/shell/`, its window I/O arrives as options (`client`, `packFrontends`, `storage`,
`notify`, `target`), and `packages/renderer/src/core/app-shell.ts` only composes them. That goal
explicitly deferred "moving the Packs plugin's frontend into the host", which is this goal, and set
the constraint that keeps the split honest: no Vue, no tRPC, no browser globals in `@abuddy/host`
(`packages/abuddy-host/tests/boundaries.spec.ts`).

### The symmetry this aims at

| Concern | Backend | Frontend after this goal |
|---|---|---|
| Framework, transport, process | `packages/api`: tRPC routers, `server.ts`, websockets | `packages/renderer`: Vue components, `main.ts`, the tRPC client, window I/O |
| Behaviour and state | `@abuddy/host`: the bus, systems, the pack runtime | `@abuddy/host/fe`: the shell machine, the pack registry, the packs machine, pack-frontend loading |
| The app's own feature | `host/packs` system (`packs/runtime/packs-system.ts`) | `host/packs` plugin's machine (`fe/packs/machine.ts`) |

The renderer keeps the Packs view's `.vue` files on purpose: rendering is the frontend's job, the way
serving `packs.loaded` over tRPC is the API's. `PackDetail.vue` is the counterpart of
`packs-router.ts`, not of `packs-system.ts`.

## Decisions

1. **`@abuddy/host` stays Vue-free.** The host is what a different frontend would keep; a Vue import
   there would make it un-swappable. Two rules already say so, and this goal changes neither:
   `boundaries.spec.ts:108` bans `vue`, `@trpc/*`, the renderer's `@/` alias and the browser's globals
   anywhere under `src/fe`, and `check-import-specifiers.ts:311-317` allows `@abuddy/host` only
   `@abuddy/sdk` and `@abuddy/ears` — so it cannot reach `@abuddy/ui` either.
2. **What moves:** the packs machine, pack-frontend loading and unloading, and the install request,
   into `@abuddy/host/fe/packs/`.
3. **What stays:** the `.vue` files, and a small composition module that puts the machine and the
   components together into the plugin the window registers — the shape `app-shell.ts` already has.
   The alternative is the closer mirror of the backend: `hostFeRegistration({ canvas })` in the host,
   beside `hostRegistration(systems)` (`packs/host-pack.ts:46`), with the component injected as the
   I/O ports are. It is not chosen because the two are not alike in the way that matters:
   `hostRegistration` takes its systems as arguments because a caller may run some and not others (the
   harness runs no Packs system), while a window always has the views. Injecting them through the host
   would buy nothing the composition module doesn't, at the price of a views argument in a Vue-free
   package.
4. **The DOM is a port.** Loading a pack's frontend needs `import()` and a `<link>` element. The host
   holds the rules (URL with revision, what counts as a registration, what unloading undoes) and takes
   `{ importModule, styles }` from the window, as the shell takes `client` and `storage`. The
   renderer's implementation is a handful of lines and is the only place `document` appears.
5. **One registry instance, unchanged.** `createFePackRegistry()` stays the renderer's (`core/fe-packs.ts`)
   and is passed in, like `packs` for the shell.
6. **Tests move with the code.** The loader's spec goes to `packages/abuddy-host/tests/fe/packs/`; the
   component specs stay in the renderer.
7. **The layout components stay in the renderer** (`toolbar`, `canvas-area`, `chat-area`,
   `inspection-panel`, `router.vue`): their state already lives in the shell machine, so they are
   rendering only. No new package for UI: `@abuddy/ui` is there if a second frontend ever needs these.
8. **The shell is the only owner of pack-frontend loading and unloading.** Today loading goes through
   it (`LOAD_PACK_FRONTENDS`) while `state.ts:85-89` unloads directly and tells the shell afterwards,
   so one operation has two paths. This needs no new event: the machine keeps sending
   `PACK_PLUGINS_UNLOADED`, and the shell's handler for it (`fe/shell/machine.ts:177`, which already
   does the bookkeeping) makes the `packFrontends.unload` call. Passing `unloadPackFrontend` into the
   machine as an option would carry both paths into the host instead.

## Phases

### Phase 1 — the packs machine moves

- `packages/abuddy-host/src/fe/packs/machine.ts`: `state.ts` as it is, minus its import of the
  renderer's loader: `PACK_DEACTIVATED` stops unloading and only sends `PACK_PLUGINS_UNLOADED`, which
  the shell's handler now acts on (Decision 8), so the machine needs no loader of its own.
- The renderer's `plugin.ts` composes machine + canvas.
- **Done when** the renderer's `src/packs` holds no XState, the shell holds the only call to
  `packFrontends.unload` (mutation-checked: breaking that call fails a spec over a deactivated pack's
  stylesheet and plugins), the host's machine has its spec, and `npm run typecheck:host`, the host
  suite and the renderer suite pass.

### Phase 2 — pack-frontend loading moves behind a port

- `packages/abuddy-host/src/fe/packs/frontends.ts`: `loadPackFrontend`, `unloadPackFrontend`,
  `loadPackFEEntry` and the registration check, over `{ importModule(url), styles: { add, remove } }`.
- The renderer supplies that port (dynamic `import()`, `<link>` elements) from one small module.
- `PackFrontend` (`packs/pack-loader.ts:78`) goes: it is a strict subset of `LoadedPackEntry`
  (`packs/pack-layout.ts:81`) — the same four fields, down to a reworded copy of the comment
  explaining `feRevision`. The host's loader takes the entry the API already sends.
- `createAppShell` passes the host's loader to the shell's `packFrontends`, so the shell's contract is
  unchanged.
- The failure log keeps its exact text: `@abuddy/testing`'s fixture fast-fails a pack under test on
  `[pack-loader] Failed to load FE entry pack://<id>/` (`packages/abuddy-testing/src/index.ts:379`,
  documented in `tests/e2e/CLAUDE.md:49`). Reword it and nothing fails — the match just stops firing,
  and a pack whose frontend won't load becomes a plugin-wait timeout with a worse message. A green
  suite doesn't prove this; a pack with a deliberately broken FE entry, failing fast, does.
- **Done when** `document` appears in no host file, the loader's spec runs against a fake port in
  `packages/abuddy-host/tests/fe/packs/`, E2E pack loading still passes, and the fast-fail above was
  seen to fire once.

### Phase 3 — the install request, docs and the boundary check

- `install-url.ts` (parsing) moves; the renderer keeps only the protocol subscription in `main.ts`.
- `core/app-shell.ts:16` re-exports `visiblePluginsOf` and `withHostLast` from `@abuddy/host/fe`.
  `withHostLast` is used nowhere in the renderer and `visiblePluginsOf` only through that
  indirection (`WebApp.vue:101`): delete the line and import from `@abuddy/host/fe` directly, so the
  composition module composes and re-exports nothing.
- Update `packages/renderer/CLAUDE.md` ("Packs plugin", "Pack loading"), `packages/abuddy-host/CLAUDE.md`
  (a `fe/packs` section beside the shell's) and the module map.
- Add the renderer's own layout check, in the renderer's suite: `src/packs` holds only `.vue` files
  and the composition module. It belongs there, not in `boundaries.spec.ts` — that spec reads the
  host's tree only, and the backend's equivalent (`packages/api/tests/unit/source-layout.spec.ts`)
  lives in the package it constrains. Each package states what it may hold; neither reaches into the
  other.
- **Done when** the full chain passes once and the renderer's `src/packs` is components plus one
  composition file.

## Keeping the loop fast

The measured problem, from this session's runs on this machine:

| Step | Time | When it is actually needed |
|---|---|---|
| a single spec file (`npx vitest run <file> --root packages/<pkg>`) | 1–3s | every edit |
| one package's `tsc --noEmit` | 3s | every typed edit |
| `npm run packages:ensure` | 1s when fresh | before a pack test run after touching sdk/ears/ui/testing |
| `npm run compile` | 16s | after changing default-setup's seeds, manifest or runtime |
| `npm run typecheck` (all) | 53s | before asking for review |
| `npm run test:unit` (8 workspaces) | 108s | before asking for review |
| `npm run api:check` | 55s | only when a public SDK/ears/ui export changed |
| `npm run build` | 60s | before E2E, external-pack and packaged-authoring |
| `npm test` (E2E) | 27s | when the renderer, boot or a pack's FE changed |
| `npm run test:external-pack` | 41s | when pack loading, the CLI or the harness changed |
| `npm run test:packaged-authoring` | 75s | before merge |

Roughly 8 minutes for the whole chain, against 1–3 seconds for the check that actually covers an
edit. The rules that keep this goal from stalling:

- **Run the narrowest thing that could fail.** For this goal that is almost always one spec file plus
  one package's `tsc`. The host's whole `tests/fe` folder is 1s.
- **Run the chain once per phase, not per edit,** and in the background while reviewing the diff.
- **Order the chain so the slow steps run last** and only when their input changed: typecheck →
  test:unit → build → E2E/external-pack/packaged-authoring. `api:check` only if a public export moved
  (this goal moves host-internal code, so it shouldn't).
- **Don't rebuild what didn't change.** `packages:build` and `api:update` are not part of an edit
  loop; `packages:ensure` is 1s and is the only rebuild a pack test run needs.
- **Never run two suites at once.** They share the package build lock and the build stamps, so a
  background `test:unit` racing a foreground run produces failures that are about the race.
- **A stale bundle looks like a bug.** After editing `@abuddy/sdk`, `@abuddy/host` or
  `@abuddy/testing`, a pack test run needs `packages:ensure`; E2E needs `npm run build:be`. Check that
  first when a failure makes no sense.
- **Phase boundaries are the checkpoints.** Each phase's "Done when" names the narrow commands; the
  full chain is for the end of a phase, and the E2E and packaged suites for the end of the goal.

## Constraints

- No Vue, tRPC or browser global in `@abuddy/host` (Decision 1), enforced by `boundaries.spec.ts`.
- No backward-compat shims: move the modules, update every caller, test and doc in the same change.
- The shell's contract (`HostShell`, `ShellOptions`) doesn't change: this goal moves what sits beside
  it, not the shell itself.
- `@abuddy/host/fe` must keep working in a pack's unit tests (`startShell` from
  `@abuddy/testing/harness`), so anything that needs the window arrives as an option.

## Deferred

- Moving the Packs view's `.vue` files anywhere (Decision 1). Revisit only if a second frontend needs
  them, and then into `@abuddy/ui`, not the host.
- The renderer's layout components (Decision 7).
- A frontend-side counterpart of `packages/api/tests/unit/source-layout.spec.ts` listing what
  `renderer/src` may hold, beyond the packs-folder check in Phase 3.
- Consolidating the frontend's three notions of which packs are loaded: the Packs machine's
  `context.packs`, the shell's `packFrontendsLoaded` / `packPluginIds` / `packsUnloadedWhileLoading`
  (`fe/shell/types.ts:85-98`), and the registry's registrations. They answer different questions and
  are correct today; what the move changes is that all three land in one package, where the overlap
  can be seen and either consolidated or given one documented owner each. Not part of this goal: it
  would mix a behaviour change into a move.
