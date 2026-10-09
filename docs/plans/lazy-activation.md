# Activate a pack when something needs it, not because the app booted

Compiled 2026-10-08 on `AS/one-action-cache`. **Measurement-gated: do not start this without step 0.** The
design below is sound and the size of the prize is unknown, which is the wrong way round to begin.

## Context

Boot activates everything. `startPacks` (`packs/runtime/start.ts`) runs **every** registered pack's
`onInit`, then the app's and the packs' migrations, then every pack's seeds; the bus spawns every registered
pack's systems. There are **no activation events** — `grep` finds no `activationEvent`, `activateOn` or
equivalent anywhere in the SDK's build or the host's pack runtime.

VS Code's `activationEvents` (`onCommand`, `onLanguage`, `onView`) exist because this is the single largest
lever on a plugin host's startup: an extension that nothing has asked for should not have run.

**The evidence that it matters here is indirect but real.** `goal-one-kind-of-pack` moved `test:smoke` from
9s to 25s, and the recorded cause is that a fresh data dir now installs a pack — so a boot's pack work is
already a visible share of the app's start, and it is all eager.

**The raw material is already declared.** A feature states its `designation`, and systems are reached by
role (`sendToSystem({ role: 'brain' })`, `getDesignated`). "Activate the pack that plays this role, when
something asks for the role" is an activation predicate derived from a declaration rather than a new concept
a pack author has to learn.

## Step 0 — the measurement that decides whether to proceed

Instrument a boot and attribute it: how much of the API process's start is `startPacks`, and inside it, how
much is `onInit` against migrations against seeds against the bus spawning systems. `npm run measure` for
the whole, `DEBUG_E2E=1 npm test -- smoke` for the app's own path, and a per-phase timer for the split.

**The outcome decides the shape of the work, and one outcome is "stop":**

| what the split says | what to do |
|---|---|
| packs are a small share of boot | stop — record the number and close this |
| seeds dominate | seeding is already hash-skipped; the lever is elsewhere and this plan is the wrong one |
| `onInit` and system spawning dominate | the design below is the lever, and the number sizes it |

A plan whose first instruction is "measure" cannot also claim to know the answer, which is why nothing below
is sequenced yet.

## The design, if step 0 says yes

**Activation is a predicate over declarations, not a new vocabulary.** Candidates, cheapest first:

- **A designation nothing has asked for.** A feature whose designation no flow, action or plugin references
  in this app's data has no reason to be running. This is derivable from the seeded flows and the registry.
- **A role on demand.** `sendToSystem({ role })` already resolves a role to a system; it becomes the trigger
  that starts that system's pack rather than assuming it is up.
- **A plugin the user opens.** The renderer already loads a pack's frontend lazily through `pack://`;
  the backend half could follow the same signal (`pluginVisibility` and `lastActivePlugin` are in `AppState`
  already).

**What cannot be lazy, and must be said out loud:** migrations and seeds. A pack's stored data has to be
current before anything reads it, and a lazily-activated pack would migrate at an arbitrary moment. Either
they stay eager (likely correct, and they are already hash-skipped so an unchanged pack costs a comparison)
or they move behind the same predicate and the ordering guarantees in `applyPacks` have to be re-established.
**This is the hard part of the plan, not the activation itself.**

## Depends on

`declarative-contributions.md`, partly: you cannot lazily activate what you can only discover by running.
How much of a pack's contribution is declarative today decides how much of this is reachable, so read that
plan's inventory before designing the predicate.

## Verification

- Boot attribution before and after, same method as step 0, on a quiet box.
- A pack whose designation nothing references does not run its `onInit` — asserted on the registry, not on a
  log line.
- **The case that matters most: a lazily-activated pack is indistinguishable from an eager one** once
  activated. Same systems, same seeds applied, same settings. A fixture pack exercised both ways, with the
  same assertions, is the only honest way to hold that.

## Risks

**A pack that was running is now sometimes not**, and anything that assumed "every registered pack's system
is up" becomes wrong. The bus drops a message to a feature running no actor without a warning today
(`FEATURE_SETTINGS_UPDATED`'s doc) — that silence becomes load-bearing and should probably become a queue or
a trigger instead.

**Cold-start latency moves rather than disappearing.** The first use of a feature pays what boot used to.
For a local app that is usually the right trade; measure it rather than assume.

## What this is not

- Not lazy *loading* of a pack's module. That is a separate and larger change: the registration is what
  declares the activation predicate, so the module is read either way until contributions are fully
  declarative.
