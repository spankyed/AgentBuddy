> **Won't do — the half that enforces.** The envelope half shipped: `Message.from` is stamped by the sends
> `#generated/events` builds, and the bus and `receiveClientEvent` name the sender in their diagnostics. The
> enforcement half — audience-split `receives` on both registrations, and the bus refusing a cross-pack send of a
> `pack`-tier event — is not being built, and the reasons are below rather than in a conversation. They are about
> the shape of the check, not its difficulty. **Reopen when** a third-party pack can actually be installed from a
> registry, or when `services.emitter` acquires a pack identity; either one removes a load-bearing objection.

> **Written in session** `8b92798a-1d8e-4b9d-bb17-daa98bec9f93` (Claude Code, 2026-09-24). Resume it with `claude -r 8b92798a-1d8e-4b9d-bb17-daa98bec9f93`.

# Goal: the bus refuses a cross-pack send of a `pack`-tier event

A plugin's `Contract` declares an inbox by audience — `pack` is the plugin's own pack's features, `public` is what
a pack depending on it may send. Today that split is enforced by types alone. This goal was to make it true at
runtime as well. It is recorded as won't-do, with what it would take if that changes.

## What already landed

Half of `goal-plugin-contract.md`'s Deferred item 2 shipped, because it stands on its own:

- `Message.from?: string` — the id of the pack that sent it, stamped in `defineEvents(packId)` for all three
  sends. Optional, and absent on the host's own sends and on an action's through `services.emitter`.
- The bus's two drop diagnostics and `receiveClientEvent`'s two `UnknownClientEventError` messages name it, so a
  dropped message says who sent it instead of leaving that to a grep. The drop dedupe is keyed
  `pluginId/type/from`, so two packs making the same wrong send are two reports rather than one.
- Nothing routes or refuses on `from`. It is a label, not a claim: a sender that doesn't stamp is not thereby
  untrusted, and one that does has not been checked.

What did **not** land: any change to `PackFeaturePlugin.receives` or `PackFEFeature`, and any rejection.

## Background (2026-09-24)

- `PackFeaturePlugin.receives` is one flat list, and its own doc comment says what that costs
  (`framework/pack-registration.ts:53`): *"a passing check means the event's shape was accepted, not that this
  sender was allowed to send it."* The bus checks the event's type against it and cannot check audience.
- `PackFEFeature` (`fe/pack-fe-registration.ts:13`) has no `receives` at all. The renderer's in-window path is
  `SEND_TO_PLUGIN: { actions: 'sendToPlugin' }` (`features/application/fe/machine.ts:545`) — no guard, nothing
  validated.
- The bus's drop path is well-behaved and is what enforcement would reuse: `reportDrop`
  (`bus/machine.ts:154`) reports a `diagnostic` — logged, recorded, failing any pack test that leaves one, no
  user toast — dedupes per pair, and stays quiet while a pack is mid-replacement (`isPluginReplacing`), so
  `abuddy dev` rebuild cycles don't spam.
- Third-party pack distribution does not exist: `resolveFromRemoteRegistry` (`abuddy-cli/src/commands/install.ts:17`)
  always throws. Every pack that exists is in this repo, where types already cover every send.

### The correction that reopened the question

`goal-plugin-contract.md`'s Deferred item 2 gives a reason that is no longer true: *"The renderer's in-window
`sendToPlugin` is not [cheap]: it has no scope that names who is sending."* It does. `defineEvents(packId)`
(`events/index.ts:249`) closes over the pack id and builds all three sends from it — `broadcastToPlugin`,
`sendToSystem` **and** `sendToPlugin`. The sender is in scope on both transports, at exactly the granularity a
`pack`-tier check needs. That objection is gone; the ones below are what replace it.

## Why not

1. **The sends that most need a sender can't easily get one.** `services.emitter.broadcastToPlugin` is declared
   `typeof broadcastToPlugin` (`services/index.ts:40`) — the raw SDK function, not one built by `defineEvents`.
   That is the emitter **actions** use, and actions run outside any pack scope. So the code path with the least
   compile-time checking is the one that cannot stamp `from` without threading a pack identity through the action
   sandbox. Sends from a pack's systems and plugins are the easy case, and they are also the case types already
   cover.

2. **An unstamped message has no good meaning.** There are 61 raw `broadcastToPlugin`/`sendToSystem`/`sendToPlugin`
   call sites across host, api and renderer, none with a pack id in scope. Reject unstamped messages and the host
   breaks. Trust them and the rule is advisory — anything that wants around it simply doesn't stamp, including the
   untyped SDK sends that `check:specifiers` only blocks *in pack sources*. An enforcement the enforcer can opt out
   of by omission isn't much of one, and it is the same "enforced on one path but not the other" objection the
   original doc raised, relocated rather than solved.

3. **It breaks two published contracts at once, and `receives` is in the snapshot.** `Message` is public API;
   `PackFeaturePlugin.receives` and `PackFEFeature` are the pack registration contract. `receives` reaches
   `dist/snapshot.json`, so this is a `PACK_SNAPSHOT_FORMAT` bump (currently 1) plus `api:update`, plus the
   install-time `buildFormatProblem`/`hostVersion` gate. A pack a user already installed has flat `receives`, and
   the no-backcompat rule means it fails rather than degrades. The change wants a release boundary, not a
   mid-branch landing.

4. **The policy would be designed with no evidence.** No third-party pack exists, so what counts as a violation is
   guesswork: may a pack forward an event it received? Re-emit on behalf of another feature? The first real
   external pack answers that. Picking now means picking twice.

5. **A third delivery path would not have the check.** `testRootEvents` has no bus actor — `@abuddy/testing`'s
   `startApp` delivers plugin sends itself. So either the harness gets the same check, and every pack test that
   sends cross-pack needs its fixtures made audience-correct, or pack tests pass on sends the running app rejects.
   Green locally and a diagnostic in the app is the worst of the available failure modes.

### On developer experience

The restriction itself is mild: audiences are a plugin-inbox concept, so `sendToSystem` — most pack-to-pack
traffic — is untouched, and the existing drop diagnostic is a reasonable place to land ("declare it `public` in
your plugin's `Contract` inbox" fits the tone of the messages already there). Two costs are real, though. The
runtime check only earns its keep for stale or untyped senders, which is the population least likely to be
watching the Logs plugin — for in-repo typed senders this is already a compile error, which is strictly better
devex. And because host and action sends cannot stamp, the same logical send passes or fails depending on which
API the author reached for, where the workaround for a rejection is to switch to the untyped SDK send. A rule you
can escape by using a worse API trains people toward the worse API.

## The one argument for doing it anyway

The ordering is inverted from the usual "defer until needed". The *value* arrives only once third-party packs
ship, but the *cost* sits in shape changes to the pack registration contract, which are free while every pack is
in this repo and expensive afterwards — changing the registration after packs ship is the version-skew problem
the feature exists to catch.

This is why the envelope half landed now and the rest did not. `Message.from` is the part of the shape that could
be added without a contract break, and it is additive and optional. Audience-split `receives` is the part that
cannot, and reasons 1 and 2 apply to the shape as much as to the enforcement: locking in a contract whose central
field is optional and frequently absent is a worse starting point than adding it once the sandbox's story is
settled.

## If this is reopened

1. Give `services.emitter` a pack identity, threaded through the action sandbox (`extensions/steps/action/sandbox.ts`),
   so an action's sends stamp `from`. Until this holds, reasons 1 and 2 stand and the rest is not worth starting.
2. Decide the unstamped policy explicitly, and write it down: which senders are exempt, and why that list cannot
   grow silently.
3. Split `receives` by audience in `PackFeaturePlugin` and add it to `PackFEFeature`; bump
   `PACK_SNAPSHOT_FORMAT`; land it at a release boundary.
4. Enforce in the bus, the shell and the test harness in one change — not one path at a time.
5. Report before rejecting. Reuse `reportDrop`'s severity and dedupe, ship a release reporting violations, and
   only then refuse.

## Constraints

The repo's standing ones apply (root `CLAUDE.md`): no backward-compatibility shims outside migrations, published
packages take `api:update` with `etc/` committed, typed EARS types are change-controlled, mutation-check every new
guard, and `tests/fixtures/*` is where a cross-pack rule is proved.
