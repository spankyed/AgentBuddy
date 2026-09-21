# Review: the feature-addressing follow-up

Reviewed at `ff80ea9ee` (branch `AS/designations-and-addressing`). It covers the follow-up goal
`docs/goals/goal-feature-addressing-followup.md`, commits `a49790c13`…`ff80ea9ee`, which implemented the fixes
from `review-feature-addressing.md`.

The goal's mechanical completion checks all hold:

- `resolveName` is the only caller of `qualifiedId`/`addressOf` outside `@abuddy/sdk/ids` and the registries;
- `system-ids.ts` is gone and `defineSystem` takes `feature`;
- the settings seed carries no plugin key;
- `FeatureAddress` is branded and the renderer cast is gone.

This review covers behaviour. Every item below is a defect. None has a test.

## Status

The feature identity redesign (`docs/plans/feature-identity-redesign.md`, phases 1–9) landed after this review;
each item was re-checked against it at `c2b6c4618`, planned, and then fixed. Every fix below has a test, and each
test was mutation-checked: breaking the fix fails it.

| Item | At `c2b6c4618` | Fix | Test |
|---|---|---|---|
| R1 | Fixed in code (`isPluginId`), no E2E | The E2E; the popout renders its plugin in a `PluginScope` | `tests/e2e/popout.spec.ts` |
| R2 | The SDK door gone; `services.settings` still read and wrote a bare name as default-setup's | `services.settings`, the settings repository, `UPDATE_SETTINGS` and `SETTINGS.UPDATE` take a plugin's ref and refuse a name; seed actions write `'default-setup/<feature>'` | `default-setup/tests/unit/plugin-settings-keys.spec.ts`; `external-pack/tests/e2e/memos.spec.ts` (a pack's own setting changed in Settings lands at its ref) |
| R3 | 0.3.13 gone; 0.3.0 still replaced the default chat modes with Codex | 0.3.0 patches only modes the user stored, and drops `hermes` from the stored record | `default-setup/tests/unit/migrations/migration-0.3.0.spec.ts`, run twice |
| L1 | Fixed at registration (`packSystem`) | Also at build: the generated `PackSystemEvents` passes each spec through `SystemOfFeature`, so a `defineSystem` id naming another feature fails the facade's type check | `abuddy-sdk/tests/build/generate-entries.spec.ts` |
| L2 | Fixed (phase 7) | — | — |
| L3 | Three rules | One rule, `PluginOwners` (`@abuddy/sdk/framework`): the plugin with the feature id, of several the built-in pack's. The migrations and `replaceSettings` use it; the settings system moves a pack's bare keys when it registers (built-in packs' left to their migrations) | `abuddy-sdk/tests/framework/address-plugin-keys.spec.ts`; `plugin-settings-keys.spec.ts` |
| S1 | Open | Folded into R2: reads and writes take the same key | `plugin-settings-keys.spec.ts` |
| S2 | One site left | `sendsTo` targets split with `splitRef` | covered by the codegen specs |
| S3 | `resolveName` passed malformed refs | It refuses them | `abuddy-sdk/tests/ids/feature-ref.spec.ts` |
| S4 | Open | The harness checks a plugin name is registered, and `nextEmit` rejects at once | `default-setup/tests/unit/harness-registry.spec.ts` |
| S5 | Open, narrower | Stops waiting when the plugin is unregistered first | `abuddy-sdk/tests/fe/navigate-wait.spec.ts` |

### Found while fixing R2

- **N1. A pack's plugin with settings must declare `<FEATURE>_SETTINGS_UPDATED` or every settings change logs a
  dropped send.** Default-setup's settings system sends it to the plugin whose settings changed; the bus checks a
  send against what the plugin's own pack declares, so an undeclared one is dropped and reported (and fails a pack
  test). The fixture now declares it, and `docs/public-facing/features.md` says to. A pack author has to know this;
  moving the declaration out of the pack (the settings plugin owning the event, or the SDK declaring it for every
  plugin with settings) is left open.

## Regressions in the running app

### R1. Popping out a plugin fails for every plugin

`packages/main/src/modules/window-manager/WindowManager.ts:144`:

```ts
if (!/^[a-zA-Z0-9_-]+$/.test(pluginId)) throw new Error('Invalid plugin id');
```

Every plugin id is now `<packId>.<featureId>`, which contains a dot. The `plugin:popout` handler therefore throws
for every plugin, so "pop out" does nothing. The goal's Background lists the popout URL as a place addresses
travel, but this check was never updated.

**Fix:** accept an address here, i.e. the address pattern the SDK owns, rather than a separate regex.
**Test:** an E2E that pops out a built-in plugin and finds the popout window.

### R2. An external pack's plugin settings are written into default-setup's namespace

`useSettingsSaveStatus().updateSettings({ entityType: 'plugin', label, … })` is public API
(`@abuddy/sdk/fe`, `etc/fe.api.md`). It sends `SETTINGS.UPDATE` to default-setup's settings plugin. That plugin
resolves the label with `pluginSettingsKey` (`default-setup/src/features/settings/fe/state.ts:185`), and
`pluginSettingsKey` is bound to default-setup's own pack id (`settings/plugin-settings.ts` imports `packId`
from default-setup's `bus-ids`). So when `e2e-fixture` calls `updateSettings({ entityType: 'plugin', label: 'memos', … })`,
the value is saved at `default-setup.memos`. The pack's own slice at `e2e-fixture.memos` never changes, and no
error is raised.

Before this branch, the bare label was the plugin's id, so this worked.

**Fix:** resolve the label in the calling pack's context, not the settings plugin's. Two options: the helper
takes a name and resolves it before sending (the pack's `#generated/fe` can bind the pack id, as it does for
`actorOf`), or the settings plugin accepts only an address, so an unresolved name is refused.
**Test:** from the fixture pack, update one of its own plugin's settings and read it back at the fixture's
address. Also assert that no `default-setup.<feature>` key appears.

### R3. Older migrations lost their defaults when the seed stopped holding plugin keys

The migrations that run before `0.3.15` operate on data that is still keyed by bare feature id, so they read
`getSettings().plugins.<bare>`. That merged read used to include the settings seed's bare defaults. The seed
now holds no plugin key, and the defaults live under addresses, so for a user who never changed the setting
these reads find nothing.

- **`0.3.0`** (`default-setup/src/migrations/0.3.0.ts:9-11`) reads `plugins.threads.chat.modes`, gets `[]`,
  inserts Codex and writes the result to `default-setup.threads`. Confirmed by running it on settings with no
  stored chat modes: the defaults `[birth, claude-code, codex, manager]` become `['codex']`. Anyone upgrading
  from before 0.3.0 who never customised chat modes is left with only the Codex mode.
- **`0.3.13`** (`0.3.13.ts:8-17`) finds no bare `browser` or `notes` in the merged `_meta.visibility`, then
  writes back `{ ...visibility, browser: false, notes: false }`. That merged map includes every default under
  its address. The user's stored settings, which should hold only their changes, now hold every default
  visibility, frozen from that moment: later default changes, and a pack's defaults, no longer apply to them.
  (Found by reading, not run.)

Before `37a0a1936`, the seed supplied the bare defaults these reads relied on, so neither happened.

**Fix:** in these migrations, read the stored bare slice over `getPluginSettings(<name>)` (which carries the
defaults at the address), and compare against stored data only when deciding whether to write.
**Test:** run `0.3.0` and `0.3.13` on settings as a pre-0.3.0 or pre-0.3.13 user stored them, with nothing
customised. Assert the default chat modes survive, and that `_meta.visibility` gains only `browser` and `notes`.

## Latent bugs

### L1. A system's address comes from `defineSystem`, not from the manifest

`toPackSystemDefs(entries, packId)` (`abuddy-sdk/src/framework/system-utils.ts`) addresses each system as
`<packId>.<spec.id>`, where `spec.id` is whatever the module passed to `defineSystem(...)`. Everything else
addresses the feature by its **manifest** id:

- designations (`designationsOf`, `pack-registration.ts:43`);
- the typed sends (`PackSystemEvents` is keyed by manifest feature id);
- `busId`;
- the settings fan-out.

Nothing checks that the two ids agree:

- codegen passes the module straight through (`generate-entries.ts:627`);
- `registerPack` checks only that the id starts with `<packId>.` (`pack-registration.ts:351`);
- so does the loader (`loader.ts:281`).

Suppose feature `notes` declares `defineSystem('note')`. It builds and registers, and its system then runs at
`<pack>.note`, where nothing sends. The loader also looks the manifest feature up by the system's own id
(`loader.ts:289`), so the feature's declared incoming events (`system.events.incoming`) are silently not added.

This is the plugin/system asymmetry that `review-feature-addressing.md` set out to remove. Plugins are now keyed
by feature id in the registration, and the registry addresses them (Decision 3). Systems still address themselves.

**Fix:** codegen emits systems keyed by manifest feature id (`systems: { notes: __system_notes }`), and the
registry addresses them, as it does plugins. `spec.id` then stops being an identity. At minimum, have
`toPackSystemDefs` or codegen refuse a module whose `defineSystem` name differs from its feature id.
**Test:** a fixture system whose `defineSystem` name differs from its feature id is refused at build.

### L2. Child actors use bare system ids, which the rule reserves for the host

The code feature spawns its children under bare system ids in both actor systems:

- backend, `code/be/system.ts:119-157`: `explorer`, `search`, `commit`, `pr`, `terminal`, `codeActions`,
  `codePrompts`;
- frontend, `code/fe/state.ts:347-353`: the same set.

The documented rule (root `CLAUDE.md`) makes bare ids the host's namespace. XState v5 throws
`Actor with system ID '<id>' already exists.` when a system id is registered twice (`system._set`). So a second
pack whose plugin or system spawns a child named `search`, `terminal`, `commit` or `pr` fails to spawn. The claim
that two packs can each have a `notes` feature holds only for the top-level actor, not for anything it spawns.

Other features reach these children by the bare id, e.g. `threads/fe/chat/chat.vue:327` calls
`actorSystem.get('explorer')`. An addressing change that misses these call sites would break silently.

**Fix:** give children an id inside their feature's address (e.g. `<address>/explorer`), and have cross-feature
access go through the owning feature, not the shared system.
**Test:** two packs each spawning a child with the same local name both run.

### L3. Who owns a bare stored settings key is decided three different ways

| Where | Addresses it considers | A bare key shared by two of them |
|---|---|---|
| default-setup `0.3.15` migration | its own 12 features, listed explicitly | not applicable |
| host `0.3.15` migration (`ff80ea9ee`) | external packs only, excluding feature ids a built-in pack also has | built-in wins |
| `replaceSettings` (the settings editor, or restoring a settings export) via `addressPluginSettings` | every registered plugin | left bare |

Consequences:

- Pasting a pre-0.3.15 settings export while any pack with a `notes` feature is installed leaves `notes`
  unmigrated. The two migrations would have given it to default-setup.
- Restoring an export while one of its packs is disabled or not installed leaves that pack's keys bare. Nothing
  moves them later: the migrations have already recorded their version.
- Two external packs sharing a feature id both lose that setting.

**Fix:** one ownership rule, used by all three sites (built-in first, as the host migration decides). Keep
unowned bare keys aside rather than inert, so they can move when their pack registers.
**Test:** `replaceSettings` with a bare `notes` key while a second pack with `notes` is registered: the key lands
on `default-setup.notes`.

## Smaller defects

### S1. The settings repository reads by name and writes by address

`settingsQueries.getPluginSettings(name)` resolves a name. `settingsCommands.updateSettings('plugin', label, …)`
requires an address and refuses anything else (`checkedPluginSettingsKey`). The same slice is read in one
vocabulary and written in the other, and R2 falls out of exactly this kind of mismatch.

### S2. The address format is rebuilt by hand outside `@abuddy/sdk/ids`

The completion check greps for calls to `qualifiedId`/`addressOf` by name. These sites parse or build addresses
with string operations, so they don't trip it:

- `abuddy-host/src/packs/pack-registration.ts:351`: ``startsWith(`${id}.`)``
- `abuddy-host/src/packs/runtime/loader.ts:281,289`: ``startsWith(`${manifest.id}.`)``, `slice(manifest.id.length + 1)`
- `abuddy-sdk/src/build/generate-entries.ts:958,975`: `sendsTo` split on `/`, ``endsWith(`.${target}`)``
- `abuddy-sdk/src/services/index.ts:68`: `replace('.', '/')` for the "did you mean" hint
- `abuddy-testing/src/app.ts:178,186` and `abuddy-testing/src/index.ts:214`: host ids detected as `!id.includes('.')`

These should be `parseAddress`, a `nameOf(address)` and an `isHostId` in `@abuddy/sdk/ids`, with a
`check:specifiers` rule on the string patterns rather than on the function names.

### S3. Pack code can still write an address literal

`resolveName` returns any string containing `.` as-is, without checking its shape. The generated `PluginName`
type (`generate-entries.ts`, `generateFe`) admits `` `${string}.${string}` ``. So pack code can hand-write
`'default-setup.notes'`, which Decision 3 rules out. A malformed one (`'default-setup.notse'`) passes too. Also,
`a/b/c` resolves to `a.b/c` rather than being refused.

### S4. The harness's plugin resolver doesn't check that the plugin exists

`resolvePluginId` (`abuddy-testing/src/app.ts:185`) returns the resolved address without checking it is
registered. `resolveSystemId` does check. A wrong plugin name makes `nextEmit` time out after 5s instead of
throwing at once. The goal requires that an unresolvable name throws.

### S5. `navigateToAddress` waits forever for an actor that never spawns

`abuddy-sdk/src/fe/navigation.ts`: for a registered plugin whose actor isn't running yet, it subscribes to the
application and unsubscribes only once the actor appears. If the spawn fails, the subscription and the queued
events stay for the life of the window.

## Suggested order

1. R1, R2 and R3: live breakage or data loss, each with its test.
2. L1: key systems by feature id. This also removes the loader's lookup by system id.
3. L3: one ownership rule for bare settings keys.
4. L2: namespace child actors.
5. S1–S5.
