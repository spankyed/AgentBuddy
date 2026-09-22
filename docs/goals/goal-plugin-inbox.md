> **Written in session** `c9f31de2-e94c-46ea-a2ac-2898390dc27d` (Claude Code, 2026-09-22). Resume it with `claude -r c9f31de2-e94c-46ea-a2ac-2898390dc27d`.

```
# Goal: a plugin declares what it accepts, so `sendsTo` and the hand-written cross-feature plumbing go away

Implement docs/goals/goal-plugin-inbox.md on AS/frontend-host-boundary, at or after 6d0633ad4 — the base
its Background was surveyed at.
Before Phase 1, confirm the base: packages/abuddy-sdk/src/build/generate-entries.ts,
packages/abuddy-sdk/src/build/manifest-schema.ts, packages/abuddy-sdk/src/events/index.ts,
packages/abuddy-host/src/packs/registry.ts, packages/abuddy-host/src/bus/machine.ts,
packages/abuddy-host/src/features/application/fe/connection.ts and
packages/default-setup/src/features/plugin-handle.ts exist at HEAD. If they don't, stop and say so —
the plan was surveyed somewhere else. (The host was mid-restructure into src/features/<id>/{be,fe}
when this was written; those paths are the post-restructure ones.)
Read Background, Decisions, Phases and Constraints first. Decisions are final: implement them, don't
reopen them or stop to ask. Open decision 1 must be settled with the user before Phase 6; if it is
still marked open, stop and ask.
Where a detail isn't specified, pick the conventional option, note it in the final summary, and keep
going. No backward compatibility in code: change signatures, move modules, migrate every in-repo caller,
test, fixture, template and doc in the same change, and fix forward. Stored user data is the exception:
it moves with migrations.

Finished when:
- Phases 1–5 are implemented and each meets its "Done when"; every new guard, helper or test is
  mutation-checked.
- `sendsTo` no longer appears in packages/abuddy-sdk/src/build/manifest-schema.ts, in
  abuddy.schema.json, in any abuddy.json in the repo, or in generate-entries.ts.
- `receivedEventTypes` and the `sendsTo` target loop are gone from generate-entries.ts; a plugin's
  `receives` comes from its own declaration.
- A generated `events.ts` spells its dependency plugins `Qualified<'<dep>', __dep_<dep>_PackPluginEvents>`
  with no `Pick<>`, matching the systems line; `SendablePluginEvents` is gone from the facade barrel.
- `broadcastToPlugin` is the backend send and `sendToPlugin` the renderer one; no module exports both
  meanings under one name; the delivery-scope difference is documented in @abuddy/sdk and pinned by a spec.
- `usePluginSettings` and `currentPluginSettings` no longer exist.
- packages/default-setup/src/features/plugin-handle.ts is deleted, or the doc records under Outcome why
  it survived and what still binds it.
- `npm start` boots the dev app clean — the acceptance test for the manifest change (Decision 15).
- npm run typecheck, npm run schema:check, npm run generate:schema -w @abuddy/sdk (clean), api:check
  (sdk), facade:check -w @app/default-setup, packages:build + packages:check.
- npm run test:unit, npm run compile, npm run build, npm test (E2E), npm run test:external-pack,
  npm run test:packaged-authoring.
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
- add backward-compat shims or loosen a failing assertion instead of investigating.
- keep `sendsTo` alive "for the audit trail", or add a `plugin.sendsTo` to replace it (Decision 2).
- give the renderer send a second name in a second module (the rejected `#generated/fe` split).
- put a plugin's machine state type into the facade (Decision 4 carries event unions only).
- keep `SendablePluginEvents` as an alias of `PackPluginEvents` (Decision 4: it is a swap).
- bump PACK_SNAPSHOT_FORMAT or write a friendlier error for the removed `sendsTo` key (Decision 15:
  there are no external packs and no users; a clean `npm start` is the acceptance test).
- migrate the host's hand-written `plugin: { receives: … }` to `definePlugin` (Decision 14: the host has
  no manifest and no codegen to read one).
```

## Background (2026-09-22, at 6d0633ad4 on AS/frontend-host-boundary)

### A system declares its contract; a plugin declares nothing

A backend system says what it accepts and what it sends:

```ts
defineSystem<Incoming | Internal, Outgoing>()
```

A frontend plugin says neither. `PluginDefinition` (`packages/abuddy-sdk/src/fe/plugin.ts`) carries `id`,
`label`, `icon`, `state`, `canvas`, `panel` — no event contract. So codegen answers "what may plugin P
receive?" by inverting the question: find every system that sends to P, union their outgoing types.

That edge is not derivable from the source. A system's outgoing union is a flat list of event types; the
target is a runtime argument (`sendToPlugin(to, event)`). Nothing in the code says which plugin each event
goes to. **`sendsTo` is the manifest field that supplies the missing edge**, and it exists only because the
receiver never declared itself.

### The chain `sendsTo` drives

1. `packages/default-setup/abuddy.json` — `features[].system.sendsTo: ["flows"]`.
2. `packages/abuddy-sdk/src/build/manifest-schema.ts` — `SystemSchema.sendsTo`, an array of strings.
3. `packages/abuddy-sdk/src/build/generate-entries.ts`:
   - `sentEventTypes(feature)` reads a system's outgoing union off its spec through the TypeScript API
     (`module-exports.ts`, `outgoingEventTypesOf`);
   - `receivedEventTypes(pluginId)` unions every sender — the plugin's own feature's system, plus every
     system whose `sendsTo` names it;
   - line ~540 writes `plugin: { receives: [...] }` into `src/__generated__/pack-entry.ts` (runtime strings);
   - lines ~830–890 write the types into `src/__generated__/events.ts`.
4. `packages/abuddy-host/src/packs/registry.ts` — `getPluginEventValidationMap()` turns each registration's
   `plugin.receives` into `Map<pluginRef, PluginEventTypes>`.
5. `packages/abuddy-host/src/bus/machine.ts:144` — the `notify` action checks every `OUTGOING` against that
   map, drops a miss and reports `reportError({ severity: 'diagnostic' })`.

### `sendsTo` does two unrelated jobs

In `generate-entries.ts`'s target loop:

- **naming an own plugin → `addSender(target, feature)`**: that plugin's inbox gains the naming system's
  *entire* outgoing union. Widening.
- **naming a dependency's plugin → `depTargets`**: produces
  `Qualified<'dep', Pick<__dep_SendablePluginEvents, 'logs'>>`. A capability grant, no widening; the loop
  refuses a target whose owner declares no events for it.

### What that costs

Generated today (`packages/default-setup/src/__generated__/events.ts`,
`tests/fixtures/external-pack/src/__generated__/events.ts`):

```ts
export type OwnPluginEvents = { 'flows': __events_flows | __events_actions; ... };

QualifiedSystemEvents = Qualified<'e2e-fixture', PackSystemEvents>
                      & Qualified<'default-setup', __dep_default_setup_PackSystemEvents>
                      & HostSystemEvents;                                   // no gate, whole map

QualifiedPluginEvents = Qualified<'e2e-fixture', OwnPluginEvents>
                      & Qualified<'default-setup', Pick<__dep_default_setup_SendablePluginEvents, 'logs'>>;
```

- **Coarse.** A sender's whole outgoing union enters the target's inbox. If the actions system sends ten
  event types and one reaches `flows`, `flows` accepts all ten — in the types and in the runtime map.
- **Couples receiver to sender.** Adding an event to the actions system's outgoing union silently widens
  `flows`' contract without touching `flows`.
- **No plugin→plugin.** The derivation filters on `f.system`; plugins have no outgoing declaration, so
  plugin-to-plugin edges yield nothing. That is why `packages/default-setup/src/features/actions/fe/public.ts`
  hand-writes `export type ActionsListEvent = Extract<ActionsEvents, { type: 'ACTION.DELETE' | ... }>`.
- **Cross-pack needs a grant** because there is no contract to trust — hence the `Pick` and the refusal.
  Systems need neither.
- **A plugin with no system is unaddressable.** `receivingPlugins()` keys on `f.system && f.plugin`.

### The renderer half is missing

`packages/abuddy-sdk/src/events/index.ts`:

```ts
function sendIncoming(message) {                                     // sendToSystem
  if (_isFeHostBound()) boundFeHost().client.send(message);
  else if (_isHostBound()) boundHost().transport.rootEvents.emitIncoming(message);
}

export function sendToPlugin(to, event) {                            // no renderer branch
  boundHost().transport.rootEvents.emitPluginSend({ to, event });
}
```

`sendToSystem` is one function with two transports. `sendToPlugin` is backend-only; no pack frontend calls
it. The asymmetry is specific to plugins: there is one backend, so both `sendToSystem` transports reach the
same actor, while a plugin exists once per window.

A backend `sendToPlugin` reaches **every** window. The app already pays for this:

```ts
// packages/abuddy-host/src/features/application/fe/connection.ts:17
sendBack((event.type === 'OPEN_PLUGIN' ? { ...event, type: 'OPEN_PLUGIN_FROM_APP' } : event))
// packages/abuddy-host/src/features/application/fe/machine.ts:523
OPEN_PLUGIN_FROM_APP: { guard: 'isMainWindow', actions: 'openPluginFromApp' },
```

The event is renamed on arrival and guarded, or every popout navigates. The fan-out was invisible in the
name.

### The pack-local workaround that grew in the gap

`packages/default-setup/src/features/plugin-handle.ts` is a module-scope singleton per feature, bound by
each plugin machine's `entry` action, with no unbind:

```ts
export function pluginHandle<T extends AnyActorRef = AnyActorRef>(feature: string) {
  let actor: T | undefined
  return { bind(self) { actor = self as T }, get() { if (!actor) throw new Error(`The ${feature} plugin isn't running`); return actor } }
}
```

Eight features declare one in `fe/public.ts` (settings, library, notes, threads, actions, prompts, brain,
flows); `check:specifiers`' `findCrossFeatureImports` makes `fe/public.ts` the only door between features.
~27 files consume one. It duplicates a registry that already exists — the shell spawns every plugin actor
with `systemId` its ref, reachable as `boundFeHost().application.system.get(ref)` — and is strictly worse:
no unbind (a reloaded pack leaves a stale actor), it throws rather than reporting "not running yet", and
being module-scope it cannot cross a pack boundary. `usePlugin()`'s docblock states the policy it works
around: *"Another plugin's state is that plugin's to expose, not a lookup away."*

Its heaviest consumers are `src/extensions/**` (13 of ~27: artifact viewers, tiptap command items, step
forms) — host-rendered outside any `PluginScope`, where `usePlugin()` is unavailable.

### Most cross-feature edges are not cross-feature

The 13 feature→feature edges, sorted by what they want:

| want | edges | note |
|---|---|---|
| my own settings, read/write | ~5 | `usePluginSettings<CodeSettings>('code')` in `features/code/...` — the `code` feature reading its own settings out of the settings plugin's actor, untyped, while `code/fe/state.ts` already receives `FEATURE_SETTINGS_UPDATED`. Ten features receive it. `browser` does the same with `'browser'`. |
| app-wide general settings | ~4 | `useGeneralSettings` |
| command another plugin | ~6 | `selectArtifact`, `approveTodoList`, `rejectTodoList`, `sendToActionsPlugin`, `sendToPromptsPlugin`, `selectFlow` |
| read another plugin's live state | ~8 | `useCurrentThread`, `useSlashCommands`, `useChatStateOverrides`, `useRootFlowId`, `useRunningRootFlowId`, … |
| entity lists | ~4 | `useNotes`, `useActionsList`, `usePromptsList` — `useActionsList` exposes `page`/`totalPages`/`loadingMore`, another feature's paging state |

`settings` is 8 of the 13 and mostly is not communication at all.

### Checked before planning (2026-09-22)

- **`definePlugin<Incoming>()` is feasible by the same mechanism systems use.** `outgoingEventTypesOf`
  reads the *type* of a module's default export and pulls a phantom property off it —
  `propertyType(spec, '_outgoing')` — rather than parsing source. A plugin declaration carrying its inbox
  the same way is read the same way.
- **The host already declares a plugin inbox by hand** (`features/registration.ts:50`), so the shape is
  proven in this codebase; packs are the odd ones out. See Decision 14.
- **Phase 5 is scope-neutral.** Each window is its own renderer with its own module graph, so
  `pluginHandle`'s module-scope actor is already window-local. A renderer `sendToPlugin` preserves today's
  delivery exactly rather than changing it. `spawnPluginActors` loops `context.plugins`
  (`features/application/fe/machine.ts:375`), so a popout spawns every registered plugin and there is no
  "target not spawned" hole; `ownsLastActivePlugin` only decides who records and acts on navigation.
- **Every `usePluginSettings`/`currentPluginSettings` call site targets its own feature** — three call
  sites, all self. See Decision 8.
- **`sendsTo` has two users**: `actions.system` (`["flows"]`) and `settings.system` (`["host/application"]`).
- **`outgoingEventsType` does not exist** in `manifest-schema.ts` or codegen, despite being named in
  `goal-manifest-redesign.md` — that doc was corrected on 2026-09-22.

### Other facts the plan relies on

- A pack's FE bundle is self-contained plus `window.__abuddy` globals, loaded from `pack://`; the FE
  bundler has no notion of dependency packs. Cross-pack frontend access can only be host-mediated at
  runtime and typed through the facade.
- The facade (`generatePackTypes()` in `generate-entries.ts`) is a five-line barrel exporting exactly six
  things — `PackEntityShapes`, `PackStepNodes`, `PackSystemEvents`, `SendablePluginEvents`, `Repositories`,
  `Services`. All backend. `facadeProblems` (`packages/abuddy-cli/src/build/facade-gate.ts`) requires the
  bundled facade to type-check standalone importing only `@abuddy/*`, SDK peers and Node builtins.
  default-setup's is already 5273 lines.
- `tests/fixtures/external-pack` does no cross-pack frontend access today; its plugins use `usePlugin()`
  for their own actor only. The cross-pack half is greenfield.
- Related but separate: `docs/goals/deferred/goal-pack-frontend-isolation.md` covers keeping a pack's
  frontend away from `window.electronAPI`, the host API client and the app DOM. It does not overlap this
  goal's typed-messaging work, but both touch what a pack frontend may reach, so read it before Phase 4.
- **This goal runs before [`goal-manifest-redesign.md`](goal-manifest-redesign.md)**, which reshapes
  `abuddy.json` into `provides` plus sibling annotations. Its Decision 8 named `sendsTo` as one of those
  annotations; it was updated on 2026-09-22 to drop it and to point here. Deleting `sendsTo` first means
  that goal's schema work is written once. Nothing else in the two overlaps.
- `sendsTo` is used by exactly two features today — `actions.system` (`["flows"]`) and `settings.system`
  (`["host/application"]`). Once it is gone, `threads.plugin.default` is the only non-`entry` annotation
  left in default-setup's manifest.

## Decisions

Final.

1. **A plugin declares its inbox.** `definePlugin<Incoming>()` on the plugin entry, read by codegen the way
   `defineSystem`'s spec already is. With no type parameter the inbox defaults to its own feature's system's
   outgoing union — today's behaviour for the common case, so no feature gains work it didn't have.
   `receivedEventTypes` and `sentEventTypes`-for-receivers are deleted; `plugin: { receives: [...] }` comes
   from the declaration.

2. **`sendsTo` is deleted from the manifest**, both jobs with it. No widening: a plugin's inbox is its own.
   No grant: the declaration *is* the permission, exactly as it already is for systems, which take the whole
   `PackSystemEvents` of a dependency with no gate. Do not add `plugin.sendsTo` or hoist `sendsTo` to the
   feature — both keep the inverse index alive.

   What this gives up is the coarse audit trail in `abuddy.json` ("this feature talks to that one"). That
   list was never complete — every plugin→plugin edge was already invisible to it — and the bus still
   validates every send at runtime, against a tighter map than before.

3. **`PackPluginEvents` mirrors `PackSystemEvents`.** Codegen emits it from the declarations, and
   `QualifiedPluginEvents` becomes `Qualified<'<dep>', __dep_<dep>_PackPluginEvents>` — no `Pick`, the same
   shape as the systems line.

4. **`PackPluginEvents` replaces `SendablePluginEvents` in the facade.** It is a swap, not a seventh
   export: `SendablePluginEvents` exists to carry a *derived* inbox, and a declared one makes it dead
   weight. Drop it from `generatePackTypes()` rather than keeping it as an alias — there are no external
   packs and no users, so nothing is owed a transition. Event unions of string-literal-tagged objects
   only; a plugin's machine state type never enters the facade.

   The facade is already 5273 lines for default-setup and `facadeProblems` requires it to type-check
   standalone, so Phase 1's probe still runs — the risk is size and the gate, not compatibility.

5. **The two sends get independent names.**
   - `broadcastToPlugin(ref, event)` — backend. Over the bus, reaching every window showing that plugin.
   - `sendToPlugin(ref, event)` — renderer. This window's actor, directly.

   The scope lives in the verb, because scope is what bit the app (`OPEN_PLUGIN_FROM_APP`). `sendToPlugin`
   keeps the literal reading and matches what "plugin" already means in the renderer, where `usePlugin()`
   hands back this window's actor. The reuse is not silent: the backend export stops offering
   `sendToPlugin`, so every existing backend call fails to compile rather than quietly changing scope.
   `sendToSystem` is unchanged — one backend, both transports reach the same actor.

   Rejected: `notifyPlugin`/`sendToPlugin` (reads well, leaves the fan-out invisible — the original
   mistake); `broadcastToPlugin`/`tellPlugin` (breaks the `…ToPlugin` shape); a single name with an object
   target (`{ everyWindow: ref }`) — real house precedent in `sendToSystem({ role })`, but the backend can
   only fan out, so its every call would carry the object form as noise.

6. **The renderer `sendToPlugin` reuses the shell's existing not-yet-loaded policy** rather than inventing a
   second one: queue while the target pack's frontend is loading, report through `notify` once loading has
   settled with no such plugin (`features/application/fe/machine.ts`, `openPlugin`).

7. **The delivery-scope difference is contract, not folklore.** It is written into the SDK doc comments for
   both functions and into `packages/abuddy-sdk`'s docs, and pinned by a spec that fails if a backend send
   stops reaching every window or a renderer send starts crossing windows.

8. **A feature reads and writes its own settings through the SDK**, not through the settings plugin:
   `useMySettings()` / `updateMySettings(path, value)`, over the `FEATURE_SETTINGS_UPDATED` its own plugin
   already receives, typed from the feature's own settings type.

   Every `usePluginSettings` and `currentPluginSettings` call site in the repo names its **own** feature
   (`usePluginSettings<CodeSettings>('code')` in two `features/code/...` files,
   `usePluginSettings<{ showBookmarksBar?: boolean }>('browser')` and `currentPluginSettings` in
   `features/browser/...`). So both functions lose every consumer and are **deleted** from
   `features/settings/fe/public.ts`, not kept and guarded. The guard is that the symbols no longer exist.

9. **`fe/public.ts` stays hand-written, and shrinks.** A selector is the contract and cannot be generated;
   the plumbing around it can. What leaves: the handle, the `bind` action, the `Extract<>` event unions and
   the six sender wrappers. What stays: the selectors, until Open decision 1 settles.

10. **`plugin-handle.ts` is deleted as a consequence, not as a goal.** It goes when nothing binds it. If
    something still does after Phase 5, the Outcome records what and why rather than forcing it.

11. **Order: reduce the demand before building supply.** Phase 2 (own settings) removes ~5 edges and needs
    none of the rest. Building the general read channel first would cement the own-settings and entity-list
    patterns as cross-pack API.

12. **The plugin entry is declared with `satisfies`, never annotated.** `outgoingEventTypesOf`
    (`packages/abuddy-sdk/src/build/module-exports.ts`) already throws a specific error when a system entry
    is written `const entry: SystemEntry = {…}`, because the annotation erases the spec's event types and
    the map would silently come up short. `definePlugin<Incoming>()` inherits that trap exactly. Mirror the
    error text, and mirror `packages/abuddy-cli/tests/build/facade-gate-system-entry.spec.ts` for plugins.

13. **A declaration composes with the SDK-wide plugin events, it doesn't repeat them.**
    `PLUGIN_EVENT_TYPES` (`FEATURE_SETTINGS_UPDATED`) is taken by every plugin, and the bus already falls
    through to it (`bus/machine.ts`, the `accepted === undefined` branch). A feature's declaration names
    only what is its own; codegen unions the SDK-wide set in. No feature lists `FEATURE_SETTINGS_UPDATED`.

14. **Host plugins keep their hand-written declaration.** `packages/abuddy-host/src/features/registration.ts:50`
    already does what Decision 1 asks of packs:
    ```ts
    plugin: { receives: HOST_PLUGIN_EVENT_TYPES['host/application'] }
    ```
    The host has no `abuddy.json` and no codegen, so there is nothing for `definePlugin` to be read by. It
    is the precedent this goal generalises, not a call site to migrate — leave it, and say so in the code
    so it isn't "fixed" later. `PACKS_PLUGIN_EVENT_TYPES` beside it stays as it is.

15. **No pack format bump, and no compatibility work.** Removing `sendsTo` from a `.strict()` schema makes
    an older pack's `abuddy.json` fail `parseManifest` on install (`packages/abuddy-host/src/packs/installer.ts:104`;
    the loader never re-validates, so an installed pack would keep running). There are no external packs,
    no users and one developer, so nothing is owed a migration: don't bump `PACK_SNAPSHOT_FORMAT`, don't
    add a friendlier error for the old key. The acceptance test is that the dev environment boots clean and
    the in-repo fixtures build.

16. **The rename is mechanical, not risky.** `sendToPlugin` has ~534 occurrences (409 in
    `packages/default-setup`, 49 SDK, 31 CLI, 30 host, 5 api, ~7 fixtures and E2E). It is a find-and-replace
    plus a compile. The one non-mechanical consequence is that `sendToPlugin` is a member of `HostServices`
    (`packages/abuddy-sdk/src/services/index.ts:38`) and `Services` is a facade export, so the rename moves
    `etc/build.api.md` and every `deps/<id>.d.ts`: run `api:update` and `facade:update` and commit the
    reports as part of the phase.

## Open decisions (settle with the user before Phase 6)

1. **Whether to build a declared read channel at all.** After Phases 2–5 the residue is the reads that are
   genuinely another plugin's live state. Measure it first, then choose:
   - **Leave `fe/public.ts` selectors as they are.** No new manifest or codegen surface. Cross-pack reads
     stay impossible; no pack needs them today. — *open*
   - **Add a declared `publishes()` view**, read by codegen like the plugin inbox, with a narrow view type
     in the facade. Types cross packs; entity-list internals (`page`, `loadingMore`) stop leaking because
     the declaration is narrow. Costs new manifest/codegen surface and a second facade export. — *open*

   Phase 1's facade probe informs this: if a declared view type cannot pass `facadeProblems` without
   bloating the facade, the second option is intra-pack only and worth much less.

## Phases

### Phase 1 — Probes

Two questions decide the shape of Phases 3–6. Neither writes production code; both record results in a
`## Spike results (YYYY-MM-DD)` section added to this doc.

- **Facade probe.** Hand-write a representative `PackPluginEvents` (and, for Open decision 1, a narrow view
  type) into `packages/default-setup/src/__generated__/pack-types.ts`, run `abuddy build` and
  `facadeProblems`. Record: does it pass the gate, and by how many lines does
  `dist/types/pack-types.d.ts` grow from its current 5273.
- **Renderer delivery probe.** Confirm a renderer-side send resolves the target through
  `boundFeHost().application.system.get(ref)` for a plugin of *another* pack in the same window, and what
  happens when that pack's frontend has not loaded yet.

**Done when:** both results are recorded in this doc with the commands used; no source file outside the
probe is changed; the probe changes are reverted (`git status` clean apart from this doc).

### Phase 2 — A feature's own settings

Independent of Phases 3–5; it can land first or alone.

- `useMySettings()` / `updateMySettings(path, value)` in `@abuddy/sdk/fe`, over the plugin's own
  `FEATURE_SETTINGS_UPDATED` (Decision 8).
- Migrate all four self-targeting call sites: `features/code/fe/features/explorer/ExplorerPanel.vue:201`,
  `features/code/fe/features/terminal/PanelTerminalSection.vue:238` (and its
  `updatePluginSettings('code', …)` at :417), `features/browser/fe/canvas.vue:81`,
  `features/browser/fe/state.ts:5`. Also `features/logs/fe/canvas.vue`'s `updatePluginSettings` write.
- **Delete `usePluginSettings` and `currentPluginSettings`** from `features/settings/fe/public.ts` — they
  have no remaining consumers (Decision 8). `useGeneralSettings`, `updateGeneralSettings` and
  `useSettingsSaveStatus` stay.
- The hand-supplied type parameters (`usePluginSettings<CodeSettings>`) go with them.

**Done when:** `npm run typecheck:fe` and `npm run typecheck:sdk` pass; `npm test -w @app/default-setup`
passes; `npm run api:update` run in `packages/abuddy-sdk` and `etc/` committed; `git grep
usePluginSettings\\|currentPluginSettings` returns nothing. Mutation: reintroducing either symbol and a
call to it fails the typecheck, since the settings machine no longer exposes that path.

### Phase 3 — The plugin inbox, and `sendsTo` deleted

The root change. After Phase 1.

- `definePlugin<Incoming>()` in `packages/abuddy-sdk/src/fe/plugin.ts`, with the default of Decision 1,
  the `satisfies` guard of Decision 12 and the SDK-wide union of Decision 13.
- `generate-entries.ts`: read the declaration the way `sentEventTypes` reads a system spec; delete
  `receivedEventTypes` and the `sendsTo` target loop; emit `PackPluginEvents`; drop the `Pick<>` from
  `QualifiedPluginEvents` (Decision 3); swap `SendablePluginEvents` for `PackPluginEvents` in
  `generatePackTypes()` (Decision 4).
- `manifest-schema.ts`: delete `sendsTo` from `SystemSchema` and its `superRefine` checks; regenerate
  `abuddy.schema.json` (`npm run generate:schema -w @abuddy/sdk`). No format bump (Decision 15).
- Remove `sendsTo` from its two users — `actions` and `settings` in `packages/default-setup/abuddy.json` —
  and from `tests/fixtures/external-pack/abuddy.json`; declare the inbox on the plugins that needed one.
- `sendsTo` reaches further than codegen; all of these change in this phase (Decision 16's "10 minutes"
  applies to each, but none may be missed):
  - SDK source: `src/events/index.ts`, `src/framework/define-system.ts`, `src/framework/pack-registration.ts`
  - host: `src/features/registration.ts`
  - specs: `abuddy-sdk/tests/build/manifest-schema.spec.ts`, `abuddy-sdk/tests/build/generate-entries.spec.ts`,
    `default-setup/tests/unit/typed-event-channels.spec.ts`, `abuddy-cli/tests/build/facade-typing.spec.ts`,
    `abuddy-cli/tests/build/dependency-graph.spec.ts`
  - pack sources: `default-setup/src/features/actions/be/system.ts`,
    `tests/fixtures/external-pack/src/features/memos/be/system.ts`
  - reports: `abuddy-sdk/etc/build.api.md`, `default-setup/etc/pack-types.api.md`
  - docs: `docs/public-facing/manifest.md`, `docs/public-facing/features.md`,
    `packages/abuddy-sdk/CLAUDE.md`, `packages/default-setup/CLAUDE.md`
- `packages/abuddy-host/src/packs/registry.ts` and `bus/machine.ts` are unchanged — they read
  `plugin.receives`, which is now precise. Confirm with a spec rather than by inspection.

**Done when:** `npm run typecheck`, `npm run schema:check`, `npm test -w @abuddy/sdk`,
`npm test -w @abuddy/host`, `npm run compile`, `npm run test:external-pack` pass; a generated `events.ts`
for the fixture pack spells its dependency plugins with no `Pick<>`; `facade:check -w @app/default-setup`
and `api:check` updated and committed; `git grep sendsTo` returns nothing outside `docs/archive/` and
`docs/goals/goal-manifest-redesign.md`'s dated note; `npm start` boots the dev app clean (Decision 15's
acceptance test). Mutation: narrowing a plugin's declared inbox makes a send that was valid fail to
compile, and the bus drops it with a `diagnostic` report; annotating a plugin entry `: PluginDefinition`
instead of `satisfies` fails the build with the Decision 12 error.

### Phase 4 — `broadcastToPlugin`, and the renderer send

After Phase 3.

A find-and-replace plus a compile (Decision 16) — ~534 occurrences, mechanical. The only part that needs
thought is the facade consequence and the new renderer branch.

- Rename the backend send to `broadcastToPlugin` (Decision 5): `packages/abuddy-sdk/src/events/index.ts`,
  `defineEvents`, `HostServices` (`src/services/index.ts:38`, and the `emitter` implementation at :59),
  the generated `events.ts`, and every backend caller — 409 in `packages/default-setup`, 30 in
  `packages/abuddy-host`, 31 in `packages/abuddy-cli`, 5 in `packages/api`, plus the fixtures and
  `tests/e2e/plugin-sends.spec.ts`.
- Add the renderer `sendToPlugin`, delivering to `boundFeHost().application.system.get(ref)` and reusing the
  shell's not-yet-loaded policy (Decision 6).
- Document the delivery scopes on both functions and in `packages/abuddy-sdk`'s docs (Decision 7).

**Done when:** `npm run typecheck`; `npm run api:update` in `packages/abuddy-sdk` and
`npm run facade:update -w @app/default-setup`, both with their `etc/` committed — `Services` is a facade
export, so the rename moves `etc/build.api.md` and every `deps/<id>.d.ts` (Decision 16);
`npm run test:unit` and `npm test` (E2E) pass; a spec pins that a backend send reaches every window and a
renderer send reaches only its own (two windows in one E2E, or the shell fakes in
`packages/abuddy-host/tests/fe/shell/`). Mutation: routing the renderer send through the bus fails that
spec.

### Phase 5 — Migrate `fe/public.ts`, drop the handle

After Phase 4.

- Replace the six sender wrappers and their `Extract<>` unions with the receiving plugins' declarations
  (Decision 9): `selectArtifact`, `approveTodoList`, `rejectTodoList`, `sendToActionsPlugin`,
  `sendToPromptsPlugin`, `selectFlow`, and their ~6 call sites.
- Delete each `pluginHandle` whose feature no longer needs one, with its `entry: ({ self }) => …bind(self)`.
  `library/fe/public.ts` exports only the handle and should disappear entirely.
- Delete `packages/default-setup/src/features/plugin-handle.ts` when nothing binds it (Decision 10).

This phase is **scope-neutral**: `pluginHandle` is module state in a per-window renderer, so it was
already window-local, and the renderer `sendToPlugin` delivers to the same actor it did. No migrated
sender changes which window it affects.

**Done when:** `npm run typecheck`, `npm test -w @app/default-setup`, `npm test` (E2E) pass;
`npm run check:specifiers` still reports `fe/public.ts` as the only cross-feature door; `git grep
pluginHandle` returns nothing, or the Outcome records what still binds one.

### Phase 6 — Re-measure the reads, then decide (Open decision 1)

- Recount the cross-feature and extension consumers of each `fe/public.ts` after Phases 2 and 5, and put
  the table in this doc.
- Settle Open decision 1 with the user. Implement only what is chosen.

**Done when:** the table is in the doc and Open decision 1 has moved into Decisions.

## Deferred

- A frontend **data** channel for entity lists (`useNotes`, `useActionsList`, `usePromptsList`). These are
  EARS rows cached per plugin; the backend solved the equivalent with repositories and the renderer holds no
  EARS data. Out of scope, and not to be approximated by widening the read channel.
- Pack frontend isolation from `window.electronAPI`, the host API client and the app DOM —
  `docs/goals/deferred/goal-pack-frontend-isolation.md`.
- The `brain ↔ flows` mutual `public.ts` dependency (each settings panel reads the other's root-flow id).
  It survives only because both are consumed from `.vue` setup rather than module init. Note it in the
  Phase 6 table; do not restructure it here.

## Constraints

- Commit each phase as it finishes, in logical chunks, no attribution lines; check `git diff --cached`
  first and use `git commit -- <paths>`. Pushing, tagging and PRs are on request.
- No publishing, releases or triggered workflows.
- No real data dirs, no broad pkill, E2E in the `abuddy-test` namespace with an isolated
  `ABUDDY_USER_DATA_DIR`.
- No bare `tsc` in `packages/preload`; no `npm install` in the example pack; no version or release metadata.
- Typed EARS types are change-controlled (`packages/abuddy-sdk/TYPED-EARS.md`).
- Published packages: no `any` in the pack-facing SDK, the TypeScript 5.7 floor, `npm run api:update` after
  export changes with `etc/` committed.
- Build order: `packages:build` before the CLI suite; `npm run compile` before the api suites and E2E.
  Suites don't run concurrently — they share the package build lock and build stamps.
- Investigate failing tests; mutation-check every new guard.
- External packs are first-class: `tests/fixtures/*`, the example pack and `test:packaged-authoring` keep
  passing, and their manifests are migrated in the same change as the schema.
- Per-phase checks are the narrow ones named in "Done when"; the full chain runs once at the end of a
  phase, in the background (root `CLAUDE.md`, "What to run after a change").
