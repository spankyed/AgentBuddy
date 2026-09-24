> **Written in session** `8b92798a-1d8e-4b9d-bb17-daa98bec9f93` (Claude Code, 2026-09-24). Resume it with `claude -r 8b92798a-1d8e-4b9d-bb17-daa98bec9f93`.

```
# Goal: the host sends as itself, and its features stop reaching through each other

Implement docs/goals/goal-host-seams.md on AS/plugin-contract, at or after 550379da2 — the base its
Background was surveyed at.
Before Phase 1, confirm the base: `getDesignated('settings')` appears in
`packages/abuddy-host/src/features/settings/be/system.ts:28`, `designation: 'settings'` in
`packages/abuddy-host/src/features/registration.ts:56`, `untypedBroadcastToPlugin` and
`untypedSendToSystem` are exported from `packages/abuddy-sdk/src/events/index.ts`, and
`packages/abuddy-host/src/features/packs/fe/frontends.ts` imports `ShellPackFrontends` from
`../../application/fe/public.ts`. If they don't, stop and say so — the plan was surveyed somewhere else.
Read Background, Decisions, Phases and Constraints first. Decisions are final: implement them, don't
reopen them or stop to ask.
Where a detail isn't specified, pick the conventional option, note it in the final summary, and keep
going. No backward compatibility in code: change signatures, move modules, migrate every in-repo caller,
test, fixture, template and doc in the same change, and fix forward. Stored user data is the exception:
it moves with migrations.

Finished when:
- Phases 1–4 are implemented and each meets its "Done when"; every new guard, helper or test is
  mutation-checked.
- `git grep "getDesignated('settings')"` and `git grep "designation: 'settings'"` return nothing outside
  a fixture that is testing the designation mechanism with an arbitrary name.
- `HOST_SRC_ROOT` and the `public` branch in `findCrossFeatureImports` are gone from
  `scripts/check-import-specifiers.ts`, and no host feature imports another feature's `fe/`.
- A message sent by the host carries `from: 'host'`, and one sent by an action carries its pack's id.
- `npm run typecheck`, `npm run test:unit`, `npm run api:check`, `npm run build`,
  `npm run test:external-pack`, `npm test` and `npm run test:packaged-authoring` pass.
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
- give the host an `abuddy.json` (Decision 1), or add a table of blessed exceptions to a gate
  (Decision 2). Both were investigated and rejected; the reasons are in Background.
```

## Background (2026-09-24, at 550379da2 on AS/plugin-contract)

Four findings, each checked rather than inferred. They are one goal because the first unblocks the
second, and the fourth removes the last special case the same investigation turned up.

### The `settings` designation is legacy

`settings` was a default-setup feature before it became the host's. The role survived the move:
`hostRegistration` still sets `designation: 'settings'`
(`packages/abuddy-host/src/features/registration.ts:56`), the renderer's FE registration repeats it
(`packages/renderer/src/views/packs/plugin.ts:22`), and nine call sites resolve it at runtime:

| Site | Use |
|---|---|
| `packages/abuddy-host/src/features/settings/be/system.ts:28` | `const settingsView = () => getDesignated('settings')` |
| `packages/renderer/src/runtime/settings.ts:12,13` | `hasDesignation` guard, then `getDesignated` |
| `packages/renderer/src/views/WebApp.vue:202,203` | guard, then `untypedOpenPlugin(getDesignated(…))` |
| `packages/renderer/src/views/settings/canvas/tabs/PluginsTab.vue:150` | `getDesignated('settings')` |
| `packages/renderer/src/views/layout/Toolbar.vue:96,110` | two comparisons |
| `packages/renderer/src/views/layout/ToolbarPluginContextMenu.vue:27,59` | comparison, then open |

Every one is the app resolving *its own* plugin. `HOST.settings` (`packages/abuddy-host/src/refs.ts`)
is the same address, known at compile time. The `hasDesignation('settings')` guards ask whether a
settings plugin exists, which since the move is always yes.

### The host's sends can't say who sent them

`Message.from` is stamped only by `defineEvents(packId)`
(`packages/abuddy-sdk/src/events/index.ts:249`), which a pack's `#generated/events` calls. The host uses
the untyped free sends, so its messages carry no sender. Its broadcast targets, counted at this base:

| Target | Sends |
|---|---|
| `HOST.packs` | 22 |
| `settingsView()` — `getDesignated('settings')` | 15 |
| `HOST.application` | 2 |

With the designation gone, all 39 are compile-time constants, so the host's sends can be *typed*
against `HostPluginEvents`/`HostSystemEvents` — which already exist — and not merely stamped.

Actions are the other half: `services.emitter.broadcastToPlugin` is declared
`typeof untypedBroadcastToPlugin` (`packages/abuddy-sdk/src/services/index.ts:40`), the raw function, and
an action runs outside any pack scope. Those two gaps are what
`docs/goals/wont-do/goal-sender-enforced-audiences.md` records as its objections 1 and 2.

### `fe/public.ts` survives only in the host, for one type

`fe/public.ts` is gone from default-setup. What replaced it was two mechanisms, not a rename: the
contract (`fe/contract.ts`, types only — `NotesContext`, `NotesInboxEvent`, `Contract`) and the readers
`#generated/fe` generates, which give another feature's state without importing its module.

The host's three `fe/public.ts` export runtime values (`createShellMachine`, `packsMachine`,
`createPackFrontends`, `installFromProtocol`, `createSettingsMachine`, …). Their consumers:

- `packages/abuddy-host/src/fe/index.ts:8-10` re-exports all three — the package's own export surface,
  not a crossing;
- `packages/abuddy-host/src/features/packs/fe/frontends.ts:7` imports the type `ShellPackFrontends` from
  `../../application/fe/public.ts` — **the only cross-feature host frontend import there is.**

`ShellPackFrontends` (`packages/abuddy-host/src/features/application/fe/types.ts:12`) is a port: the
shell takes it, the packs feature implements it (`createPackFrontends(io, packs): ShellPackFrontends`).
A contract cannot express that — contracts declare a plugin's state and inbox — so the fix is to move
the port to the seam, not to give the host contracts. The exception in
`scripts/check-import-specifiers.ts` (`HOST_SRC_ROOT`, and the `public` branch in
`findCrossFeatureImports`) exists for that single import.

### What was investigated and rejected

- **Giving the host an `abuddy.json`.** The manifest schema refuses `host` as a pack id
  (`packages/abuddy-sdk/src/build/manifest-schema.ts:213`), a rule that stops a pack impersonating the
  app; `discoverBuiltInPacks` scans `packages/` for manifests, so one there is a standing hazard;
  `hostRegistration(systems)` is parameterised by which systems the caller runs (9 call sites) where a
  generated registration is static; and the host would build through a bespoke path rather than
  `abuddy build`. Of the four benefits, two are void — `eventTypes<E>()` already makes the hand-written
  `PACKS_PLUGIN_EVENT_TYPES` impossible to drift, and the contract-leaf rule guards a codegen cycle the
  host cannot have. The one benefit worth having is what Phase 2 delivers without a manifest.
- **A table of blessed exceptions** for the `fe/public.ts` rule, in the shape of
  `RESOLVES_DIST_BY_DESIGN`. It was written and reverted: it makes the retired pattern permanent and
  documented instead of removing its cause, which is one misplaced interface.

## Decisions

Final.

1. **The host gets no manifest.** It is the pack `host` in the *addressing* sense — every feature lives
   at `<packId>/<featureId>` — and not in the *packaging* sense, which is what a manifest describes. Its
   pack-shaped things stay hand-written where a hand-written one can be type-checked: `hostRegistration`
   (a `PackRegistration`), `HostShell`, `HostPluginEvents`, `HostSystemEvents`.
2. **No exception table.** Where a gate needs an exception, move the cause instead. The one exception
   this goal touches is deleted, not registered.
3. **The `settings` designation is deleted.** The app addresses its own plugin as `HOST.settings`. A
   designation is for a role a *pack* may play; the host's own features are not that.
4. **The sender belongs to the bound send, not to a parameter.** `createSends({ resolve?, from? })`
   returns the three sends; the untyped exports are `createSends({})`, `defineEvents` is
   `createSends({ resolve: refOf, from: packId })`, and the host binds `createSends({ from: HOST_PACK_ID })`.
   This retires the optional third parameter on `untypedBroadcastToPlugin`, `untypedSendToSystem` and
   `_sendToLocalPlugin`.
5. **A port lives at the seam.** `ShellPackFrontends` and any sibling on that export line the packs
   feature implements move out of `features/application/fe/` into `src/fe/`, which both features already
   import from.

## Phases

### Phase 1 — Delete the `settings` designation

- Remove `designation: 'settings'` from `hostRegistration` and from the renderer's FE registration.
- Replace every `getDesignated('settings')` with `HOST.settings` (the renderer imports it from the
  host's refs as it does the others), and delete the `hasDesignation('settings')` guards.
- `settingsView()` in the settings system becomes `HOST.settings` directly.
- Decide and record: whether a pack may now claim the `settings` role, or whether host role names are
  reserved. Either is fine; leaving it unstated is not.

**Done when:** `npm run typecheck`, `npm run test:unit`, `npm test` pass; `git grep "getDesignated('settings')"`
and `git grep "designation: 'settings'"` return only fixtures using `settings` as an arbitrary
designation name (`packages/abuddy-sdk/tests/build/generate-entries.spec.ts`,
`packages/api/tests/unit/secrets.spec.ts`). A spec asserts the Settings view is reachable with no
designation registered. Mutation: re-adding the designation doesn't change any behaviour under test,
which is the point — the role had no reader left.

### Phase 2 — `createSends`, and the host sends as itself

- Add `createSends({ resolve?, from? })` (Decision 4) in `packages/abuddy-sdk/src/events/index.ts`;
  express the untyped exports and `defineEvents` in terms of it; drop the `from?` third parameter from
  all three sends.
- Bind the host's sends once (`createSends({ from: HOST_PACK_ID })`), typed against `HostPluginEvents`
  and `HostSystemEvents`, and route the host's 39 broadcasts and its system sends through them.

**Done when:** `npm run typecheck`, `npm run test:unit` pass; a spec asserts a host send carries
`from: 'host'` and an untyped send carries none; `git grep "from?: string"` finds no send signature.
Mutation: dropping `from` from the host's binding fails a named spec.

### Phase 3 — Actions send as their pack

- Give `services.emitter` a pack identity, threaded through the action sandbox
  (`packages/default-setup/src/extensions/steps/action/sandbox.ts`), so an action's sends stamp `from`.

**Done when:** `npm run typecheck`, `npm run test:unit`, `npm run test:external-pack` pass; a pack test
asserts a message sent from an action carries that pack's id. Mutation: removing the identity fails it.

### Phase 4 — Move the port, delete the exception

- Move `ShellPackFrontends` (and any sibling on `application/fe/public.ts:6` the packs feature
  implements) into `packages/abuddy-host/src/fe/`; point `features/packs/fe/frontends.ts` at it.
- Delete `HOST_SRC_ROOT` and the `public` branch in `findCrossFeatureImports`, and the spec case that
  pins the exception.
- Fold the three `fe/public.ts` barrels into `packages/abuddy-host/src/fe/index.ts`, or rename them for
  what they are. They are not contracts — a contract is type-only — so do not name them `contract.ts`.

**Done when:** `npm run check:specifiers` passes with no exception in `findCrossFeatureImports`;
`git grep "fe/public"` returns nothing under `packages/abuddy-host/src/features`; `npm run typecheck`,
`npm run test:unit`, `npm test` pass. Mutation: reintroducing a cross-feature `fe/` import in the host
is reported, with no exception left to excuse it.

## Deferred

- **Reassessing `docs/goals/wont-do/goal-sender-enforced-audiences.md`.** Phases 2 and 3 remove both of
  its load-bearing objections. Whether to build the enforcement is a separate decision, and the rest of
  that doc's reasons — the snapshot-format break, and designing the policy with no third-party pack in
  existence — still stand.
- **Giving the host codegen.** Decision 1 settles the manifest; generated readers for the host's own
  features are a larger question this goal doesn't open. Phase 4 removes the reason it was being asked.

## Constraints

- The repo's standing rules (root `CLAUDE.md`): no backward-compat shims outside migrations,
  `npm run api:update` with `etc/` committed after a public export changes, typed EARS types are
  change-controlled, mutation-check every new guard, `tests/fixtures/*` is where a cross-pack rule is
  proved.
- Phase 1 before Phase 2: it is what makes the host's sends typeable rather than only stamped.
- Phase 4 is independent of 1–3 and may land in any order relative to them.
