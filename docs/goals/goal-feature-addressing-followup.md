> **Written in session** `739e73df-2842-4e0f-9c86-4a88dd07ac62` (Claude Code, 2026-09-21). Resume it with `claude -r 739e73df-2842-4e0f-9c86-4a88dd07ac62`.

```
# Goal: pack code names features, one strict resolver addresses them, and the regressions are fixed

Implement docs/goals/goal-feature-addressing-followup.md on AS/designations-and-addressing, at or after
8520f8286 — the base its Background was surveyed at.
Before Phase 1, confirm the base: `qualifiedId` and `addressOf` exist in packages/abuddy-sdk/src/ids/addressing.ts,
`defineEvents(packId)` in packages/abuddy-sdk/src/events/index.ts, and docs/reviews/review-feature-addressing.md
exists. If they don't, stop and say so — the plan was surveyed somewhere else.
Read Background, Decisions, Phases and Constraints first, and the review the finding ids (F1–F16) refer to.
Decisions are final: implement them, don't reopen them or stop to ask.
Where a detail isn't specified, pick the conventional option, note it in the final summary, and keep
going. No backward compatibility in code: change signatures, move modules, migrate every in-repo caller,
test, fixture, template and doc in the same change, and fix forward. Stored user data is the exception:
it moves with migrations.

Finished when:
- Phases 1–6 are implemented and each meets its "Done when"; every new guard, helper or test is
  mutation-checked, and each regression fix (F10–F13) has a test that fails with the fix reverted.
- `resolveName` in @abuddy/sdk/ids is the only code turning a name into an address: `git grep` finds no
  other `qualifiedId(`/`addressOf(` call outside @abuddy/sdk/ids, generate-entries.ts and the registries.
- No test helper falls back to a bare id; an unresolvable name throws.
- `dist/settings.seed.json` holds no plugin key; no default-setup reader indexes `settings.plugins` by a
  bare feature name.
- Pack source holds no address: `src/__generated__/system-ids.ts` is gone, no pack module outside
  __generated__ imports `busId`, and `defineSystem`'s parameter is `feature`.
- `FeatureAddress` is a branded type; the renderer's `getDesignated('settings') as any` cast is gone.
- `services.emitter.sendToPlugin` and `sendToSystem` both throw on a target no registered pack owns.
- An installed external pack's stored plugin settings, visibility and last-active plugin survive 0.3.15.
- npm run typecheck, npm run test:unit, npm run build, npm test, npm run test:external-pack and
  npm run test:packaged-authoring pass; npm run api:check and facade:check pass with etc/ committed.
- A final summary: phase → done/deferred, evidence, and the conventional choices made.

Commit as you go:
- Commit each phase when its "Done when" holds and the checks are green — not once at the end. A
  phase is landable on its own; a commit is how that stays true. Conventional message, no
  Co-Authored-By or session lines, `git commit -- <paths>` naming only that phase's files.
- Check `git diff --cached` first: something outside the session stages files, and a pathspec commit
  leaves the rest of the index alone.
- Don't push, tag, or open a PR unless the user asks.

Never:
- push, tag or open a PR unless the user asks in this session.
- npm publish, create GitHub releases, or trigger workflows (dry runs only).
- open, copy or modify ~/Library/Application Support/abuddy* or any real data dir.
- pkill/killall Electron or node; launch the app outside the test env without an isolated
  ABUDDY_USER_DATA_DIR.
- run bare tsc on packages/preload, `npm install` in the example pack, or edit version/release
  metadata.
- change the typed EARS types' behaviour (packages/abuddy-sdk/TYPED-EARS.md) to make a call site compile.
- add backward-compat shims or loosen a failing assertion instead of investigating. A resolver that
  accepts a bare feature name "in case" is a shim.
- change the address format (`<packId>.<featureId>`) or the name format (`<packId>/<featureId>`): Decision 1.
- rewrite stored action source text to migrate old `services.emitter` calls: Decision 4.
- create a new migration version file: 0.3.15 is the latest unreleased target, per migrations/CLAUDE.md.
```

## Background (2026-09-21, at 8520f8286 on AS/designations-and-addressing)

`docs/reviews/review-feature-addressing.md` reviewed the designations-and-addressing goal and its cleanup
(`02d655f68`). Its finding ids (F1–F16) are used below. The review's claims were checked against the code
before this plan was written.

### Where addressing stands

- Every pack's system and plugin runs under the feature's **address** `<packId>.<featureId>`; bare ids are
  the host's (`bus`, `HOST_PLUGIN_IDS` = `['application']` in `abuddy-sdk/src/events/index.ts:70`, and plugins
  the host registers with `registerHostPlugin`, such as `packs`).
- Code **names** a feature: its own by feature id, another pack's as `<packId>/<featureId>`.
- `@abuddy/sdk/ids` owns the format: `qualifiedId(packId, featureId)` and `addressOf(name)`. `addressOf`
  treats any name without `/` as already an address (F4).
- A registration arrives addressed: `toPackSystemDefs(entries, packId)` for systems, a plugin module's
  `id = busId.<feature>` for plugins. `registerPack`, `registerPackFE` and the pack loader refuse an
  unaddressed id.
- `defineEvents(packId)` derives addresses for the typed sends.
- Generated per pack: `busId` (`bus-ids.ts`, every feature's address, import-free) and `system-ids.ts`
  (`export const notes = busId.notes` for its own, literal addresses for dependencies'). Both are the same
  value (F1).

### The name → address rule is written four times (F3)

| Site | Rule |
|---|---|
| `abuddy-sdk/src/events/index.ts:172` | `/` or a host plugin → `addressOf`, else own |
| `abuddy-testing/src/app.ts` `resolveSystemId` | `/` or no pack → `addressOf`, else own; then the bare id if registered |
| `abuddy-testing/src/app.ts` `resolvePluginId` | `/` or no pack → `addressOf`; own if known, else bare |
| `abuddy-testing/src/index.ts` `pluginAddress` (E2E) | `/` or no pack → `addressOf`, else own |

The harness fallbacks to the bare id are why the suites passed with F10–F13 live (F16).

### Regressions in the running app (verified)

- **F10.** `navigateToPlugin(pluginId, event?)` (`abuddy-sdk/src/fe/navigation.ts:12`) sends `SELECT_PLUGIN`
  with the id as given and waits on `app.system.get(pluginId)`. default-setup calls it 20 times with a bare
  feature name (`git grep -nE "navigateToPlugin\('[a-z]" -- packages/default-setup/src`). Each click does
  nothing; with an event, the subscription waits forever. `logs/fe/canvas.vue:508` sends the settings plugin
  `PLUGIN.SELECT pluginId: 'logs'`, compared against `plugin.id`.
- **F11.** `updateSettings` in `default-setup/src/features/settings/be/system.ts`:
  - the frontend sends plugin labels in both forms: `code/fe/composables/useSectionVisibilityMenu.ts:17`
    sends `'code'`, `PluginsTab` sends `plugin.id`;
  - `:148` clears the CLI-path cache only on the bare `'code'`;
  - `:182` `system.get(ev.label)` is undefined for a bare label;
  - `:193` `emitPluginSettings(ev.label, …)` goes through the generated `emit`, which qualifies an address
    again, and the event type is built from the raw label (`DEFAULT-SETUP.CODE_SETTINGS_UPDATED`).
- **F12.** The settings seed compiler (`default-setup/src/seeds/_compilers/settings.ts`) merges each
  feature's `settings.ts` into the seed under **bare** keys: `dist/settings.seed.json` has `plugins.code`
  and no `default-setup.code`. `getDefaultSettings()` (`features/settings/be/defaults.ts:25`) lays the
  registry's addressed feature defaults over that seed, so the bare copies are dead data that make stale
  readers look right. Stale readers: `CliProviders.vue:52`, `PanelTerminalSection.vue:239-242`,
  `ExplorerPanel.vue:202`, `browser/fe/canvas.vue:84`, `threads/be/repository/index.ts:557`.
- **F13.** `generateEvents` types a dependency's plugin by its bare feature name
  (`abuddy-sdk/src/build/generate-entries.ts:993`, `Omit<Pick<__dep_X_PackEvents, 'memos'>, …>`), while
  `defineEvents` sends a bare name to the *sending* pack's namespace. No fixture sends to a dependency's plugin.

### Other open findings

- **F4/F15.** `services.emitter.sendToPlugin` is `sendToPlugin(addressOf(address))`: no check, so an action
  still written `sendToPlugin('threads', …)` (the documented form before this branch) is dropped with a
  bus diagnostic. `services.emitter.sendToSystem` resolves through the registry and throws.
- **F5.** `import { notes } from './system'` (the name) and `from '@/__generated__/system-ids'` (the
  address) are the same identifier with different values. Frontend state modules export both `id`
  (address) and `feature` (name). `defineSystem(id)` names its parameter `id` for a feature name.
- **F6.** `packages/renderer/src/core/actors/application.ts:765` sends `systemId: getDesignated('settings') as any`.
- **F7.** A feature's identity appears in `systems[].id`, `features[]`, `receivedEventTypes` keys,
  `plugins[].id` and `designations`.
- **F8.** `settingsKeyFor(label)` (`settings/be/repository/index.ts:35`) is `busId[label] ?? label`: `_meta`,
  an address and a typo all pass.
- **F14.** The 0.3.15 migration (`default-setup/src/migrations/0.3.15.ts`) moves only default-setup's 12
  features. An installed external pack's stored plugin settings, visibility and last-active plugin reset.
  Replacing settings from the editor or a settings export writes bare keys back. The renderer also keeps a
  last-active plugin in `localStorage` (`agentbuddy-last-active-plugin`).

### Where a plugin id travels outside code (for Decision 1)

XState system ids, the popout window's URL query (`packages/main/src/modules/window-manager/WindowManager.ts`
`createPopoutWindow`, `pluginId` in the query), settings JSON keys, and `localStorage`. No code splits an id on `/`.

## Decisions

Final.

1. **Two textual forms stay:** a name is `<packId>/<featureId>` (or a bare own feature id), an address is
   `<packId>.<featureId>`. Addresses live in actor ids, URLs, settings keys and storage; names only in code.
   After Decision 3, pack authors never write an address, so the forms never meet in pack code.
2. **Brand `FeatureAddress`** in `@abuddy/sdk/ids`, produced only by `qualifiedId`/`resolveName`. It types
   host-facing signatures: `PackSystemDef.id`, `Plugin.id` as the registry holds it, `PackFERegistration`
   designations, `getDesignated`'s return, the registries' lookups. Pack-facing APIs take names (Decision 3).
3. **Pack code holds no address.** Pack-facing APIs take names:
   - `#generated/events` exports `actorOf(name)` for the frontend and `navigateToPlugin(name, event?)`,
     bound to the pack id as `defineEvents(packId)` is; the backend gets `actorOf(system, name)` from the same
     module (a system action has `system` in its arguments).
   - A plugin module no longer carries its id. The generated FE entry lists plugins keyed by feature
     (`plugins: { notes: __plugin_notes }`), and `registerPackFE` addresses them, as `registerPack` already
     addresses `features` and `receivedEventTypes`. The registry owns applying the rule to feature-keyed
     data; `toPackSystemDefs` keeps doing it for systems.
   - `system-ids.ts` is deleted. A system module exports its name only. `busId` stays generated for the
     generated code's own use and is not documented for pack authors.
   - `defineSystem(id)` is renamed `defineSystem(feature)`.
4. **Both `services.emitter` sends resolve through the registry and throw** on a target no registered pack
   owns. The error names the likely fix: for a bare name matching a feature of exactly one registered pack,
   `did you mean "<packId>/<featureId>"?`. Nothing is delivered for a bare name. Stored action source is
   not rewritten; the release note says actions name plugins `<pack>/<feature>`.
5. **The host migrates external packs' stored settings** in its own 0.3.15 app migration
   (`abuddy-host/src/migrations/app/0.3.15.ts`), from each installed pack's manifest (its features with a
   plugin): `plugins.<id>`, `_meta.visibility.<id>`, `_meta.lastActivePlugin`. The same idempotent move runs
   when settings are replaced wholesale (the settings editor, a settings export restored). default-setup's
   own move stays in its migration. The renderer's `localStorage` last-active id is validated against the
   registered plugins and dropped when it names none (it is a convenience, not user data).
6. **One strict resolver:** `resolveName(name, { packId })` in `@abuddy/sdk/ids` returns a `FeatureAddress`.
   - an address (it contains `.`, which no name can, since pack and feature ids hold no dot) → itself;
   - `<pack>/<feature>` → that pack's address;
   - a host id (`HOST_PLUGIN_IDS`, or an id the caller says the host owns) → bare;
   - a bare name with a pack → `<packId>.<name>`;
   - a bare name with no pack → throws.
   Every name → address conversion calls it: `defineEvents`, the generated `actorOf`/`navigateToPlugin`,
   `services.emitter`, the harness, the E2E fixture, the settings key. `addressOf` becomes internal to it.
7. **Settings keys are addresses.** `_meta` is a named reserved key (`PLUGIN_SETTINGS_META_KEY`, which the
   settings system already has). A plugin label in `UPDATE_SETTINGS` is an address; the settings system
   rejects anything else. Feature settings defaults come only from the registry: the seed carries none.

## Phases

### Phase 1 — one strict resolver (F3, F16's leniency)

- `resolveName` per Decision 6, plus the `FeatureAddress` type it returns (the brand lands in Phase 5; here
  it can be a plain alias so this phase stays small).
- `defineEvents`, the harness's `resolveSystemId`/`resolvePluginId` and the E2E fixture's `pluginAddress`
  call it. Delete every fallback to a bare id.
- Suites that go red here are expected: they are F10–F13 surfacing. Note which, and fix them in Phase 2,
  not here. If the phase can't land green on its own, land it together with Phase 2 and say so.

**Done when:** one implementation of the rule; `resolveName` unit spec covers the four cases and the throw.
**Mutation:** make the no-pack case return the bare name, and the spec fails.

### Phase 2 — the regressions (F10, F11, F12, F13)

In this order, each with its test:

1. **F12.** The settings seed compiler stops merging features' settings; `getDefaultSettings` gets them from
   the registry alone (Decision 7). Spec: the compiled seed has no plugin key. Then fix the stale readers:
   frontend readers go through one selector, `pluginSettings(settings, name)` (in the settings feature,
   resolving through Decision 6); `threads/be/repository` goes through `getPluginSettings`.
2. **F11.** Plugin labels are addresses end to end: `useSectionVisibilityMenu` and every frontend sender
   pass the address, the settings system rejects a non-address label, and the fan-out uses the one address
   as settings key, system id and plugin id. It sends through the host-level `emit` (this system forwards to
   other packs' plugins), and builds the event type from the address's feature id (a `featureOf(address)`
   helper in `@abuddy/sdk/ids`). The CLI-path check compares against the code feature's address.
3. **F10.** The generated `navigateToPlugin(name, event?)` (Decision 3). The SDK's own version takes an
   address, is `@internal`, and throws when no registered plugin has that address instead of subscribing
   forever. Move the 20 call sites and the `logs` → settings `PLUGIN.SELECT`.
4. **F13.** Key a dependency's plugins `<dep>/<feature>` in the generated `PackEvents`, as
   `SendableSystemEvents` keys systems. The external fixture adds a `sendsTo` on a default-setup plugin, with
   a unit test asserting the address the event arrives at.

**Done when:**
- E2E (repo suite): changing a code setting in Settings delivers `CODE_SETTINGS_UPDATED` to the code system.
- E2E: a cross-plugin link (Threads → Code) changes the active plugin; one with an event delivers it.
- E2E: a code setting changed in Settings is what the code canvas reads afterwards.
- Fixture unit test: a send to a dependency's plugin arrives at `default-setup.<feature>`.
- **Mutation:** revert each fix in turn; its test fails.

### Phase 3 — the emitter throws (F4, F15; Decision 4)

- `services.emitter.sendToPlugin` resolves through the registry like `sendToSystem`; both throw with the
  "did you mean" message.
- Update `docs/public-facing/services-and-data.md` and record the release note text in the final summary.

**Done when:** a spec shows an action sending to `'threads'` throws naming `default-setup/threads`, and one
sending to `'default-setup/threads'` delivers. **Mutation:** drop the registry check; the throw spec fails.

### Phase 4 — pack code names features (F1, F5, Decision 3)

- Generated `actorOf` and `navigateToPlugin` (Phase 2 may already have added the latter).
- The FE entry keys plugins by feature; `registerPackFE` addresses them; `Plugin.id` is not authored.
  `PackFERegistration.plugins`' shape changes; `api:update`.
- Frontend state modules export only their name; call sites move from `useActorSystem().get(id)` and
  imported `…ActorId`s to `actorOf(name)`. Backend `system.get(<address>)` in pack code moves to
  `actorOf(system, name)`.
- Delete `system-ids.ts` and its generator. Rename `defineSystem`'s parameter.
- The `add feature` scaffold, `docs/public-facing/features.md`, and the CLAUDE.md files state the one
  sentence: pack code names features, its own by id and another pack's as `<pack>/<feature>`.

**Done when:** no module under a pack's `src/` (outside `__generated__`) imports `busId` or contains
`<packId>.`; `system-ids.ts` generates nowhere; `npm run test:external-pack` and
`npm run test:packaged-authoring` pass. **Mutation:** a spec in `@abuddy/cli` fails if the scaffold emits an
address.

### Phase 5 — brand `FeatureAddress` (F6, Decision 2)

- Brand the type; type the host-facing signatures in Decision 2 with it; `getDesignated` returns it.
- Remove the renderer's `as any` at `application.ts:765`.

**Done when:** `git grep "as any" -- packages/renderer/src/core/actors/application.ts` no longer matches that
send; `npm run api:update` committed. **Mutation:** a `@ts-expect-error` spec passing a plain string where a
`FeatureAddress` is required compiles only while the brand exists.

### Phase 6 — settings keys and external packs' settings (F8, F14, Decisions 5 and 7)

- `settingsKeyFor` takes a `FeatureAddress` or the reserved `_meta`, and throws otherwise.
- The host's 0.3.15 app migration moves installed external packs' keys; the settings editor's replace and a
  settings export restore run the same move. The renderer drops a `localStorage` last-active id that names
  no registered plugin.

**Done when:** a host migration spec shows an external pack's pinned plugin, stored settings and last-active
plugin survive, run twice; a settings replace with bare keys lands them addressed. **Mutation:** skip the
move; the spec fails.

## Deferred

- **One feature-keyed registration shape (F7).** After Phase 4, a feature's identity is still spread over
  `systems[]`, `features[]` and `receivedEventTypes`. The direction is a registration keyed by feature, with
  the registry addressing everything in it. It changes the pack contract on both sides and is its own goal.
  Until then, a new registration field is feature-keyed and addressed by the registry, not a sixth copy.
- **A role-addressed send** (`sendToRole`), carried over from goal-designations-and-addressing's Deferred.

## Constraints

- Commit each phase as it finishes, `git commit -- <paths>`, `git diff --cached` first; no attribution
  lines; pushing, tagging and PRs only on request.
- No publishing, releases or triggered workflows. No real data dirs; E2E in the test namespace; no broad
  pkill. Preload, example pack and release metadata rules as in the root CLAUDE.md.
- Typed EARS types are change-controlled (`packages/abuddy-sdk/TYPED-EARS.md`).
- Every @abuddy/sdk contract change runs `npm run api:update` with `etc/` in the same commit. Every phase
  that changes codegen runs `npm run compile`, rebuilds the fixtures, and runs `facade:update` if the facade
  moved.
- Stored user data moves only through 0.3.15: default-setup's keys in its migration, external packs' in the
  host's. Both are idempotent (they run on every development boot).
- Error messages at the author boundary name the fix (the form to write, the pack to name). That is the UX
  bar for every new throw in this goal.

## Outcome (2026-09-21)

Every phase is done. The full chain passed at `5b38e4888`: typecheck, test:unit, build, npm test,
test:external-pack, test:packaged-authoring, api:check and facade:check.

| Phase | Commit | Evidence |
|---|---|---|
| 1: one strict resolver | `a49790c13` | `resolve-name.spec.ts`; the harness and E2E fixture resolve with `resolveName` and throw on an unresolvable name |
| 2: regressions F10–F13 | `37a0a1936` | `feature-addressing.spec.ts` (E2E), settings-secrets, settings-seed; each fails with its fix reverted |
| 3: the emitter throws | `bb873164b` | `emitter.spec.ts`: `sendToPlugin` and `sendToSystem` refuse unregistered names, with "did you mean" |
| 4: pack code names features | `1fa30c912` | `system-ids.ts` gone; no pack source or fixture imports `busId`; `defineSystem(feature)`; feature-keyed FE registration |
| 5: branded `FeatureAddress` | `51d44fa31` | `feature-address.spec.ts` (`@ts-expect-error`, fails with the brand removed); the renderer's `as any` is gone |
| 6: settings keys, external packs | `bbf2d91b9` | `external-plugin-settings-0.3.15.spec.ts` (run twice), `plugin-settings-keys.spec.ts`, `address-plugin-settings.spec.ts`, `application-last-active-plugin.spec.ts`; each mutation-checked |

Found and fixed along the way:
- The logs `earlySystem` was never addressed, so the Logs plugin's Clear and refresh were refused as
  "Unknown system" (`f6f8aa08b`). This was also broken on master.
- Upgrading from 0.3.13, 0.3.14 wrote to the address before 0.3.15's move ran, and the rest of the
  user's code slice was lost. The move now merges, and the address wins.

Choices where the plan left details open:
- `#generated/fe` holds `actorOf`, `navigateToPlugin` and `PluginName`, apart from `#generated/events`.
- `navigateToAddress` and `actorAt` are public but host-only, and `check:specifiers` keeps them out of pack sources.
- The backend `actorOf` mirrors `system.get`, so it returns undefined for a system that isn't running.
- `busId` is no longer a reserved feature id.
- The settings service's `updatePluginSetting` still takes a name, because stored actions call it (Decision 4).
- The shared move leaves a bare key alone when two registered plugins share its feature id. The
  renderer keeps an unregistered last-active id when it is an address, because its pack may load
  later.
- A pack that isn't loaded when the host's 0.3.15 migration runs keeps its bare keys. The host's migration leaves
  a bare id that a built-in pack also has a feature by to that pack's own migration, because the built-in
  plugin ran under it.
