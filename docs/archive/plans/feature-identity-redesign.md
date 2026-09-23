# Feature identity: a redesign from first principles

Surveyed 2026-09-21 at `ff80ea9ee` on `AS/designations-and-addressing`. A proposal, not a goal: the choices in
[Scope options](#scope-options) are open.

## Where the current design came from

The public docs said this from `160d437be` (2026-09-15) until `02d655f68`:

> A system's bus id is the feature id in a built-in pack, and `<packId>.<featureId>` in an external pack
> (`my-pack.bookmarks`). Plugin ids stay the feature id. Don't write bus ids by hand: `busId` from
> `#generated/bus-ids` maps each of your features that has a system to its bus id. […] Actions don't need
> it: they name a system `<packId>/<featureId>`.

That paragraph made four decisions:

1. **A routing id is a separate thing from a name.** A bus id had its own spelling (`.`), and authors wrote
   another (`/`), so something had to translate between them.
2. **Bare ids are privileged.** Built-in features and the host shared one unqualified namespace.
3. **Identity rides inside the payload.** A plugin id was just a feature id, and it travelled as
   `pluginId` on the event itself.
4. **Identity is a lookup table.** `busId` was a generated map, and code carried its results around.

The follow-up goal removed the first-class/second-class split: every pack is now addressed alike, and pack
code never holds an address. The shape of each decision is still in the code, though:

| Decision | What still carries it | Measured at `ff80ea9ee` |
|---|---|---|
| 1. Two spellings | `<pack>.<feature>` on the wire and in storage, `<pack>/<feature>` in code and actions, and a bare name as a third form. `resolveName` tells them apart by punctuation. Five helpers exist for one concept (`qualifiedId`, `addressOf`, `parseAddress`, `resolveName`, `asHostAddress`), plus the `FeatureAddress` brand to keep the forms apart. | 46 `resolveName` calls, 10 `parseAddress` calls, 68 `default-setup.<feature>` literals in code and tests |
| 2. Bare ids are privileged | The host's ids (`application`, `packs`, `bus`) are bare, so a bare name means either "my feature" or "the host's". `resolveName` needs a `hostIds` list, and a pack feature named `application` is shadowed. | 27 `HOST_PLUGIN_IDS`/`hostIds` references |
| 3. Identity in the payload | `emit`/`broadcastToPlugin` spread `pluginId` into the event, and `sendToSystem` spreads `systemId`. The root CLAUDE.md has to warn: "never use `pluginId` as a field name". | 56 `pluginId` references in the bus, the renderer and the events module; 76 `systemId` references |
| 4. Identity as a table | A feature's identity is spread over `systems[]`, `features[]`, `receivedEventTypes`, `boot.earlySystem`, and on the frontend `plugins`, `defaultPlugin` and `designations`; the registry reassembles it (review finding F7, deferred). Stored settings are keyed by the routing string, with the reserved `_meta` key in the same map. | 7 registration fields; 60 `_meta` references |

Two bugs fixed this week are these decisions leaking out:
- The logs `earlySystem` was never addressed (`f6f8aa08b`). A fifth place held identity, and nothing
  addressed it.
- Upgrade data loss in the 0.3.15 settings move (`bbf2d91b9`). Stored data was keyed by a routing format,
  so changing the format meant rewriting user data.

## Measured gaps

Two holes the typed generated API doesn't cover. Each exists because one function serves two kinds of caller.

**1. Frontend lookups accept any string.** Sends are checked: `sendToSystem('notez', …)` fails to compile. The
frontend lookups aren't. `navigateToPlugin('default-setp/notes')`, `navigateToPlugin('whatever.anything')` and
`actorOf('default-setp/notes')` all compile, because `PluginName` includes `${string}/${string}` and
`${string}.${string}`, and fail only at runtime. The escape hatches are there for code whose target arrives as
data: `LinkBlock`'s `target` from block data, the Settings plugin list's registered ids, and settings'
`PLUGIN.SELECT`. To accept those, the function gave up checking for code that knows its target.

**2. System-to-system sends take two paths, and the common one is untyped.** Backend code reaches another
system with `actorOf(system, 'brain').send(ev)`, 24 times in default-setup.
- **Every use is a `.send()`.** None reads a snapshot or subscribes, so nobody needs the actor itself.
- **The send is unchecked.** `actorOf` returns an `AnyActorRef`, so `.send` accepts any object. Example: settings sends
  threads `BIRTH_FLOW_START`, which threads declares as an *internal* event (`ThreadsInternalEvents`), and
  nothing checks that line.
- **`system` has to be threaded through by hand.** The frontend binds its application actor (`bindFeHost`), so
  `actorAt(address)` takes no actor system. The backend never bound its running bus into `HostRuntime`, so
  every backend lookup passes the `system` an action receives. That breaks the repo's "bind resources" rule:
  the running bus is a per-app resource, exactly like the frontend's application actor.
- **The typed alternative pretends to be a client.** `sendToSystem` exists, but on the backend it travels the
  client path: it's logged as `→ Incoming`, checked as a client event, and gets `systemId` spread into the
  payload. So backend code avoids it.

| Path | Typed | Shape |
|---|---|---|
| `sendToSystem('brain', ev)` | yes | pretends to be a client event |
| `actorOf(system, 'brain').send(ev)` | no | direct, but needs `system` and hands out the actor |

## Principles

1. **One identity, one spelling, everywhere.** Code, the wire, storage, logs, actions and the UI all spell a
   feature the same way. Resolving a name only turns *relative* into *absolute*; it never translates one
   format into another.
2. **No privileged namespace.** The host is a pack, so every feature is `<pack>/<feature>`.
3. **Addressing is an envelope.** Where a message goes is never a field of the message.
4. **A feature is the unit.** One registration entry per feature; the registry derives everything else.
5. **Stored data is keyed by identity, not by routing.** Anything persisted uses the same spelling as
   everything else, so no future transport change touches user data.

## Target design

### T1. `<pack>/<feature>` is the only spelling

```ts
// @abuddy/sdk/ids — the whole module
export type FeatureRef = `${string}/${string}` & { readonly [ref]: true };

/** A name pack code writes → its feature. A bare name is the writing pack's own feature. */
export function resolveName(name: string, packId: string): FeatureRef {
  return (name.includes('/') ? name : `${packId}/${name}`) as FeatureRef;
}
export function splitRef(ref: FeatureRef): { packId: string; featureId: string } { … }
```

- The bus, xstate system ids, plugin actor ids, settings keys, `_meta.visibility`, `lastActivePlugin`,
  `localStorage` and log sources all use `default-setup/threads`.
- `addressOf`, `qualifiedId`, `parseAddress` and `asHostAddress` go away. So does `NameContext`, because the
  resolver needs only the pack id.
- A `FeatureRef` stays branded: a resolved ref versus a name some code wrote is the one distinction still
  worth a type.
- `/`, because everything a person writes or reads already uses it: dependency names in pack code, docs,
  error messages, and the stored action source (54 `services.emitter` calls, all `'default-setup/<feature>'`).
  So the follow-up goal's Decision 4 ("don't rewrite stored action source") holds by construction, and any
  other separator would break it for nothing.

### T2. The host is the pack `host`

- `application`, `packs` and `bus` become `host/application`, `host/packs` and `host/bus`.
- `host` is a reserved pack id, and the manifest schema refuses it.
- `HOST_PLUGIN_IDS`, the `hostIds` parameter, and the "a host id shadows your feature" rule all go away. A
  bare name always means the writing pack's own feature. Pack code names the host's features like any
  dependency's: `'host/application'`.

### T3. The envelope carries the address

```ts
// before: identity spread into the payload
{ type: 'NOTE_SAVED', noteId, pluginId: 'default-setup.notes' }

// after: the transport's message; `event` is exactly what the sender wrote
{ to: 'default-setup/notes', side: 'plugin', event: { type: 'NOTE_SAVED', noteId } }
```

- `emit`, `broadcastToPlugin` and `sendToSystem` build envelopes, and the bus and the renderer route on `to` and
  `side`.
- A system's or plugin's machine only ever sees `event`. The CLAUDE.md warning goes away, because no field
  name is reserved any more.
- A feature's system and its plugin share one `FeatureRef`, and `side` says which one a message is for.
  Today they share an address by convention; this makes the pairing explicit.
- The wire format is never persisted, so this can land at any time without a migration.

### T4. One feature-keyed registration

```ts
interface PackRegistration {
  id: string;
  features: Record<string /* featureId */, {
    system?: { machine: AnyStateMachine; receives: readonly string[]; early?: true };
    plugin?: { receives: readonly string[] };   // the backend's knowledge of the FE side
    designation?: string;
    services?: Record<string, unknown>;
    settings?: FeatureSettings;
  }>;
  // pack-level: seeders, migrations, extensions, boot hooks, ears
}
```

- The registry derives refs, the validation maps, designations and plugin ownership from this one map.
- `systems[]`, `features[]`, `receivedEventTypes` and `boot.earlySystem` go away, so an early system is
  just a system with `early: true` and can't be missed.
- The frontend's `PackFERegistration.plugins` is already keyed by feature, so the two sides now match.
- The manifest redesign (`goal-manifest-redesign.md`, on `AS/external-pack-authoring`) makes `abuddy.json`
  feature-keyed too. The generated registration would then mirror the manifest one-to-one.

### T5. Settings keyed by the feature, and UI state owned by the host

- A feature's settings slice is keyed by its `FeatureRef`, the same spelling as everywhere else.
- `_meta` stops being a reserved key inside the plugins map. Sidebar visibility and the last-active plugin
  are the host shell's UI state, so they move to `host/application`.
  - Today default-setup's settings blob stores them for the renderer, and the renderer also keeps a copy in
    `localStorage`: two copies of one fact, owned by a pack that isn't the shell.
  - The Settings → Plugins tab still shows the toggles; it reads and writes through the application
    plugin.
- This is the most negotiable part. It removes a reserved key and a cross-owner write, but it moves data
  between owners, and that needs a migration. See [Scope options](#scope-options).

### T6. One typed system-to-system send

- `sendToSystem` is the one way to reach a system, whoever the sender is: a frontend plugin, a backend system,
  or pack code outside an action. With the envelope (T3), the bus routes a backend sender's message in-process
  as a system-to-system message, not as a client event.
- The backend `actorOf`, and the `ActorLookup` parameter with it, go away. A system send is checked against the
  receiving system's declared events, so a cross-system send of an internal event fails to compile. The
  receiving system then either declares that event as incoming or stops receiving it from outside.
- The host binds its running bus into `HostRuntime`, as the renderer binds its application actor. That makes
  a system send work outside an action too.
- Only the frontend keeps an actor lookup, because `useSelector` needs a real actor to read state from.
- Internal only, so it can land at any time.

### T7. Code-known targets and data-borne targets get separate doors

- Lookups by name (`navigateToPlugin`, the frontend's `actorOf`) take only the literal union of known names:
  own features, dependencies' `<pack>/<feature>`, and the host's. The `${string}` escape hatches go.
- A target that arrives as data goes through a runtime-checked door, which opens a registered plugin or
  reports that no such plugin exists: `openPlugin(ref: string)`, or `featureAt(ref)` with handles (see
  [Open questions](#open-questions)).
- About ten call sites pass data today: `LinkBlock`, the Settings plugin list, and settings' `PLUGIN.SELECT`.
- Internal only, so it can land at any time.

### T8. `usePlugin()` and explicitly shared state

- A component reaches its own plugin through `usePlugin()`, which the host provides when it renders the
  plugin's canvas and panel. The own-feature `actorOf(id)` lookups (about 55) and the `export const id`
  constants that exist to serve them go away.
- Reading another plugin's machine context goes away (about 15 reads, mostly settings). Settings get a read
  API (`useSettings(name)`), and each remaining cross-plugin read becomes explicitly shared state or an event.
- With T6 and T9, no pack code looks up an actor by name, so `actorOf`, `actorAt` and `useActorSystem` go.
  Of the 79 `useActorSystem()` calls today, 73 are declared and never used.

### T9. One send verb, and private child actors

- `system.get(bus).send(emit(…))` (193 uses) and `broadcastToPlugin` (189) are one delivery spelled two ways.
  They collapse, together with `sendToSystem` and `sendToBrainSystem` (a send to a role hard-coded for one
  role), into one typed send whose target is a feature's system, its plugin, or a role.
- A feature's child actors get no global `systemId`. Today the code plugin spawns `explorer`, `terminal`,
  `search`, `commit`, `pr`, `codeActions` and `codePrompts` into the renderer's shared actor system, a bare
  global namespace one level down, and other features reach in (`actorOf('code')?.system.get('codeActions')`).
  Other features send the feature its public events, and it routes them to its children internally.
- `getBus` and `sendParentSafe` have no uses and go.


These parts of the current design are right and carry over unchanged:
- Typed generated sends (`#generated/events`, `#generated/fe`), tightened by T6 and T7.
- A resolver that throws instead of guessing.
- Registries that validate instead of repairing.
- The brand on resolved identity.
- Feature-keyed frontend registration.
- The mutation-checked tests from the follow-up goal: most of them assert *behaviour*, such as "a
  settings change reaches the code system", and survive a spelling change with only their literals
  updated.

## Why now

Nothing on this branch has shipped:
- `package.json` is `0.3.14`, and the newest tag is `v0.3.14`.
- No 0.3.15 beta has been tagged.
- The branch is 680 commits ahead of `master`.

So the `.` spelling exists in no user's stored data yet. Only the unreleased 0.3.15 migrations write it,
and they can write `/` instead in the same change. Once 0.3.15 ships, changing the spelling means another
migration of every settings key, visibility entry and last-active id, the kind of move that just lost data
once.

The time-sensitive parts are the ones that touch storage: T1 (and T2, which changes stored host ids such as
a last-active `application`) and T5. T3, T4, T6 and T7 are internal, can land after the merge, and cost the same
whenever they're done.

## Scope options

Each option also delays a branch that is already 680 commits ahead of `master`; that risk grows with scope.

| Option | Before 0.3.15 ships | After the merge | Trade-off |
|---|---|---|---|
| A | T1 and T2 | T3, T4, T6, T7, and T5 or not | The smallest change to what's stored. Fixes the spelling while it's free; everything else is ordinary refactoring. `_meta` stays a reserved key. |
| B | T1, T2 and T5 | T3, T4, T6 and T7 | Also settles who owns the stored UI state, so 0.3.15's migration is the last one to touch these keys. Adds an owner move, and a migration spec for it, to the release. |
| C | T1–T7 | — | The whole model lands at once, and the generated code changes once instead of twice. It's the largest diff on an already-long branch, and the manifest redesign would ideally land first or together with it. |
| — | nothing | — | Keeps the current, working design. The `.`/`/` split and bare host ids become permanent, or cost a stored-data migration later. |

## Phases

Each phase can land on its own and has a mutation check.

1. **One spelling (T1).**
   - Change the resolver, codegen, the registries and the bus to `/`.
   - Retarget 0.3.15's moves (the host's and default-setup's) to write `<pack>/<feature>`.
   - *Done when* no `.` address is built or parsed anywhere (`git grep` for the five removed helpers finds
     nothing), and a migration spec takes 0.3.14 settings to `/` keys, run twice.
2. **The host is a pack (T2).**
   - Add the reserved `host` pack id; delete `HOST_PLUGIN_IDS` and `hostIds`.
   - The migration also moves a stored last-active `application` to `host/application`.
   - *Done when* a pack feature named `application` resolves to the pack's own feature, and the schema
     refuses a pack id of `host`.
3. **The envelope (T3).**
   - Transport messages carry `to` and `side`, and events arrive without `pluginId` or `systemId`.
   - *Done when* a spec sends an event with a `pluginId` field and it arrives intact, and the CLAUDE.md
     warning is gone.
4. **One feature-keyed registration (T4).** Resolves F7.
   - *Done when* `PackRegistration` has no `systems`, `receivedEventTypes` or `boot.earlySystem`, and a
     spec proves that an early system is validated at its ref.
5. **Settings and UI state (T5)**, if chosen.
   - Visibility and last-active move to `host/application`, and `_meta` is gone from the settings.
   - *Done when* a migration spec shows 0.3.14 visibility and last-active surviving, run twice.
6. **One system-to-system send (T6).**
   - Bind the backend bus into `HostRuntime`, route a backend `sendToSystem` in-process, and remove the
     backend `actorOf`.
   - *Done when* no backend code reaches another system through `system.get` or `actorOf`, and a spec shows
     that a system-to-system send of an event the receiver doesn't declare fails to compile.
7. **Separate doors for code and data (T7).**
   - Remove the `${string}` escape hatches from `PluginName`, and route the data-borne call sites through
     the runtime-checked door.
   - *Done when* `navigateToPlugin('default-setp/notes')` fails to compile (an `@ts-expect-error` spec), and
     a spec shows the data door refusing an unregistered ref.

## Open questions

### Generated handles, or strict strings

Codegen could emit a value per feature, typed with that feature's events, so pack code imports values
instead of writing strings:

```ts
// #generated/features.ts (sketch)
export const features = {
  notes: feature<NotesSystemEvents, NotesPluginEvents>('default-setup/notes', { system: true, plugin: true }),
  // …a feature without a system has no `.system` at all
};
export const deps = { defaultSetup: { threads: feature<…>('default-setup/threads', …) } };  // in a dependent pack
export const host = { application: feature<never, ApplicationEvents>('host/application', { plugin: true }) };
```

| Today | With handles |
|---|---|
| `sendToSystem('notes', { type: 'SAVE_NOTE', id })` | `features.notes.system.send({ type: 'SAVE_NOTE', id })` |
| `sendToSystem('default-setup/threads', ev)` | `deps.defaultSetup.threads.system.send(ev)` |
| `system.get(bus).send(emit('notes', ev))` | `system.get(bus).send(features.notes.plugin.emit(ev))` |
| `actorOf(system, 'brain').send(ev)` | `features.brain.system.send(ev)` (T6: no actor, no `system`) |
| `navigateToPlugin('settings', ev)` | `features.settings.plugin.open(ev)` |
| `actorOf('flows')` (frontend) | `features.flows.plugin.actor()` |
| a target from data | `featureAt(ref)?.plugin?.open(ev)`, checked at runtime |

What handles buy:
- **Pack code can't misspell a target**, because it passes no strings.
- **Capabilities show in the types.** `features.x.system` doesn't exist when there's no system, and autocomplete
  on `features.` lists exactly what exists.
- **The resolver leaves pack code.** Codegen bakes each ref in, and `resolveName` survives only where strings
  are unavoidable: stored actions (`services.emitter`) and data (`featureAt`).
- **The spelling (T1) becomes a codegen and storage concern**, invisible to pack source.
- **They fit the envelope (T3).** A handle's send builds `{ to, side, event }` directly.

What they cost:
- **Stored actions keep a string API.** Actions are text and can't import a handle, so `services.emitter`
  keeps taking `'<pack>/<feature>'`. That's true today too; handles make the split explicit.
- **A migration.** About 400 call sites (174 `sendToSystem(id`, 104 `sendToSystem('code'`, 64 `actorOf`, plus
  `emit` and `navigateToPlugin`). It's mechanical and codemod-able, but big.
- **A new idiom** for every pack author to learn.

Strict strings (T6 and T7 alone) close the same measured gaps with a much smaller change and keep strings
as the one form. The choice isn't about safety, since both are safe; it's whether pack code should see
identity strings at all.

### What settings exposes, and the fate of each cross-plugin read

T8 needs a decision per read: settings become `useSettings(name)` (which fields, and whether it's reactive
over `SETTINGS_UPDATED`), and each other read of another plugin's context becomes shared state that plugin
exposes, or an event it sends.

### Whether the renderer keeps a `localStorage` copy of the last-active plugin

With T5, the last-active plugin belongs to `host/application`. The renderer also keeps a copy in
`localStorage`, only so the window opens on the right plugin before the backend answers:
- **Keeping it** means two copies of one fact, reconciled on connect. The one reconciliation bug so far was
  a stale id in the copy, now dropped on read.
- **Deleting it** means one copy, but the window shows the default plugin for a moment and then switches.
