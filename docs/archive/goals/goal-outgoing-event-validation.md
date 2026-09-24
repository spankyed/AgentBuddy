> **Done** (2026-09-18) on `AS/outgoing-event-validation`, `5ec2d849f`…`f919b197c`. Phases 1–4 landed.
> Phase 5 was not started: Open decision 1 was never settled, so the payload half stays open — see the
> Outcome, which says what the types still lie about.

> **Written in session** `34470405-e643-41fb-8244-6a561a0963c5` (Claude Code, 2026-09-18). Resume it with `claude -r 34470405-e643-41fb-8244-6a561a0963c5`.

```
# Goal: an event a system sends to a plugin is checked, the way an event a client sends to a system is

Implement docs/goals/goal-outgoing-event-validation.md on a branch cut from master. Read Background,
Decisions, Open decisions, Phases and Constraints first. Decisions are final: implement them, don't
reopen them or stop to ask. The Open decision must be settled with the user before Phase 5; if it is
still marked open, stop and ask, and finish Phases 1–4 without it. Where another detail isn't
specified, pick the conventional option, note it in the final summary, and keep going. No backward
compatibility in code: change signatures, move modules, migrate every in-repo caller, test, fixture,
template and doc in the same change, and fix forward.

Finished when:
- Phases 1–4 are implemented and each meets its "Done when"; every new guard, helper or test is
  mutation-checked.
- A system that sends a plugin an event type it does not declare is reported as a SYSTEM_ERROR and the
  event is dropped, named with the system, the plugin and the type.
- The declared types are runtime data generated from the manifest, not a list maintained by hand, and a
  pack that adds an event to a plugin gets it by rebuilding.
- `npm run typecheck`; `npm test -w @abuddy/host`; `npm test -w @abuddy/sdk`; `npm test -w @abuddy/cli`;
  `npm test -w @app/default-setup`; `npm run test:external-pack`.
```

## Background

The app checks events **into** systems and nothing checks events **out** to plugins.

Incoming: the API's `bus.send` delegates to `receiveClientEvent` (`@abuddy/host/bus/client-events.ts`),
which looks the event's `systemId` up in `registry.getEventValidationMap()` and throws
`UnknownClientEventError` when the type isn't one that system accepts. The map is built in
`pack-registration.ts`'s `buildEventValidationMap()` from what each registered system declares.

Outgoing: `emit(pluginId, event)` and `broadcastToPlugin` go to the bus as `OUTGOING` and straight to the
client sink. Nothing looks at them. A system can send a plugin an event the plugin has no case for, an
event type that was renamed, or an event whose payload is missing fields the receiving machine assumes.

### What made this worth writing down

`packages/default-setup`'s notes plugin. `NOTES_CONNECTED` carries `{ notes, settings }`, and the
system builds it from its repositories:

```ts
const settings = repository.settingsQueries.getPluginSettings('notes');
system.get(bus).send(emit(notes, { type: 'NOTES_CONNECTED', data: { ...connectedData, settings } }));
```

`getPluginSettings` returns `undefined` until the Settings row has an entry for the plugin. The frontend
machine's `setPluginData` assigned the payload straight over a **complete** initial context, so on a
fresh data dir it wrote `undefined` over `settings: { tasklistPanelPosition: 'left', showCollapseIcon:
false }`, and the next read threw: `panel.vue`'s `s.context.settings.showCollapseIcon` and `canvas.vue`'s
`notes.value.filter`. Both showed up as console errors in `test:packaged-authoring`'s E2E while its tests
passed. Fixed at the receiver in `707a3c6f9`; the sender still sends `undefined`.

The deepest part is that `typeOf('NOTES_CONNECTED', event)` narrows the event, so TypeScript asserts
`ev.data.settings` is present. **The types say this cannot happen and at runtime it does.**

### The correction that shapes this goal

Validating outgoing events against their declared types **would not have caught that bug**, and the goal
should not be sold as if it would. Two facts, both checked:

- `buildEventValidationMap()` produces `Map<string, Set<string>>` — event **type names**, nothing about
  payloads. An outgoing equivalent built the same way checks that `NOTES_CONNECTED` is a type the notes
  system declares. It says nothing about `settings` being absent.
- Outgoing events exist only as types. `packages/default-setup/src/__generated__/events.ts` declares
  `OwnPackEvents` and `PackEvents` and calls `defineEvents<PackEvents, SendableSystemEvents>(systemIds)`
  — only `systemIds` survives to runtime. There is no runtime list of what a plugin receives.

So this goal closes the **type-name** half of the asymmetry, which is a real class on its own: an event
renamed on one side, a typo, a send to a plugin whose pack never declared it, a contract entry removed
while a sender still uses it. Today every one of those is silent. The payload half — the half the notes
bug lives in — is the Open decision below.

### Scale

The shape that bit in notes is common: an assign writing an event payload straight into context. A count
over `packages/default-setup/src` put it at about 60 sites across seven features (actions, code,
database, library, flows, notes, prompts), and `flow-canvas.vue`'s `s.context.graph.nodes` reads have the
same exposure. Don't audit them by hand: that is a lot of churn for unknown yield, and the point of this
goal is to make the class safe rather than to visit its members.

## Decisions

- **Validate where the bus handles `OUTGOING`**, not inside `emit`/`broadcastToPlugin`. That is the one place
  every send passes through, whether it came from a system's action or from `services.emitter`, and it
  mirrors `receiveClientEvent` sitting at the other boundary rather than inside each caller.
- **Report and drop; never throw.** `receiveClientEvent` throws because it answers an API call. Here the
  caller is a running system, and throwing inside its action takes the system down over a malformed
  message. Report through `reportError` as a `SYSTEM_ERROR` naming the system, the plugin and the type,
  and drop the event. This is loud where it matters: `takeSystemErrors` fails any pack test that leaves a
  system error, so a bad send fails the suite while a production app keeps running.
- **The declared types are generated, not hand-maintained.** `generate-entries` already computes the
  plugin → event-type map at the type level for `PackEvents`; it emits the same thing as runtime data.
  A hand-kept list is a second place to forget, and this repo has just spent a branch removing that shape.
- **A pack that declares nothing for a plugin sends nothing to it.** That is already the rule the
  `sendsTo` gating enforces at build time (`cb749590f`): only the pack that owns a plugin declares what it
  receives. This makes the same rule true at runtime.
- **Host plugins are covered too.** `HOST_PLUGIN_IDS` (`application`) and `HostPluginEvents` declare what
  the app's own plugins receive; they get an entry in the map like any pack's.

## Open decisions

1. **Do outgoing events get runtime payload schemas?** Type-name validation leaves the notes class open:
   a declared type with a missing field passes. Closing it means events carry a runtime schema — zod is
   already an SDK peer and already bridged to packs — so `defineSystem`'s event declarations, or the
   generated events map, hold something checkable rather than an erased type. That is a large change:
   every system's event declarations, the generated facade, the harness, and a decision about what a
   schema failure does (the same report-and-drop, presumably). It also buys the thing the types currently
   lie about. **Settle before Phase 5.** If the answer is no, Phases 1–4 still stand on their own and
   this doc should say the payload half stays open rather than pretend the asymmetry is closed.

## Phases

### Phase 1 — the declared types as runtime data
- `generate-entries` emits, beside `PackEvents`, a runtime map of plugin id → the event type names that
  plugin receives, for the pack's own plugins and for every `sendsTo` target it is allowed to reach.
- It goes into the pack's registration (`PackRegistration`), the way `systems[].events` carries the
  incoming set today.
- **Done when:** a rebuilt `packages/default-setup` exports the map; its entries match the `PackEvents`
  type for the same plugins; a spec in `abuddy-sdk/tests/build/generate-entries.spec.ts` covers a pack
  with an own plugin, a `sendsTo` target and a plugin nobody sends to. Mutation: dropping a `sendsTo`
  target from the manifest removes its entry.

### Phase 2 — the registry side
- `createPackRegistry()` gains the outgoing equivalent of `getEventValidationMap()`, built from the
  registrations and from `HostPluginEvents` for host plugins, cached and dropped on register/unregister
  exactly as the incoming map is.
- **Done when:** `abuddy-host/tests/packs/event-validation-map.spec.ts` (or a sibling) covers both maps;
  registering and unregistering a pack adds and removes its plugins' entries. Mutation: not dropping the
  cache on unregister fails a spec.

### Phase 3 — the check
- The bus checks `OUTGOING` against that map and, on a miss, reports a `SYSTEM_ERROR` naming the system,
  the plugin and the type, and drops the event.
- An event for a plugin the map has no entry for is a miss, not a pass: that is the case the notes bug's
  neighbours live in.
- **Done when:** `abuddy-host/tests/bus/` covers a good send delivered, a bad type reported and dropped,
  and an unknown plugin reported and dropped; a pack test that makes a bad send fails through
  `takeSystemErrors` without any assertion of its own. Mutation: skipping the check delivers the bad
  event and the spec fails.

### Phase 4 — the repo's own sends
- Run the suites and fix what the check finds. Expect a handful: this is the first time these sends have
  been looked at.
- Anything it turns up that is a real contract gap (a system sending an event its pack never declared)
  is fixed by declaring it, not by widening the map.
- **Done when:** `npm run test:unit` and `test:external-pack` pass with the check on, and every fix is a
  declaration or a corrected send, none a suppression.

### Phase 5 — payload schemas (only if Open decision 1 says yes)
- Scope to be written once that decision is made. It touches `defineSystem`, the generated events, every
  system's declarations and the harness, and it is the half that would have caught the notes bug.

## Outcome (2026-09-18)

Phases 1–4 landed. Phase 5 did not: Open decision 1 (runtime payload schemas) was never answered, so
type-name validation is all this closes and a declared event with a missing field still passes. That is
the asymmetry the doc asked not to paper over, and it is recorded here rather than left implied.

Most of the work is not in the phases. Reviewing the finished branch found five defects in the check
itself, three of them user-visible, and chasing one of those through the running app found a bug in pack
registration that had nothing to do with events. The phases were the cheap part.

### Per phase
| Phase | Status | Evidence |
|---|---|---|
| 1 — declared types as runtime data | done | `receivedEventTypes` in `#generated/events`, read by `eventTypesOf`; `abuddy-sdk/tests/build/generate-entries.spec.ts` |
| 2 — the registry side | done | `getPluginEventValidationMap()`; `abuddy-host/tests/packs/event-validation-map.spec.ts` |
| 3 — the check | done | `bus/machine.ts` reports and drops; `abuddy-host/tests/bus/outgoing-events.spec.ts` |
| 4 — the repo's own sends | done | `CLIENT_CONNECTED` on `application` and the host `packs` plugin were real contract gaps, both closed by declaring |
| 5 — payload schemas | **not started** | Open decision 1 unsettled |

### What the review found after the phases were "done"
| Defect | Fix |
|---|---|
| Every send from the host `packs` system was dropped — the Packs view stopped updating | `registerHostPlugin` + `PACKS_PLUGIN_EVENT_TYPES`, pinned to the union by a compile-time check (`503cd2cd9`) |
| Any pack could widen any plugin's accepted events, the host's included | ownership is explicit and the map never overwrites a claimed id (`503cd2cd9`) |
| A pack built before `receivedEventTypes` had every send dropped | its plugins map to `null` — known, nothing to check against — so its sends pass (`503cd2cd9`) |
| A dropped send could not distinguish "unknown plugin" from "pack mid-update" | `markPackReplacing`, using `teardownPack`'s existing `replacing` flag (`29c6a5222`) |
| Reporting a drop produced another droppable send, unbounded | reported once per `(plugin, type)`; the cycle runs through the actor's queue, not the call stack (`50fd094b7`) |
| A drop raised "Something went wrong" at the person using the app | new `diagnostic` severity: logged and recorded, no toast (`4311bf8ef`) |
| `_meta`, the plugin-visibility key, was treated as a plugin id | excluded, as `checkFeatureSettings` already did (`729727a1e`) |
| A drop in an E2E run failed nothing | the fixture fails the test that produced one (`f919b197c`) |

### Corrections to the Decisions
- **Cross-pack widening was fixed by non-override, not by refusing the pack.** Throwing at registration
  broke `pack-settings-defaults.spec.ts`, which documents that a pack feature may share an id with
  another pack's plugin and that settings resolve in the app's favour. Refusing the pack outright is a
  product change this goal did not ask for; the first owner keeps the id instead.
- **Plugin ownership reads `features` *and* `receivedEventTypes`, not `features` alone.** A hand-written
  registration may name only one of the two. Non-override is what prevents widening; `features` is what
  lets a pack that declared no event types still be known to own its plugins.

### Open items
- **Phase 5 / Open decision 1.** Runtime payload schemas. Until then a declared event with a missing
  field passes, which is the class the notes bug belonged to.
- **`notes/fe/state.ts:723` assigns `settings` unguarded.** Upstream guards with `if (pluginSettings)`
  and no reaching path was found; noted, not claimed.
- **`secrets.spec.ts` E2E fails** reading a 2.6GB LMDB file in the test data dir. Environmental.

### Final verification
`npm run typecheck`, `npm run test:unit` (2,479), `npm run test:external-pack`, and the E2E suite at
12 passed / 1 failed — the failure being `secrets.spec.ts` above. The two reload E2E tests that failed
throughout went 60s and 15s timeouts to 2.1s and 163ms once the feedback loop was fixed.

## Deferred

- **The ~60 assign sites.** Making the boundary safe is the point; visiting each site is not. Once
  Phase 5 exists they are safe by construction, and until then the receiver-side guard used in
  `707a3c6f9` (`ev.data.x ?? context.x`) is the local fix when one bites.
- **The notes sender.** The notes system should always send `settings`, defaults included, rather than
  whatever `getPluginSettings` returns. That is a one-line fix in its own change, not a reason to hold
  this one.

## Constraints

**Never**: commit, stage or push without being asked; publish anything or trigger a workflow; open, copy
or modify a real user data dir (`~/Library/Application Support/abuddy*`); `pkill`/`killall` Electron or
node; run bare `tsc` in `packages/preload`; edit version or release metadata; add a
backward-compatibility shim or re-export; loosen a failing assertion instead of investigating it; leave a
new guard or helper without a mutation check.

**Also**: don't hand-maintain the map (Decision 3); don't throw on a bad send (Decision 2); don't widen
the map to make a failing send pass (Phase 4); don't claim the asymmetry is closed while Open decision 1
is unsettled (Background).
