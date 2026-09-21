# Review: how a feature's system and plugin are named and addressed

Reviewed at `02d655f68` (branch `AS/designations-and-addressing`), covering the designations-and-addressing
goal (`865c69819`…`eec168344`) and the follow-up that gave the address rule one owner (`02d655f68`).

F10–F16 come from a second pass focused on behaviour rather than structure. Each one was checked against
`02d655f68`. Four of them are regressions in the shipped app that no suite catches.

## Summary

The complaint this review answers: the system and plugin sides are inconsistent everywhere, neither fully
makes sense, and the whole thing reads as designed ad hoc. That's accurate for the goal as it landed.
`02d655f68` fixed the worst of it. What's left is smaller but has the same root.

**Root cause.** The goal made a feature's system and plugin run under the same string, `<packId>.<featureId>`,
but never made that string a concept. It stayed a convention that each call site upheld by discipline. Every
phase met a new seam between two layers and added a translation there, instead of moving the rule to one owner.
Landing phase by phase, each phase green, rewarded those local patches.

A feature has at most one system and one plugin, and both now run under one address. So the design should have
one concept, the feature's address, with:

- one owner of its format,
- one place that applies it,
- one resolver from a name to an address,
- and one sentence a pack author can learn.

The design findings (F1–F9) explain why the regressions (F10–F13) got through. Every regression is the same
mistake: a site that held a feature's name where the address now belongs, or the reverse. Nothing checks which
one a string is (see D2). And the tests resolve names leniently (F3, F16), so the suites pass while the running
app breaks.

Status legend: **fixed** (resolved by `02d655f68`), **open**, **latent** (correct today, a trap for the next change).

## Findings

### F1. One address, modelled as two ids: partly fixed

What was wrong: four generated maps (`busId`, `system-ids`, a private `systemIds`, `pluginId`). Two registry
resolvers with different rules: `resolveSystemAddress` checked running systems and refused a bare name;
`resolvePluginAddress` checked the plugin validation map and treated a bare name as the host's. `getDesignated`
was documented as returning "its system on the backend, its plugin in the renderer", which is the same string.

- **fixed:** `pluginId`, `systemIds` and `resolvePluginAddress` are gone. `busId` now covers every feature,
  plugin-only ones included.
- **open:** `busId` and `system-ids` are still two generated sources of the same value. `system-ids.ts` is
  `export const notes = busId.notes`, repeated for every feature.
- **open:** the designations doc still describes a system on one side and a plugin on the other, instead of a
  feature's address.

### F2. Nobody owned applying the rule: fixed

What was wrong: ids were built in about 9 places across 8 modules and taken apart in about 10, in opposite
directions:

- systems were qualified inside pack code, then re-checked by the loader and the harness;
- plugins were qualified by the author, then re-checked by the frontend store;
- `receivedEventTypes` and `features` were qualified by the registry.

Seven branches accepted either the bare or the prefixed form. They were backward-compat shims under another
name, and they hid bugs: the whole external-pack E2E failure chain came from these seams.

- **fixed:** `qualifiedId` and `addressOf` in `@abuddy/sdk/ids` own the format. The rule is applied once, where a
  registration is built: `toPackSystemDefs` for systems, `busId` in a plugin module. `registerPack`,
  `registerPackFE` and the loader refuse an unaddressed id and name the fix, where they used to repair it. No
  bare-or-prefixed branch remains.

### F3. Name → address resolution is still re-implemented: open

The format has one owner. The rule for resolving a name in a given pack's context does not. The same decision is
written four times:

| Site | Rule |
|---|---|
| `abuddy-sdk/src/events/index.ts:172` | `/` or a host plugin → `addressOf`, else `qualifiedId(packId, name)` |
| `abuddy-testing/src/app.ts:178` (systems) | `/` or no pack → `addressOf`, else own; then falls back to the bare id if registered |
| `abuddy-testing/src/app.ts:189` (plugins) | `/` or no pack → `addressOf`; own if known, else bare |
| `abuddy-testing/src/index.ts:217` (E2E) | `/` or no pack → `addressOf`, else own |

Each variant is reasonable on its own. Together they are four versions of one rule, and they already differ at
the edges: host names, and what happens with no pack under test. The fix is `resolveName(name, { packId, host })`
in `@abuddy/sdk/ids`, with all four calling it.

### F4. `addressOf` is permissive: open

`addressOf(name)` treats any name without `/` as "already an address". A pack's own bare feature name passed to
it (`addressOf('notes')`) silently becomes the host-namespace id `notes`, not an error. `services.emitter.sendToPlugin`
is now just `sendToPlugin(addressOf(address))`: it no longer checks anything. A wrong name surfaces later as the
bus's "no registered pack declares this plugin" diagnostic, not at the call. That's a deliberate trade
(`02d655f68`: "the types reject it"), but it's asymmetric with `services.emitter.sendToSystem`, which still
resolves through the registry and throws. Pick one behaviour for both sends.

### F5. Two vocabularies at the pack's surface, and the constants don't follow the rule: open

The rule is now written down (root `CLAUDE.md`): **send to a name, look up an address**. The per-feature
constants still don't make it easy to follow. For `notes`:

| Constant | Where | Holds |
|---|---|---|
| `defineSystem('notes')` | `be/system.ts` | a name, in a parameter called `id` |
| `notes = notesSpec.id` | `be/system.ts` | the **name** `'notes'` |
| `notes = busId.notes` | `__generated__/system-ids.ts` | the **address** `'default-setup.notes'` |
| `id = busId.notes` | `fe/state.ts` | the address |
| `feature = 'notes'` | `fe/state.ts` (11 of 12 features) | the name |

- **latent, and the sharpest item here:** `import { notes } from './system'` and
  `import { notes } from '@/__generated__/system-ids'` import the same identifier with different values. Nothing
  mixes them today (checked), but passing the first one to `system.get` compiles, and at runtime it gets
  `undefined`.
- **open:** `defineSystem(id)` names its parameter `id` for what is a feature name. Rename it `feature`.
- **open:** the frontend exports both `id` (the address) and `feature` (the name) per feature, because
  `sendToSystem` takes one and `useActorSystem().get` takes the other. That's the rule applied correctly, with
  two exports per feature as the cost. See D3.

### F6. The renderer relies on designation == system address: open

`packages/renderer/src/core/actors/application.ts:765` sends `systemId: getDesignated('settings') as any`, using
a frontend designation as a system id. It's correct now only because both are the feature's address. The
`as any` is the tell. Once designations are typed as addresses (a `FeatureAddress` type, see D2), the cast goes.

### F7. A feature's identity is spread across the registration: open

`PackRegistration` names a feature in `systems[].id`, in `features[].id` with `hasSystem`/`hasPlugin`, and in the
`receivedEventTypes` keys. `PackFERegistration` names it in `plugins[].id` and `designations`. Now that
registrations must arrive addressed (F2), the registry checks that these agree (the "isn't addressed" refusals),
but it still holds five copies of one fact. That's a larger change and not urgent. Record it so the next field
added to a registration doesn't become a sixth copy.

### F8. Settings keys are lenient: open

`settingsKeyFor(label)` (`default-setup/src/features/settings/be/repository/index.ts:35`) is
`busId[label] ?? label`. Anything `busId` doesn't know is treated as already a key: the `_meta` metadata key, an
address the frontend sent, or a typo. `_meta` should be an explicit reserved key, and anything else should
resolve through the one resolver (F3).

### F9. The E2E suffix match: fixed

`resolvePlugin`'s "unique suffix" guess is gone. E2E specs name built-in plugins `default-setup/<feature>`.

### F10. Cross-plugin navigation in default-setup does nothing: open, regression

`navigateToPlugin(pluginId, event?)` (`abuddy-sdk/src/fe/navigation.ts`) sends `SELECT_PLUGIN` with the id it is
given, then calls `app.system.get(pluginId)`. It resolves nothing. default-setup calls it 20 times with a bare
feature name, for example:

- `threads/fe/chat/chat.vue:324` (`navigateToPlugin('code')`);
- the "Settings → Help" links in `code`, `logs`, `threads` and `pull-request`;
- the jump-to links in the Actions and Prompts panels;
- `database/fe/settings.vue` (`VIEW_BACKUP`).

No plugin is named `code` any more, so each click is ignored. When an event comes with it, `navigateToPlugin`
subscribes and waits for an actor that never spawns, so the subscription leaks. A related case: `logs/fe/canvas.vue:508`
passes `PLUGIN.SELECT pluginId: 'logs'` to the settings plugin, which compares that to `plugin.id`.

The fix is that `navigateToPlugin` takes a name and resolves it (F3), or D3's `actorOf`.

### F11. The settings system's fan-out breaks on either label form: open, regression

This is `updateSettings` in `settings/be/system.ts`. The frontend sends both forms: `useSectionVisibilityMenu.ts:17`
sends `'code'`, while `PluginsTab` sends `plugin.id`.

- **Bare label.** The write lands on `plugins['default-setup.code']` (`settingsKeyFor`). But the fan-out reads
  `data.plugins['code']`, which is the base seed's default (see F12), not the user's change. Then
  `system.get('code')` is `undefined`, so `CODE_SETTINGS_UPDATED` never reaches the code system.
- **Addressed label.** `emitPluginSettings(ev.label, …)` goes through the generated `emit`, which now treats
  `default-setup.code` as a name and qualifies it again. The event type becomes `DEFAULT-SETUP.CODE_SETTINGS_UPDATED`.
- **Another pack's plugin.** A settings change used to reach it on its raw id. It can't now, because the name
  goes through default-setup's own resolution.
- The CLI-path cache clears on `ev.label === 'code'` (line 148), which only matches the bare form.

The fix is to resolve the label once, as the key, the system address and the plugin address, and to derive the
event type from the feature name.

### F12. User settings are silently ignored at 7 read sites: open, regression

These still read a bare key:

- `CliProviders.vue:52` (`plugins.code.cliPaths`)
- `PanelTerminalSection.vue:239-242`
- `ExplorerPanel.vue:202`
- `browser/fe/canvas.vue:84`
- `threads/be/repository/index.ts:557` (the chat settings)

The user's value lives under `default-setup.<feature>`. Each read returns the default instead, so the setting
appears to save and then has no effect.

**Why nothing caught it:** the settings seed compiler still merges each feature's `settings.ts` under **bare** keys.
`dist/settings.seed.json` has `plugins.code` and `_meta.visibility.notes`. The registry already supplies the same
defaults under addressed keys (`createSettingsDefaultsStore`), so the bare copies are dead data. Their only effect
is that a stale reader finds a plausible default and passes its tests. Fixing the compiler, so it writes addressed
keys or none, makes every remaining bare read fail loudly. Do that before chasing the call sites.

### F13. A dependency's plugin is typed by name but sent to the sender's own namespace: open, regression

`generateEvents` types a plugin that `sendsTo` names on a dependency by its bare feature name:
`PackEvents = OwnPackEvents & Omit<Pick<__dep_X_PackEvents, 'memos'>, …>` (`generate-entries.ts:993`). So
`emit('memos', …)` compiles. At runtime, `defineEvents` (`events/index.ts:172`) resolves any bare name that isn't
a host plugin to `qualifiedId(<this pack>, 'memos')`. The send goes to a plugin in the *sending* pack's namespace,
which doesn't exist, and the bus reports it as a diagnostic and drops it.

The types and the runtime disagree on how a dependency's plugin is named. Decision 9 says `<pack>/<feature>`, which
matches the runtime. The generated types should key those plugins `<dep>/<feature>`, as `SendableSystemEvents`
already does for systems. No fixture sends to a dependency's plugin, which is why this went unnoticed. Add one.

### F14. Only default-setup's stored settings were migrated: open

The `0.3.15` migration moves `plugins.<id>`, `_meta.visibility.<id>` and `_meta.lastActivePlugin`, but only for
default-setup's 12 features (`BARE_PLUGIN_IDS`). An installed external pack's stored settings, its sidebar
visibility, and a last-active plugin that was one of its plugins all stay under the bare id. They silently reset.

Moving them is the host's job, not the pack's. The host knows each installed pack's plugins, and a pack has no
migration that could predate its own addressing. Relatedly, restoring a settings export or replacing the JSON in
the settings editor with an older file writes bare keys back, and nothing re-migrates them. A backup import does,
because it runs migrations.

### F15. Actions naming a plugin the old way now fail quietly: open

Until this goal, `services.emitter.sendToPlugin('threads', …)` was the documented form. Seeded actions that are
still unedited get re-seeded with `default-setup/threads`. Edited or user-written ones don't. Since `02d655f68`,
`addressOf('threads')` is the host-namespace id `threads`, so the send is dropped with a diagnostic rather than
thrown (F4). The user's action just stops updating the UI.

The goal rules out a compatibility shim, so this needs a decision (D4).

### F16. Nothing tests the paths that broke: open

The suites passed with F10–F13 live, for three reasons:

- no E2E covers cross-plugin navigation or a settings change reaching a system;
- the harness's `resolveSystemId` and `resolvePluginId` fall back to the bare id when the addressed one isn't
  registered (`abuddy-testing/src/app.ts:180,191`), which is F3's leniency, and it hides mistakes of exactly this
  kind;
- the bare base-seed defaults (F12) make stale reads look right.

Each fix above should come with the test that would have caught it:

- an E2E that clicks a cross-plugin link;
- one that changes a code setting and sees `CODE_SETTINGS_UPDATED` reach the code system;
- a fixture that sends to a dependency's plugin;
- and, for each, a mutation run showing the test fails when the fix is reverted.

## Proposed design

1. **`FeatureAddress`**, a branded string in `@abuddy/sdk/ids`, which already owns `qualifiedId`/`addressOf`.
   Designations, `busId` values, `Plugin.id` and `PackSystemDef.id` are typed with it, so passing a name where an
   address belongs fails to compile. This closes the F5 trap and the F6 cast.
2. **One resolver**, `resolveName(name, context)`, next to it. The sends, `services.emitter` (both directions),
   the harness, the E2E fixture and settings keys all call it. It fails on a name it can't resolve (F3, F4, F8).
3. **One generated source per pack.** Drop `system-ids.ts`, and let `busId` (or `address`, see D1) be the only
   one. A feature module exports its name as `feature` and never an address, so nothing shares an identifier
   with different meanings (F1, F5).
4. **`defineSystem(feature)`**, a rename (F5).
5. **One doc sentence:** "You write names, and look up addresses from `busId`." Designations are described as the
   feature's address, on the backend and the frontend alike (F1).

## Decisions needed

- **D1: one textual form or two.** Today names use `/` (`default-setup/notes`) and addresses use `.`
  (`default-setup.notes`), with `addressOf` translating. Making the address `default-setup/notes` removes the
  translation. The cost is unclear: `0.3.15` hasn't shipped, so the settings migration and the E2E ids can
  target the new form with no extra user-data migration. To check first: anything that carries a plugin or
  system id in a URL, a path or an XState actor id.
  Keeping two forms is also defensible now that one module owns the conversion.
- **D2: brand the type.** A branded `FeatureAddress` catches mix-ups at compile time. It touches every public
  signature that takes an id, so it needs `api:update` and a change to the published SDK's types.
- **D3: should pack code hold an address at all?** An `actorOf(name)` helper (backend `system`, frontend
  `useActorSystem()`) would let pack code deal only in names, removing the `id`/`feature` pair per feature.
  The cost is new API surface.
- **D4: actions written the old way (F15).** The choices are: a `0.3.15` migration that rewrites
  `services.emitter.sendToPlugin('<bare>'` in stored action code (brittle, since it rewrites source text);
  accepting that edited actions break, with a release note; or having `services.emitter` throw on an unresolved
  name, so the break is loud at least (this also settles F4).
- **D5: who migrates an external pack's settings (F14).** The host, from each installed pack's manifest, in its own
  `0.3.15` app migration. Or nobody, with a release note.

## Suggested order

Each step can land on its own. All of it can land before `0.3.15` ships. Steps 0a–0d are regressions and come
first. Each one ships with the test F16 names for it.

0a. The settings seed compiler writes addressed keys, or none. Then fix the 7 readers it exposes (F12).
0b. Resolve the label once in the settings fan-out: the key, the system address, the plugin address, and an
    event type from the feature name (F11).
0c. `navigateToPlugin` resolves a name, or its 20 call sites move to `busId` (F10).
0d. Key a dependency's plugins `<dep>/<feature>` in the generated `PackEvents` (F13).
1. `resolveName` in `@abuddy/sdk/ids`, and the four call sites on it (F3). Pick one behaviour for the emitter's
   two sends (F4). **Mutation:** a pack's bare feature name sent from an action fails at the call.
2. Drop `system-ids.ts`; feature modules export `feature`, never an address; rename `defineSystem`'s parameter
   (F1, F5). **Mutation:** a system module exporting an address under its feature's name fails a spec.
3. Make `_meta` a reserved settings key and route `settingsKeyFor` through `resolveName` (F8).
4. If D2: brand `FeatureAddress`, type designations with it, and remove the renderer cast (F6).
5. If D1: switch the address format and retarget the `0.3.15` migration.
6. Later: collapse a registration's copies of a feature's identity (F7).
