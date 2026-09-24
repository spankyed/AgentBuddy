# The Host Sends As Itself, And Its Features Stop Reaching Through Each Other

Surveyed 2026-09-24 at `550379da2` on `AS/plugin-contract`.

Four special cases the host still carries. They are one plan because the first unblocks the second, and
the fourth removes the last one the same investigation turned up.

## What's True Today

**1. The `settings` designation is legacy.** `settings` was a default-setup feature before it became the
host's; the role survived the move. `hostRegistration` sets `designation: 'settings'`
(`features/registration.ts:56`), the renderer's FE registration repeats it
(`renderer/src/views/packs/plugin.ts:22`), and nine call sites resolve it at runtime — `settings/be/system.ts:28`,
`renderer/src/runtime/settings.ts:12,13`, `WebApp.vue:202,203`, `PluginsTab.vue:150`, `Toolbar.vue:96,110`,
`ToolbarPluginContextMenu.vue:27,59`. Every one is the app resolving *its own* plugin. `HOST.settings` is
the same address, known at compile time. The `hasDesignation('settings')` guards ask whether a settings
plugin exists, which since the move is always yes.

**2. The host's sends can't say who sent them.** `Message.from` is stamped only by `defineEvents(packId)`
(`abuddy-sdk/src/events/index.ts:249`), which a pack's `#generated/events` calls. The host uses the
untyped free sends, so its messages carry no sender. Its broadcast targets: 22 to `HOST.packs`, 15 to
`settingsView()`, 2 to `HOST.application`. With the designation gone all 39 are compile-time constants,
so the host's sends can be *typed* against `HostPluginEvents`/`HostSystemEvents` — which already exist —
not merely stamped.

**3. Actions are the other half.** `services.emitter.broadcastToPlugin` is declared
`typeof untypedBroadcastToPlugin` (`abuddy-sdk/src/services/index.ts:40`), the raw function, and an
action runs outside any pack scope. Those two gaps are objections 1 and 2 in
`docs/goals/wont-do/goal-sender-enforced-audiences.md`.

**4. `fe/public.ts` survives only in the host, for one type.** It is gone from default-setup, replaced by
two mechanisms rather than renamed: the contract (`fe/contract.ts`, types only) and the readers
`#generated/fe` generates. The host's three `fe/public.ts` export runtime values, and have two consumers:
`abuddy-host/src/fe/index.ts:8-10` re-exports all three (the package's export surface, not a crossing),
and `features/packs/fe/frontends.ts:7` imports the type `ShellPackFrontends` from
`../../application/fe/public.ts` — the only cross-feature host frontend import there is.
`ShellPackFrontends` (`features/application/fe/types.ts:12`) is a port: the shell takes it, the packs
feature implements it. The exception in `scripts/check-import-specifiers.ts` (`HOST_SRC_ROOT`, and the
`public` branch in `findCrossFeatureImports`) exists for that single import.

**5. The host addresses features unlike every pack.** A pack sends by bare feature id, typed per receiving
plugin: `broadcastToPlugin('notes', …)`. The host passes branded refs to untyped sends —
`broadcastToPlugin(HOST.settings, …)` — so nothing checks the target or the event. It has no maps to check
against: `HostPluginEvents` is its *published* inbox, what a pack may send it, so `host/settings` there is
`CLI_TEST_RESULT` alone while `SETTINGS_LOADED` and the rest live in the feature's contract.

The maps are assemblable from what exists, and are line-for-line the three `receives` expressions in
`registration.ts:52,53,61` — today hand-maintained runtime lists with no type beside them. Compiled against
the real types, with bare names, all six assertions hold: the right event accepted for `packs` and `bus`, a
role send still unchecked by design, and rejected — another plugin's event, a missing field, an unknown
feature.

The `FeatureRef` branding is not in the way: after this, host code writes the name, so a ref is never passed
to a typed send and the two never meet. Nor is anything lost by writing one. The brand proves a ref came
from `resolveName`, not that it names a feature that exists — `resolveName('settngs', 'host')` returns a
valid `FeatureRef` and compiles, and the message is dropped at run time. A keyed map checks existence and
the event with it, so on this path it is strictly the stronger check. The brand goes on guarding the untyped
sends, which keep only that provenance check; moving 57 sites off them is the other half of the win.

## What We're Not Doing

**1. No `abuddy.json` for the host.** The manifest schema refuses `host` as a pack id
(`manifest-schema.ts:213`) — a rule that stops a pack impersonating the app. `discoverBuiltInPacks` scans
`packages/` for manifests, so one there is a standing hazard. `hostRegistration(systems)` is parameterised
by which systems the caller runs (9 call sites) where a generated registration is static. And the host
would build through a bespoke path rather than `abuddy build`. Of the four benefits, two are void:
`eventTypes<E>()` already makes the hand-written `PACKS_PLUGIN_EVENT_TYPES` impossible to drift, and the
contract-leaf rule guards a codegen cycle the host cannot have. The one benefit worth having is what
step 2 delivers without a manifest.

The host is the pack `host` in the *addressing* sense — every feature at `<packId>/<featureId>` — and not
in the *packaging* sense, which is what a manifest describes. Its pack-shaped things stay hand-written
where a hand-written one can be type-checked: `hostRegistration`, `HostShell`, `HostPluginEvents`,
`HostSystemEvents`.

**2. No table of blessed exceptions** for the `fe/public.ts` rule. One was written in the shape of
`RESOLVES_DIST_BY_DESIGN` and reverted: it makes the retired pattern permanent and documented instead of
removing its cause, which is one misplaced interface.

## Steps

All five have landed, on `AS/plugin-contract`:

| Step | Commit | Note |
|---|---|---|
| 1 — Delete the `settings` designation | `a07b5c095` | |
| 2 — `createSends`, and the host sends as itself | `e5580d6b4` | |
| 5 — The host sends by name, typed | `4d649fc0b` | Landed before 3 and 4; its claim that step 1 would unblock the typing was wrong, and the commit says why |
| 3 — Actions send as their pack | `576873cbe` | `via` widened past the action to name any source: `reportError` stamps the source it was given, so the invariant is "a pack, a source, or both" rather than "one module stamps nothing" |
| 4 — Move the port, delete the exception | `9d80d94ff` | The exception excused four imports, not one — see below |

Two things the steps below did not predict, both recorded where they were found:

- **Step 4's exception was load-bearing for the package barrel too.** `HOST_SRC_ROOT` excused
  `features/packs/fe/frontends.ts` *and* the three `fe/index.ts` re-exports, so folding the barrels in (as this
  plan says to) would have broken the gate rather than freed it. What replaced it is a derived rule — a package
  may name its features' frontends from a module it publishes *and* that sits outside every feature, the
  hand-written counterpart of a pack's generated `pack-entry-fe.ts` — so nothing is blessed by path or by
  filename, and a tree with no `exports` excepts nothing. The second half of that is not decoration: `@abuddy/host`
  publishes `./settings` from `features/settings/be/index.ts`, and excepting a module by visibility alone handed
  that one feature a licence no other feature had (found in review, fixed in `29620c935`'s successor).
- **Step 3's `via` is not only an action's.** Stamping a source rather than specifically an action costs nothing
  and lets `reportError` — the one remaining sender with no pack to name — say where it came from.
- **"The four sites that render a sender" below undercounts the shell.** It refuses a plugin at once *and* after
  waiting for pack frontends, and the deferred one carried no sender at all, because `awaitingPlugin` kept a
  hand-picked subset of the request. Review caught it; all of the shell's now come from one `refusal()`
  (`931a4ce7c`). The count in Open Questions is left as written — it is the record of what was decided then.

### 1 — Delete the `settings` designation

Remove `designation: 'settings'` from `hostRegistration` and the renderer's FE registration. Replace every
`getDesignated('settings')` with `HOST.settings`; delete the `hasDesignation('settings')` guards.
`settingsView()` becomes `HOST.settings` directly.

Closes finding 1. Goes first: it makes the host's send targets compile-time constants, which is what lets step 2 be typed
rather than only stamped.

### 2 — `createSends`, and the host sends as itself

Closes finding 2. Add `createSends({ resolve?, from? })` returning the three sends. The untyped exports become
`createSends({})`, `defineEvents` becomes `createSends({ resolve: refOf, from: packId })`, and the host
binds `createSends({ from: HOST_PACK_ID })`. Drops the `from?` third parameter from
`untypedBroadcastToPlugin`, `untypedSendToSystem` and `_sendToLocalPlugin`.

**Stamping only.** This step was written expecting to type the sends too, against
`HostPluginEvents`/`HostSystemEvents`. Those are the published maps, not the host's own, so that was never
the right target — it is finding 5, and step 5 closes it. Stamping is what the deferred enforcement goal
was blocked on, so it lands alone; `packages/abuddy-host/src/events.ts` records why, and step 5 deletes
that note.

### 3 — Actions send as their pack

Closes finding 3. Give `services.emitter` a pack identity, threaded through the action sandbox
(`default-setup/src/extensions/steps/action/sandbox.ts`).

The stamp's shape is settled (open question 2): `from` stays the pack, and `via` carries `action:<label>`
beside it. So `Message` gains `via?: string`, the sandbox passes the label it already has, and the four
sites that render a sender append it when present.

This is the only remaining step that reaches outside the host: `services/index.ts` in the SDK and
default-setup's sandbox, so it takes `api:update` and the pack suites.

### 4 — Move the port, delete the exception

Closes finding 4. Move `ShellPackFrontends` (and any sibling on `application/fe/public.ts:6` the packs feature implements)
into `abuddy-host/src/fe/`, which both features already import from. Point `features/packs/fe/frontends.ts`
at it. Then delete `HOST_SRC_ROOT`, the `public` branch in `findCrossFeatureImports`, and the spec case
pinning the exception.

Fold the three `fe/public.ts` barrels into `abuddy-host/src/fe/index.ts`.

Independent of 1–3; can land in any order relative to them.

### 5 — The host sends by name, typed

Closes finding 5. Export `SettingsPluginEvents` (one word), then define the host's two maps in
`abuddy-host/src/events.ts` and bind `defineEvents<HostPlugins, HostSystems>(HOST_PACK_ID)` in place of the
`createSends({ from })` binding:

```ts
type HostPlugins = WithOwnNames<'host', {
  'host/application': HostPluginEvents['host/application'];
  'host/packs':       OutgoingPacksEvents;
  'host/settings':    SettingsPluginEvents | HostPluginEvents['host/settings'];
}>;
```

Then move the 39 broadcasts and 18 system sends from `HOST.*` to bare feature ids. `HOST.*` stays for the
untyped paths and for addressing, where the brand is still the only check.

Expect mismatches between what the host sends and what the maps say. Reading them is the work; some may be
real. Lands after step 2, whose note it deletes.

## Files Changed

| File | Change |
|------|--------|
| `packages/abuddy-host/src/features/registration.ts` | Drop `designation: 'settings'` |
| `packages/renderer/src/views/packs/plugin.ts` | Drop `designation: 'settings'` |
| `packages/abuddy-host/src/features/settings/be/system.ts` | `settingsView()` → `HOST.settings` |
| `packages/renderer/src/runtime/settings.ts`, `views/WebApp.vue`, `views/settings/canvas/tabs/PluginsTab.vue`, `views/layout/Toolbar.vue`, `views/layout/ToolbarPluginContextMenu.vue` | `getDesignated('settings')` → `HOST.settings`; drop the `hasDesignation` guards |
| `packages/abuddy-sdk/src/events/index.ts` | `createSends`; untyped exports and `defineEvents` built from it; `from?` parameter goes |
| `packages/abuddy-host/src/**` (39 broadcast sites) | Send through the host's bound sends |
| `packages/abuddy-sdk/src/services/index.ts` | `emitter` carries a pack identity |
| `packages/default-setup/src/extensions/steps/action/sandbox.ts` | Thread the pack id to the emitter |
| `packages/abuddy-host/src/features/settings/be/system.ts` | Export `SettingsPluginEvents` for the map |
| `packages/abuddy-host/src/events.ts` | The host's two maps; bind `defineEvents`, dropping the `createSends` note |
| `packages/abuddy-host/src/**` (39 broadcasts, 18 system sends) | `HOST.*` → bare feature ids |
| `packages/abuddy-host/src/features/application/fe/types.ts` → `src/fe/` | Move `ShellPackFrontends` to the seam |
| `packages/abuddy-host/src/features/packs/fe/frontends.ts` | Import the port from `src/fe/` |
| `scripts/check-import-specifiers.ts` | Delete `HOST_SRC_ROOT` and the `public` branch |
| `packages/abuddy-cli/tests/build/import-specifiers.spec.ts` | Drop the case pinning the exception |
| `packages/abuddy-host/src/features/*/fe/public.ts` | Fold into `src/fe/index.ts`, or rename |

## Open Questions

1. **Does reassessing `goal-sender-enforced-audiences.md` follow?** Steps 2 and 3 remove both of its
  load-bearing objections. Its other reasons — the snapshot-format break, and designing the policy with
  no third-party pack in existence — still stand, so this is a separate decision.
  - just update the doc, no need to reassess.
  - Done. Reason 1 is answered outright; reason 2 in its factual half only — the host's call sites stamp now,
    but a sender can still opt out of the rule by reaching for the untyped sends, which is a decision about the
    public API rather than about audiences. The doc stays won't-do and says which reopening condition is left.

2. **What an action stamps** — settled: the pack in `from`, the action beside it.

  `Message.from` is documented as "the id of the pack that sent it", and every stamp today is one. For an
  action that is nearly no information: default-setup is the largest pack in the repo, and actions are
  seeded, user-editable content — the likeliest wrong send and the hardest to locate. Diagnostics are the
  field's whole job, so the grain matters. Actions are also the one case where finer is *available*:
  `runActionCode` already takes a `label` and builds `createLogger('action:<label>')`. A system's sends
  can't name their calling feature, because `defineEvents(packId)` is built once per pack.

  `'default-setup/summarise-thread'` was the tempting shape and is the wrong one: it names the same two
  things in a form that reads as `<packId>/<featureId>`, and an action is not a feature. Anything that ever
  reads `from` as a ref would get a confident wrong answer.

  So `from` keeps one meaning — the pack — and `via` carries what within it made the send, in the form the
  repo already uses for an action as a source. `via` is absent for everything else, so nothing else changes:

  ```
  Dropped "MEMO_ADDED" sent by "default-setup" (action:summarise-thread) to the "memo-pack/memos" plugin, …
  Dropped "MEMO_ADDED" sent by "default-setup" to the "memo-pack/memos" plugin, …
  Dropped "MEMO_ADDED" sent to the "memo-pack/memos" plugin, …
  ```

  The four sites that render a sender (`bus/machine.ts:152`, `bus/client-events.ts:43`, and the shell's two
  from step 2) take `via` the same way they took `from`: appended when present, nothing when not. `from`'s
  doc comment stays true as written, and gains a line for `via`.
