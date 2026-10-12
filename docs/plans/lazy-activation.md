# Activate a pack when something needs it, not because the app booted

Sequencing: after naming and complete [discovery](discovery-without-activation.md), and only after
boot attribution shows a worthwhile gain. Catalog completeness enables lazy loading but does not
implement it. Derive triggers from existing declarations; preserve migrations/content ordering and
message readiness. The original eager-runtime design below is research input, not the selected end state.

Compiled 2026-10-08 on `AS/one-action-cache`. **Measurement-gated: do not start this without step 0.** The
design below needs re-audit on the catalog boundary, and the size of the prize is still unknown.

## Context

Boot activates everything. `startPacks` (`packs/runtime/start.ts`) runs **every** registered pack's
`onInit`, then the app's and the packs' migrations, then every pack's content; the bus spawns every registered
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
much is `onInit` against migrations against content against the bus spawning systems. `npm run measure` for
the whole, `DEBUG_E2E=1 npm run test:e2e -- smoke` for the app's own path, and a per-phase timer for the split.

**The outcome decides the shape of the work, and one outcome is "stop":**

| what the split says | what to do |
|---|---|
| packs are a small share of boot | stop — record the number and close this |
| content dominate | applying is already hash-skipped; the lever is elsewhere and this plan is the wrong one |
| `onInit` and system spawning dominate | the design below is the lever, and the number sizes it |

A plan whose first instruction is "measure" cannot also claim to know the answer, which is why nothing below
is sequenced yet.

## The design, if step 0 says yes

**Activation is a predicate over declarations, not a new vocabulary.** Candidates, cheapest first:

- **A designation nothing has asked for.** A feature whose designation no flow, action or plugin references
  in this app's data has no reason to be running. This is derivable from the written flows and the registry.
- **A role on demand.** `sendToSystem({ role })` already resolves a role to a system; it becomes the trigger
  that starts that system's pack rather than assuming it is up.
- **A plugin the user opens.** The renderer imports pack frontends dynamically through `pack://`, currently during startup;
  the backend half could follow the same signal (`pluginVisibility` and `lastActivePlugin` are in `AppState`
  already).

**What cannot be lazy, and must be said out loud:** migrations and content. A pack's stored data has to be
current before anything reads it, and a lazily-activated pack would migrate at an arbitrary moment. Either
they stay eager (likely correct, and they are already hash-skipped so an unchanged pack costs a comparison)
or they move behind the same predicate and the ordering guarantees in `applyPacks` have to be re-established.
**This is the hard part of the plan, not the activation itself.**

## Depends on

[Discovery without activation](discovery-without-activation.md) provides the complete descriptor and
catalog. Re-measure and redesign activation on that boundary; the archived contribution plan is history.

## Verification

- Boot attribution before and after, same method as step 0, on a quiet box.
- A pack whose designation nothing references does not run its `onInit` — asserted on the registry, not on a
  log line.
- **The case that matters most: a lazily-activated pack is indistinguishable from an eager one** once
  activated. Same systems, same content applied, same settings. A fixture pack exercised both ways, with the
  same assertions, is the only honest way to hold that.

## Risks

**A pack that was running is now sometimes not**, and anything that assumed "every registered pack's system
is up" becomes wrong. The bus drops a message to a feature running no actor without a warning today
(`FEATURE_SETTINGS_UPDATED`'s doc) — that silence becomes load-bearing and should probably become a queue or
a trigger instead.

**Cold-start latency moves rather than disappearing.** The first use of a feature pays what boot used to.
For a local app that is usually the right trade; measure it rather than assume.

## What this is not

- The original proposal deferred lazy module loading because registration supplied metadata. After
  discovery lands that limitation is removed. Decide which loading/activation work to defer from measured
  cost and readiness behavior; do not preserve eager imports solely to rediscover catalog facts.
