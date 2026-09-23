> **Done in part** (`3b793b5a4`..`f8f0c4708` on `AS/plugin-inbox`), **superseded in part** by
> [`goal-plugin-contract.md`](../../goals/goal-plugin-contract.md), which carries what is left and the
> finding that came out of the work. The text below is the plan as written, with the trims it took while
> open; see the Outcome for what landed, what changed shape and what moved on.

> **Written in session** `c9f31de2-e94c-46ea-a2ac-2898390dc27d` (Claude Code, 2026-09-22). Resume it with `claude -r c9f31de2-e94c-46ea-a2ac-2898390dc27d`.

```
# Goal: a plugin declares what it accepts, so `sendsTo` and the hand-written cross-feature plumbing go away

Implement docs/goals/goal-plugin-inbox.md, at or after bec339ea7 — the base its Background was
re-surveyed at, which is the merge of goal-settings-to-host.md.
Before Phase 1, confirm the base: packages/abuddy-sdk/src/build/generate-entries.ts,
packages/abuddy-sdk/src/build/manifest-schema.ts, packages/abuddy-sdk/src/events/index.ts,
packages/abuddy-sdk/src/framework/define-system.ts, packages/abuddy-host/src/packs/registry.ts,
packages/abuddy-host/src/bus/machine.ts, packages/abuddy-host/src/features/registration.ts and
packages/default-setup/src/features/plugin-handle.ts exist at HEAD, and that
packages/default-setup/src/features/settings/ does NOT (goal-settings-to-host moved it). If any of that
is wrong, stop and say so — the plan was surveyed somewhere else.
Phase 2 is a verification slot: its work landed in goal-settings-to-host. Check it, record the one
residue it names, and move on.
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
- A plugin declares the inbox other plugins may send it (`pluginAccepts()`), and only that declared half
  reaches a dependent's facade (`PackPluginEvents`); what a feature's own system sends its own plugin stays
  between the two halves.
- A generated `events.ts` spells its dependency plugins `Qualified<'<dep>', __dep_<dep>_PackPluginEvents>`
  with no `Pick<>`, matching the systems line; `SendablePluginEvents` is gone from the facade barrel.
- `broadcastToPlugin` is the backend send and `sendToPlugin` the renderer one; no module exports both
  meanings under one name; the delivery-scope difference is documented in @abuddy/sdk and pinned by a spec.
- The renderer send is typed from the target's declared inbox, and so is `navigateToPlugin`, which hands its
  events to the same actor. It is not runtime-checked: the trimmed scope dropped the FE validation map, and
  `Message` carries no sender, so a map could not tell one audience from the other anyway.
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
- build `useMySettings`/`updateMySettings` or any settings composable — that work landed in
  goal-settings-to-host and Phase 2 only verifies it (Decision 8).
- fix `FeatureSettingsUpdated.settings` being `unknown` — it is goal-settings-to-host's Decision 7, and
  belongs to that goal (Decision 8); record it, don't do it.
- split `defineSystem` into `Public`/`Internal` (the goal was trimmed to the plugin half; the system-side
  leak is recorded under Deferred).
- make a validation map audience-aware — `Message` has no sender, so it cannot be (Decision 18).
```

## Background (surveyed 2026-09-22 at 6d0633ad4; re-verified at bec339ea7, the goal-settings-to-host merge)

> **Re-verified after `goal-settings-to-host.md` merged (#199).** Six counts in the first survey were stale
> and are corrected below: `sendsTo` has four users, not two, and two of them target host plugins;
> `sendsTo` reaches 26 files, not 20; `fe/public.ts` is 7 files, not 8; the cross-feature edge graph is 16
> edges, not ~27, and feature→feature is 4, not 13; 14 plugin entries are in the annotation form, not 15.
> `sendToPlugin`'s ~534 occurrences are unchanged. What that goal did and didn't do for this one is
> Decision 8.

> Line numbers in `features/application/fe/machine.ts` were re-checked at `c947ed32b`, which changed that file
> after this was surveyed. Every other citation here still points where it says.

### A system declares its contract; a plugin declares nothing

A backend system says what it accepts and what it sends:

```ts
defineSystem<Incoming | Internal, Outgoing>()
```

A frontend plugin says neither. `PluginDefinition` (`packages/abuddy-sdk/src/fe/plugin.ts`) carries `id`,
`label`, `icon`, `state`, `canvas`, `panel` — no event contract. So codegen answers "what may plugin P
receive?" by inverting the question: find every system that sends to P, union their outgoing types.

That edge is not derivable from the source. A system's outgoing union is a flat list of event types; the
target is a runtime argument (`broadcastToPlugin(to, event)`). Nothing in the code says which plugin each event
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

export function broadcastToPlugin(to, event) {                            // no renderer branch
  boundHost().transport.rootEvents.emitPluginSend({ to, event });
}
```

`sendToSystem` is one function with two transports. `broadcastToPlugin` is backend-only; no pack frontend calls
it. The asymmetry is specific to plugins: there is one backend, so both `sendToSystem` transports reach the
same actor, while a plugin exists once per window.

A backend `broadcastToPlugin` reaches **every** window. The app already pays for this:

```ts
// packages/abuddy-host/src/features/application/fe/connection.ts:17
sendBack((event.type === 'OPEN_PLUGIN' ? { ...event, type: 'OPEN_PLUGIN_FROM_APP' } : event))
// packages/abuddy-host/src/features/application/fe/machine.ts:525
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

### An inbox has two audiences, and the type system collapses them

A feature's other half sends it one set of events; every other pack may send it a much smaller one. Authors
already separate those by hand:

```ts
// features/logs/be/system.ts:40
export const logsSpec = defineSystem<IncomingLogEvents | LogsInternalEvents, OutgoingLogsEvents, LogsContext>();
```

`defineSystem` then uses that first type parameter in three places
(`packages/abuddy-sdk/src/framework/define-system.ts`):

```ts
types:     { context: TContext; events: TEvents | SystemEvents },   // the machine
typeOf:    safeEvents<TEvents | SystemEvents>(),                    // the guard helper
_incoming: TEvents,                                                 // → PackSystemEvents → the facade
```

The first two need the union — the machine handles incoming *and* internal. The third is the **published
contract** and gets the same union, so internal events ship to every dependent pack:

```
tests/fixtures/external-pack/src/__generated__/deps/default-setup.d.ts:3629
            type: "ADD_LOG";
```

`ADD_LOG` is one of `LogsInternalEvents`, and it reaches that facade through
`IncomingEventsOf<(typeof specs)['logs']>` (`:3673`). Nothing outside the machine can legitimately send it
— it comes from the system's own child actor, `sendBack` inside a `fromCallback` (`logs/be/system.ts:45`) —
so the facade advertises surface area with no use.

The host is the one place that keeps the two apart, by hand
(`packages/abuddy-host/src/features/registration.ts:55`):

```ts
[featureIdOf(HOST.settings)]: { …, plugin: { receives: [...SETTINGS_PLUGIN_EVENT_TYPES, ...HOST_PLUGIN_EVENT_TYPES['host/settings']] } },
```

with `HostPluginEvents` documented as *"what a pack may name"* and `PACKS_PLUGIN_EVENT_TYPES` marked *"Not
part of `HostPluginEvents`"* (`:26`). The **distinction** is right and is the precedent for Decision 1; the
**mechanism** is not something to copy — three hand-maintained lists per host feature, joined by a manual
spread that nothing checks, and a runtime `receives` that is the flat union anyway.

### What is actually enforced, and what isn't

| path | typed | checked at runtime |
|---|---|---|
| backend send → bus → plugin | yes | **yes** — `getPluginEventValidationMap()`, drop + `diagnostic` (`bus/machine.ts:150`) |
| renderer `system.get(ref).send(…)` | no | **no** — nothing observes it |
| renderer `broadcastToPlugin` (this goal) | yes | yes, once Decision 18 lands; nothing today |

The middle row is XState's own API, not a hole this goal opens: `system` is a property of every `ActorRef`
and a member of `UnifiedArg`, which `ActionArgs` extends, so it is reachable from any action and from
anything `usePlugin()` returns. `useShell().plugins` enumerates every registered plugin's ref. Neither the
old `sendsTo` nor the new declaration changes that; see Decision 2.

**And a runtime check can never tell one audience from the other**, because the envelope has no sender
(`packages/abuddy-sdk/src/events/index.ts:18`):

```ts
export interface Message { to: string; event: { type: string; [key: string]: unknown } }
```

So the two-audience split of Decision 1 is enforceable in types only, and the validation maps stay one flat
union per plugin. Their job is "does this plugin handle this event at all", not "is this sender allowed to
send it" — Decision 18 says so where it specifies the check.

### Checked before planning (2026-09-22)

- **`definePlugin<Incoming>()` is feasible by the same mechanism systems use.** `outgoingEventTypesOf`
  reads the *type* of a module's default export and pulls a phantom property off it —
  `propertyType(spec, '_outgoing')` — rather than parsing source. A plugin declaration carrying its inbox
  the same way is read the same way.
- **The host already declares a plugin inbox by hand** (`features/registration.ts:50`), so the shape is
  proven in this codebase; packs are the odd ones out. See Decision 14.
- **Phase 5 is scope-neutral.** Each window is its own renderer with its own module graph, so
  `pluginHandle`'s module-scope actor is already window-local. A renderer `broadcastToPlugin` preserves today's
  delivery exactly rather than changing it. `spawnPluginActors` loops `context.plugins`
  (`features/application/fe/machine.ts:377`), so a popout spawns every registered plugin and there is no
  "target not spawned" hole; `ownsLastActivePlugin` only decides who records and acts on navigation.
- **`sendsTo` has four users**, and two target host plugins — so the `hostTargets` branch Phase 3 deletes
  is live code, not a hypothetical:
  ```
  default-setup  threads → host/application
  default-setup  code    → host/settings
  default-setup  actions → flows
  external-pack  memos   → default-setup/logs
  ```
- **`sendsTo` appears in 26 files** (packages, tests and docs, excluding `docs/archive/`). Phase 3 lists them.
- **The cross-feature read graph is 16 edges, and 12 of them are extensions:**
  ```
  extensions → threads 6,  flows 4,  notes 2          (12)
  flows → brain,  brain → flows,  code → prompts,  code → actions   (4)
  ```
  Feature→feature is down to 4 from 13, because every settings edge went with
  `goal-settings-to-host`. So the residue Open decision 1 is about is **mostly an extensions problem** —
  which is the original reason `pluginHandle` exists: `src/extensions/**` renders outside any
  `PluginScope`, where `usePlugin()` is unavailable.
- **`fe/public.ts` is 7 files** (`actions`, `brain`, `flows`, `library`, `notes`, `prompts`, `threads`), each
  still declaring a `pluginHandle`.
- **14 plugin entries are in the annotation form**, and `definePlugin` is a free name (0 occurrences).
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

1. **A plugin declares its inbox, in two parts.** `definePlugin<Public, Internal>()` on the plugin entry,
   read by codegen the way `defineSystem`'s spec already is (a phantom property off the default export's
   type). `Public` is what any pack may send it; `Internal` is what its own feature's system sends it and
   never leaves the pack. With no type parameters the inbox defaults to its own feature's system's outgoing
   union as `Internal` — today's behaviour for the common case, so no feature gains work it didn't have.
   `receivedEventTypes` and `sentEventTypes`-for-receivers are deleted; `plugin: { receives: [...] }` comes
   from the declaration.

   The split is what stops a declaration from publishing every internal event as cross-pack API — the leak
   that exists on the system side today (Background, "An inbox has two audiences"). It falls out of codegen
   rather than being maintained by hand:

   | map | contents | who may send |
   |---|---|---|
   | `OwnPluginEvents` → the pack's own sends | `Public \| Internal` | the pack owns both halves, so nothing that compiles today stops compiling |
   | `PackPluginEvents` → the facade | `Public` only | a dependent gets the contract, not the internals |

   Codegen must tell **"declared nothing"** from **"declared `never`"**: the system side already collapses
   an empty declaration (`if (declared.flags & ts.TypeFlags.Never) return []`), so a `never` default on the
   type parameter would make "inherit my system's outgoing" and "accept nothing" identical. Use the absence
   of the phantom property as the signal, not its value.

2. **`sendsTo` is deleted from the manifest**, both jobs with it. No widening: a plugin's inbox is its own.
   No grant: the declaration takes over what `sendsTo` governed, exactly as it already does for systems,
   which take the whole `PackSystemEvents` of a dependency with no gate. Do not add `plugin.sendsTo` or
   hoist `sendsTo` to the feature — both keep the inverse index alive.

   **What the declaration governs is types and the validation maps — not access.** It is not a boundary
   and `sendsTo` never was one: XState puts `system` on every `ActorRef` and in every action's arguments
   (`UnifiedArg`, which `ActionArgs` extends), so any pack has always been able to write

   ```ts
   const mine = usePlugin()                        // @abuddy/sdk/fe
   const ref  = useShell().plugins[0].id           // every registered plugin, by ref
   mine.system.get(ref)?.send({ type: 'ANYTHING' })
   ```

   with no cast and nothing to block, because `system` is the actor's own property rather than something
   the SDK hands out. Deleting `sendsTo` therefore gives up no access control, because it had none to
   give. Real isolation is `docs/goals/deferred/goal-pack-frontend-isolation.md`'s problem, the same class
   as keeping a pack frontend away from `window.electronAPI`; don't attempt it here.

   What this does give up is the coarse audit trail in `abuddy.json` ("this feature talks to that one").
   That list was never complete — every plugin→plugin edge was already invisible to it — and both buses
   still validate every send they carry, against a tighter map than before (Decision 18).

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
   - `broadcastToPlugin(ref, event)` — renderer. This window's actor, directly.

   The scope lives in the verb, because scope is what bit the app (`OPEN_PLUGIN_FROM_APP`). `broadcastToPlugin`
   keeps the literal reading and matches what "plugin" already means in the renderer, where `usePlugin()`
   hands back this window's actor. The reuse is not silent: the backend export stops offering
   `broadcastToPlugin`, so every existing backend call fails to compile rather than quietly changing scope.
   `sendToSystem` is unchanged — one backend, both transports reach the same actor.

   Rejected: `notifyPlugin`/`broadcastToPlugin` (reads well, leaves the fan-out invisible — the original
   mistake); `broadcastToPlugin`/`tellPlugin` (breaks the `…ToPlugin` shape); a single name with an object
   target (`{ everyWindow: ref }`) — real house precedent in `sendToSystem({ role })`, but the backend can
   only fan out, so its every call would carry the object form as noise.

6. **The renderer `broadcastToPlugin` reuses the shell's existing not-yet-loaded policy** rather than inventing a
   second one: queue while the target pack's frontend is loading, report through `notify` once loading has
   settled with no such plugin (`features/application/fe/machine.ts`, `openPlugin`).

7. **The delivery-scope difference is contract, not folklore.** It is written into the SDK doc comments for
   both functions and into `packages/abuddy-sdk`'s docs, and pinned by a spec that fails if a backend send
   stops reaching every window or a renderer send starts crossing windows.

8. **A feature's machine reads its own settings from its own context. Done by `goal-settings-to-host.md`.**

   This decision first proposed `useMySettings()` / `updateMySettings()` as the API for it. **Those names were
   wrong** and are not to be built: a composable cannot serve a machine action — `currentPluginSettings('browser')`
   was called inside `actions: ({ event }) => …`, where there is no Vue scope — and a machine needs no API at all,
   because the feature already has the data in its own context. `goal-settings-to-host` settled it, and its result
   is the shape to keep:

   ```ts
   // features/browser/fe/state.ts:323 — was currentPluginSettings<…>('browser')?.openLinksInApp
   actions: ({ context, event }) => { if (context.settings.openLinksInApp ?? true) { … } }
   ```

   `usePluginSettings` and `currentPluginSettings` no longer exist as pack API; `browser` handles
   `FEATURE_SETTINGS_UPDATED` like the other nine features; writes go through `services.settings`.

   A machine needs no API; a component does, and `goal-settings-to-host` shipped one — `@abuddy/sdk/fe`'s
   settings composables, documented there. Neither is this goal's to build or change.

   **One residue, which Phase 2 verifies rather than fixes.** That goal's Decision 7 — typing
   `FeatureSettingsUpdated.settings` per feature — did **not** land. It is still
   `{ type: 'FEATURE_SETTINGS_UPDATED'; settings: unknown }` (`abuddy-sdk/src/events/index.ts:30`), so every
   feature that handles it casts:

   ```ts
   // features/browser/fe/state.ts:314
   FEATURE_SETTINGS_UPDATED: { actions: assign({ settings: ({ event }) => (event as { settings: BrowserSettings }).settings }) },
   ```

   That cast belongs to the settings goal, not this one. Record it in the Outcome and leave it.

9. **`fe/public.ts` stays hand-written, and shrinks.** A selector is the contract and cannot be generated;
   the plumbing around it can. What leaves: the handle, the `bind` action, the `Extract<>` event unions and
   the six sender wrappers. What stays: the selectors, until Open decision 1 settles.

10. **`plugin-handle.ts` is deleted as a consequence, not as a goal.** It goes when nothing binds it. If
    something still does after Phase 5, the Outcome records what and why rather than forcing it.

11. **Order: reduce the demand before building supply — and it already happened.**
    `goal-settings-to-host` removed the 9 settings edges before this goal starts, which is why the read
    channel is the last question rather than the first: building it earlier would have cemented the
    own-settings pattern as cross-pack API. What remains (Open decision 1) is measured against 16 edges, not
    27, and 12 of those 16 are extensions.

12. **The plugin entry is declared with `satisfies`, never annotated.** `outgoingEventTypesOf`
    (`packages/abuddy-sdk/src/build/module-exports.ts`) already throws a specific error when a system entry
    is written `const entry: SystemEntry = {…}`, because the annotation erases the spec's event types and
    the map would silently come up short. `definePlugin<Incoming>()` inherits that trap exactly. Mirror the
    error text, and mirror `packages/abuddy-cli/tests/build/facade-gate-system-entry.spec.ts` for plugins.

    **Every plugin entry in the repo is in the annotation form today** — 15 of 15, in `default-setup` and
    both fixture packs:
    ```ts
    const notesPlugin: PluginDefinition = { label, icon, state, canvas, panel, settings };
    export default notesPlugin;
    ```
    So Phase 3 rewrites all 15, not only the ones that gain an inbox. The two that gain one (the plugins
    `actions` and `settings` reach today through `sendsTo`, plus whichever Phase 5 migrates) differ from
    the rest only by a type argument. `abuddy add feature`'s scaffold and `docs/public-facing/features.md`
    emit the annotation form and change with them.

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

    All three host features declare this way now, and `host/settings` (`:55`) declares **both halves**
    explicitly — `[...SETTINGS_PLUGIN_EVENT_TYPES, ...HOST_PLUGIN_EVENT_TYPES['host/settings']]`, internal
    then public. That is the precedent for Decision 1's split. Its *mechanism* is not: three hand-maintained
    lists per feature joined by a spread nothing checks. The host keeps it because it has no codegen; packs
    get the split derived from one declaration instead.

    `HOST_PLUGIN_EVENT_TYPES` already carries a `'host/settings'` entry (`CLI_TEST_RESULT`), which is what
    `code`'s `sendsTo: ["host/settings"]` sends it. Phase 3 must keep that send working without `sendsTo`.

15. **No pack format bump, and no compatibility work.** Removing `sendsTo` from a `.strict()` schema makes
    an older pack's `abuddy.json` fail `parseManifest` on install (`packages/abuddy-host/src/packs/installer.ts:104`;
    the loader never re-validates, so an installed pack would keep running). There are no external packs,
    no users and one developer, so nothing is owed a migration: don't bump `PACK_SNAPSHOT_FORMAT`, don't
    add a friendlier error for the old key. The acceptance test is that the dev environment boots clean and
    the in-repo fixtures build.

16. **The rename is mechanical, not risky.** `broadcastToPlugin` has ~534 occurrences (409 in
    `packages/default-setup`, 49 SDK, 31 CLI, 30 host, 5 api, ~7 fixtures and E2E). It is a find-and-replace
    plus a compile. The one non-mechanical consequence is that `broadcastToPlugin` is a member of `HostServices`
    (`packages/abuddy-sdk/src/services/index.ts:38`) and `Services` is a facade export, so the rename moves
    `etc/build.api.md` and every `deps/<id>.d.ts`: run `api:update` and `facade:update` and commit the
    reports as part of the phase.

17. **`navigateToPlugin`'s event is typed from the same inbox; `openPlugin`'s stays untyped.**
    `navigateToPlugin(name, event?)` (`#generated/fe`) takes a compile-time-checked `PluginName` and hands
    the events to that plugin's actor — the same delivery the renderer `broadcastToPlugin` does, so it takes the
    same types. Today its payload is the SDK's open `PluginEvent` (`{ type: string; [key: string]: unknown }`),
    which leaves a typed channel beside an untyped one doing the same thing.

    `openPlugin(ref, event?)` (`@abuddy/sdk/fe`) keeps `PluginEvent`: its target arrives as data — a link
    block's, a registered plugin's `id` — so there is no name to type against. It is the escape hatch, the
    way `untypedQx` is for a query whose entity isn't known at compile time.

18. **The renderer send is checked at runtime too, against the same declaration.** The backend path
    already is: `bus/machine.ts:150` looks the target up in `getPluginEventValidationMap()` and drops a
    miss with a `diagnostic` report. The frontend cannot do that today — `PackFEFeature`
    (`packages/abuddy-sdk/src/fe/pack-fe-registration.ts`) carries `plugin?: PluginDefinition`,
    `designation` and `default`, and nothing about what a plugin accepts — so the FE registry doesn't know.

    So: `PackFEFeature` gains the plugin's `receives`, codegen emits it into `pack-entry-fe.ts` beside the
    backend entry's copy, `createFePackRegistry()` builds the equivalent map, and the renderer
    `broadcastToPlugin` checks and reports through it. One declaration, the same meaning on both sides.

    **This catches mistakes, not misuse.** `mine.system.get(ref)?.send(…)` bypasses it, as it bypasses the
    bus (Decision 2). It is worth the field for the same reason the bus's `diagnostic` report is worth
    having: a send to a plugin that doesn't handle it is a bug, and silence is the worst way to learn.
    Match the bus's behaviour rather than inventing another — report and drop, never throw, since the
    caller is a running plugin.

    **The check cannot be audience-aware**, because `Message` carries no sender (Background, "What is
    actually enforced"). So `receives` stays one flat union of `Public | Internal` and the map answers only
    "does this plugin handle this event at all". Say that in the doc comment, so nobody later reads a
    passing check as "this sender was allowed".

19. ~~**`defineSystem` gets the same split, in this goal.**~~ **Trimmed out.** The goal was cut back to the
    plugin half (one declaration, `pluginAccepts()`, instead of a two-parameter split on both sides), so the
    system-side leak stays and is recorded under Deferred. The design below is kept as written for whoever
    picks that up. Leaving it collapsed would ship the exact
    asymmetry this goal exists to remove — and it is where the leak actually is today, since plugins have
    no declaration to leak from yet. `defineSystem<Public, Internal, Outgoing, Context>()`:

    ```ts
    types.events = Public | Internal | SystemEvents   // the machine, unchanged
    typeOf       = safeEvents<Public | Internal | SystemEvents>()
    _incoming    = Public                             // the facade's PackSystemEvents
    _internal    = Internal                           // never published
    ```

    The union stays where the machine needs it; only the published half narrows. As on the plugin side, a
    pack's sends to its **own** systems keep `Public | Internal`, so nothing that compiles today stops
    compiling — only `deps/<id>.d.ts` gets smaller.

    Two call sites: `features/logs/be/system.ts:40` and `features/database/be/system.ts:58` are the only
    specs that union an `*Internal*` type into the incoming slot. `ADD_LOG` leaving the fixture's facade is
    the check that it worked.

## Open decisions (settle with the user before Phase 6)

1. **Whether to build a declared read channel at all.** The residue is the reads that are genuinely another
   plugin's live state. It is already much smaller than when this goal was written — 16 edges, not ~27,
   since `goal-settings-to-host` took all 9 settings edges with it — and its shape changed:

   ```
   extensions → threads 6,  flows 4,  notes 2          (12)
   flows → brain,  brain → flows,  code → prompts,  code → actions   (4)
   ```

   **Three quarters of it is `src/extensions/**`, not features.** That matters for the choice: extension
   components are host-rendered outside any `PluginScope`, which is the reason `pluginHandle` exists at all.
   A read channel for them is not a cross-pack API question, it is a "how does a component with no plugin
   scope read a plugin" question — and `PluginScope` already answers it for the rendering case.

   - **Leave `fe/public.ts` selectors as they are.** No new manifest or codegen surface. Cross-pack reads
     stay impossible; no pack needs them today, and the fixtures do none. — *open*
   - **Add a declared `publishes()` view**, read by codegen like the plugin inbox, with a narrow view type
     in the facade. Types cross packs; entity-list internals (`page`, `loadingMore`) stop leaking because
     the declaration is narrow. Costs new manifest/codegen surface and a second facade export. — *open*
   - **Give the extension case its own answer** and leave the 4 feature→feature edges alone: the extensions
     are the volume, and `PluginScope` or a scoped read may cover them without a published contract. — *open*

   Phase 1's facade probe informs the second: if a declared view type cannot pass `facadeProblems` without
   bloating the facade, it is intra-pack only and worth much less.

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

### Phase 2 — A feature's own settings: verify, don't build

**This work landed in `goal-settings-to-host.md` (merged, `bec339ea7`). Build nothing here.** The phase
exists so its absence is a checked fact rather than an assumption, and so the one residue is recorded
(Decision 8).

Verify, in one pass:

- `git grep usePluginSettings` and `currentPluginSettings` find no pack API — the only hit is an unrelated
  local `computed` in `packages/renderer/src/views/settings/canvas/tabs/PluginsTab.vue`.
- `features/browser/fe/state.ts` handles `FEATURE_SETTINGS_UPDATED` and reads `context.settings` (`:323`).
- `packages/default-setup/src/features/settings/` does not exist; `packages/abuddy-host/src/features/settings/` does.

Then record, without fixing: `FeatureSettingsUpdated.settings` is still `unknown`
(`abuddy-sdk/src/events/index.ts:30`), so each feature casts the event
(`browser/fe/state.ts:314`). That is `goal-settings-to-host`'s Decision 7, unlanded, and belongs to that
goal — note it in the Outcome's "Open items" and move on.

**Done when:** the three checks above hold, and the residue is in the Outcome. No source file changes in
this phase; if one seems necessary, the base is not what this doc was surveyed at — stop and say so.

### Phase 3 — The plugin inbox, and `sendsTo` deleted

The root change. After Phase 1.

- `definePlugin()` and `pluginAccepts<Accepts>()` in `packages/abuddy-sdk/src/fe/plugin.ts`. As built, the
  declaration is a named `accepts` export beside the plugin rather than a type parameter on `definePlugin`,
  so codegen reads it with a **type-only** import and the plugin's machine and `.vue` graph never enter the
  event types. The two audiences fall out of declared-vs-derived instead of `Public`/`Internal`: what the
  feature's own system sends is added by codegen and stays out of `PackPluginEvents`.
- ~~`defineSystem<Public, Internal, Outgoing, Context>()`~~ — trimmed with Decision 19; see Deferred.
- Rewrite **all 14 plugin entries** out of the `const x: PluginDefinition = {…}` annotation form into
  `definePlugin(…)` (Decision 12) — 11 in `packages/default-setup/src/features/*/fe/plugin.ts`, 3 in
  `tests/fixtures/*/src/features/*/fe/plugin.ts`. Only the ones other plugins send to take type
  arguments; the rest change shape alone. Update `abuddy add feature`'s scaffold
  (`packages/abuddy-cli/src/commands/add/feature.ts`) and `docs/public-facing/features.md`, which emit the
  annotation form today.
- `generate-entries.ts`: read the declaration the way `sentEventTypes` reads a system spec; delete
  `receivedEventTypes` and the `sendsTo` target loop; emit `PackPluginEvents`; drop the `Pick<>` from
  `QualifiedPluginEvents` (Decision 3); swap `SendablePluginEvents` for `PackPluginEvents` in
  `generatePackTypes()` (Decision 4).
- `manifest-schema.ts`: delete `sendsTo` from `SystemSchema` and its `superRefine` checks; regenerate
  `abuddy.schema.json` (`npm run generate:schema -w @abuddy/sdk`). No format bump (Decision 15).
- Remove `sendsTo` from its **four** users and declare the inbox on the plugins that needed one. Two of the
  four target host plugins, so the `hostTargets` branch is live code:
  ```
  default-setup  threads → host/application      (HOST_PLUGIN_EVENT_TYPES['host/application'])
  default-setup  code    → host/settings         (CLI_TEST_RESULT — must keep working, Decision 14)
  default-setup  actions → flows
  external-pack  memos   → default-setup/logs
  ```
- `sendsTo` reaches 26 files; all of these change in this phase (Decision 16's "10 minutes" applies to each,
  but none may be missed):
  - SDK source: `src/events/index.ts`, `src/framework/define-system.ts`, `src/framework/pack-registration.ts`,
    `src/build/generate-entries.ts`, `src/build/manifest-schema.ts`
  - host: `src/features/registration.ts`
  - specs: `abuddy-sdk/tests/build/manifest-schema.spec.ts`, `abuddy-sdk/tests/build/generate-entries.spec.ts`,
    `default-setup/tests/unit/typed-event-channels.spec.ts`, `default-setup/tests/unit/code-cli-test.spec.ts`,
    `abuddy-cli/tests/build/facade-typing.spec.ts`, `abuddy-cli/tests/build/dependency-graph.spec.ts`
  - pack sources: `default-setup/src/features/actions/be/system.ts`,
    `default-setup/src/features/code/be/system.ts`,
    `tests/fixtures/external-pack/src/features/memos/be/system.ts`
  - manifests: `default-setup/abuddy.json`, `tests/fixtures/external-pack/abuddy.json`,
    `abuddy-sdk/abuddy.schema.json`
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
acceptance test).

Only the declared half crosses: a dependent's `PackPluginEvents` carries what `pluginAccepts()` declared and
not what a feature's own system sends its own plugin. (The system side keeps both in one phantom — see
Deferred.) Mutations: narrowing a plugin's declared inbox makes a send that was valid fail to compile;
exporting `accepts` as a type rather than a value is passed over instead of emitting `typeof` on it; an
`accepts` that declares no events fails the build naming the annotation that drops them.

### Phase 4 — `broadcastToPlugin`, and the renderer send

After Phase 3.

A find-and-replace plus a compile (Decision 16) — ~534 occurrences, mechanical. The only part that needs
thought is the facade consequence and the new renderer branch.

- Rename the backend send to `broadcastToPlugin` (Decision 5): `packages/abuddy-sdk/src/events/index.ts`,
  `defineEvents`, `HostServices` (`src/services/index.ts:38`, and the `emitter` implementation at :59),
  the generated `events.ts`, and every backend caller — 409 in `packages/default-setup`, 30 in
  `packages/abuddy-host`, 31 in `packages/abuddy-cli`, 5 in `packages/api`, plus the fixtures and
  `tests/e2e/plugin-sends.spec.ts`.
- Add the renderer `broadcastToPlugin`, delivering to `boundFeHost().application.system.get(ref)` and reusing the
  shell's not-yet-loaded policy (Decision 6).
- Carry the inbox to the frontend so that send can be checked (Decision 18): add `receives` to
  `PackFEFeature` (`packages/abuddy-sdk/src/fe/pack-fe-registration.ts`), emit it from
  `generateFrontendEntry()` into `pack-entry-fe.ts`, build the map in `createFePackRegistry()`
  (`packages/abuddy-host/src/fe/pack-store.ts`), and have the renderer send report and drop a miss the way
  `bus/machine.ts` does — same `diagnostic` severity, never a throw. The host's own two plugins already
  have their `receives` (`features/registration.ts`), so they fill it without new work.
- Type `navigateToPlugin`'s event parameter from the same inbox in `#generated/fe` (Decision 17), and
  leave `openPlugin`'s as `PluginEvent`. Check the ~22 `@/__generated__/fe` call sites still compile:
  a payload that was accepted as an open `PluginEvent` and isn't in the target's inbox now fails, which
  is the point.
- Document the delivery scopes on both functions and in `packages/abuddy-sdk`'s docs (Decision 7).

**Done when:** `npm run typecheck`; `npm run api:update` in `packages/abuddy-sdk` and
`npm run facade:update -w @app/default-setup`, both with their `etc/` committed — `Services` is a facade
export, so the rename moves `etc/build.api.md` and every `deps/<id>.d.ts` (Decision 16);
`npm run test:unit` and `npm test` (E2E) pass; a spec pins that a backend send reaches every window and a
renderer send reaches only its own (two windows in one E2E, or the shell fakes in
`packages/abuddy-host/tests/fe/shell/`); a spec pins that a renderer send of an event outside the target's
`receives` is dropped and reported at `diagnostic`, as the bus does (Decision 18), and that
`getRegisteredPlugins()` carries `receives` for a pack's plugins and the host's. Mutations: routing the
renderer send through the bus fails the scope spec; dropping `receives` from `pack-entry-fe.ts` fails the
validation spec.

### Phase 5 — Migrate `fe/public.ts`, drop the handle

After Phase 4.

- Replace the six sender wrappers and their `Extract<>` unions with the receiving plugins' declarations
  (Decision 9): `selectArtifact`, `approveTodoList`, `rejectTodoList`, `sendToActionsPlugin`,
  `sendToPromptsPlugin`, `selectFlow`, and their ~6 call sites.
- Delete each `pluginHandle` whose feature no longer needs one, with its `entry: ({ self }) => …bind(self)`.
  `library/fe/public.ts` exports only the handle and should disappear entirely.
- Delete `packages/default-setup/src/features/plugin-handle.ts` when nothing binds it (Decision 10).

This phase is **scope-neutral**: `pluginHandle` is module state in a per-window renderer, so it was
already window-local, and the renderer `broadcastToPlugin` delivers to the same actor it did. No migrated
sender changes which window it affects.

**Done when:** `npm run typecheck`, `npm test -w @app/default-setup`, `npm test` (E2E) pass;
`npm run check:specifiers` still reports `fe/public.ts` as the only cross-feature door; `git grep
pluginHandle` returns nothing, or the Outcome records what still binds one.

### Phase 6 — Re-measure the reads, then decide (Open decision 1)

- Recount the cross-feature and extension consumers of each `fe/public.ts` after Phase 5, and put the table
  in this doc beside the Background's 16-edge count, so the change Phases 3–5 made is visible.
- Settle Open decision 1 with the user. Implement only what is chosen.

**Done when:** the table is in the doc and Open decision 1 has moved into Decisions.

## Outcome (2026-09-23)

Landed on `AS/plugin-inbox` in seven commits. The thesis holds: a plugin declares what others may send it,
`sendsTo` is gone from the manifest, the schema, 26 files and the docs, and `plugin-handle.ts` with its
seven handles, seven binds and six sender wrappers is deleted. The full chain is green — `typecheck`,
`test:unit`, `build`, `test:external-pack`, E2E.

Two of the goal's decisions were trimmed while it was open (18 and 19, below), and one shipped in a shape
the doc didn't anticipate and is better than what it asked for. The work also produced a finding that
`goal-plugin-contract.md` exists to act on.

### Per phase

| Phase | Status | Evidence |
|---|---|---|
| 1 — probes | absorbed | The facade question was answered by doing it (`PackPluginEvents` crosses); the renderer-delivery question by `_sendToLocalPlugin` |
| 2 — own settings | verified, not built | `goal-settings-to-host.md` had done it; `usePluginSettings`/`currentPluginSettings` no longer exist, `browser` reads `context.settings` (`state.ts:323`) |
| 3 — the inbox, `sendsTo` deleted | done | `5ab558898`; `git grep sendsTo` finds nothing outside the archive |
| 4 — the two sends | done | `7bb76426f`, `eb57a9e69`; `broadcastToPlugin` (bus, every window) / `sendToPlugin` (renderer, this window) |
| 5 — migrate `fe/public.ts`, drop the handle | done | `3b793b5a4`, `7bb76426f`; `public.ts` is selectors only |
| 6 — re-measure the reads | done | 14 edges remain, 10 of them `src/extensions/**`; carried to the new goal |

### Corrections to the Decisions

**Decision 1 shipped as one tier declared, one derived — not `<Public, Internal>`.** The split the doc wanted
two type parameters for falls out of *declared vs derived*: `OwnPluginEvents` is the feature's own system's
outgoing union unioned with what the plugin declares, and the facade carries the declared half alone. Simpler,
same separation, no new vocabulary.

**Decision 12 is moot in that shape.** The `satisfies`-versus-annotation trap belonged to reading a type off
the plugin's default export. The declaration is a named `accepts` export from a no-argument call, so there is
no call argument to check — which is also why it resolves at all (see below).

**The declaration could not live on `definePlugin`.** Reading `definePlugin<E>({…})`'s type makes TypeScript
check its argument, which holds the machine, which imports `#generated/events`, which imports the plugin: a
cycle, and codegen sees `any`. `pluginAccepts<E>()` takes no arguments, so its type resolves from its own
declaration — the same reason `defineSystem<…>()` works. This is recorded because it looks like gratuitous
indirection and is not.

**Decision 17 landed late (`da6a45e91`) and cost more than the doc knew.** Typing `navigateToPlugin` from the
target's inbox surfaced 17 cross-feature UI commands that nothing declared — `terminal.CREATE`, `NOTE.OPEN`,
`TAB.CREATE`, `NODE.DOUBLE_CLICK` and the rest. Each had to be declared, and since the only declared tier is
the published one, **all 17 now reach every dependent pack's facade**
(`deps/default-setup.d.ts:3812`, `:3829`). That is the finding: the model needs a *pack* audience between
"my own system" and "anyone", and `goal-plugin-contract.md` adds it.

### Open items

- **Decision 6 — the renderer send does not wait.** `_sendToLocalPlugin` throws when no plugin runs at the
  ref instead of reusing the shell's `pendingOpens` policy. Intra-pack this matches what `pluginHandle.get()`
  did, so nothing regressed; cross-pack it is a hole. Carried to the new goal.
- **Decision 18 — no runtime check on the renderer send.** `PackFEFeature` gained no `receives`. Deliberately
  cut: `Message` carries no sender, so the check can never be audience-aware, and types cover every in-repo
  case. Carried as a deferral with its reopen trigger.
- **Decision 19 — `defineSystem` still collapses its audiences.** A declared-internal system event still
  reaches a dependent's facade (`ADD_LOG`). Struck from this goal by `94b10d0e6`; carried as a deferral.
- **Decision 7 is half-pinned.** The delivery-scope difference is in the SDK doc comments and the public docs,
  and a spec covers the renderer send. Nothing pins that a backend send reaches *every* window — the half that
  produced `OPEN_PLUGIN_FROM_APP`.
- **Open decision 1 (the read channel) is answered, not declined.** The count that was meant to settle it —
  14 edges, 10 of them extensions — was read as "no demand". It is the opposite: `fe/public.ts` is the demand,
  and an external pack reading a plugin's state is a first-class need with no mechanism. The new goal builds it.

### Final verification

`npm run typecheck`, `npm run schema:check`, `api:check` (sdk, ui), `facade:check -w @app/default-setup`,
`npm run test:unit` (7 suites), `npm run build`, `npm run test:external-pack` (28), `npm test` (21 E2E).

## Deferred

- A frontend **data** channel for entity lists (`useNotes`, `useActionsList`, `usePromptsList`). These are
  EARS rows cached per plugin; the backend solved the equivalent with repositories and the renderer holds no
  EARS data. Out of scope, and not to be approximated by widening the read channel.
- Pack frontend isolation from `window.electronAPI`, the host API client and the app DOM —
  `docs/goals/deferred/goal-pack-frontend-isolation.md`.
- **The system side's two audiences.** `defineSystem<Incoming | Internal, Outgoing>()` puts both in one
  phantom (`_incoming`), so a system's internal events reach every dependent pack's facade: `ADD_LOG`, one of
  `LogsInternalEvents`, is in `tests/fixtures/external-pack/src/__generated__/deps/default-setup.d.ts`.
  Splitting it is two call sites (`features/logs/be/system.ts`, `features/database/be/system.ts`) plus an
  `_internal` phantom, and was trimmed out of this goal with the rest of the `Public`/`Internal` design. The
  plugin side has no such leak: `PackPluginEvents` carries only the declared half.
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
