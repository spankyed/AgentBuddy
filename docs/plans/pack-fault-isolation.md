# A pack that breaks should cost its own feature, not the app

Compiled 2026-10-08 on `AS/one-action-cache`. **Conditional: this is not work for today.** Its trigger is
named below, and until that trips, the cheap half is worth doing and the expensive half is not.

## Context

Packs run in the host's processes: backends in the API process, frontends in the renderer. **Load time is
guarded already**, and well:

- a pack whose runtime fails to load is skipped with a reason (`loader.ts`'s `skipped`, the registry's
  `loadProblem`);
- `activationProblem` (`packs/runtime/activation-outcome.ts`) turns a failed activation or a failed content
  into a message naming the pack;
- the frontend entry import is wrapped, and a registration that registers nothing is reported
  (`features/packs/fe/frontends.ts`);
- the renderer has a global Vue error handler (`renderer/src/main.ts:92`).

**Run time is thinner.** A backend pack's work happens inside XState actors, so a throw in an action errors
that actor rather than the process — real containment, inherited rather than designed. On the frontend, one
global handler catches what Vue surfaces, and a pack's component that throws during render takes its subtree
with it; nothing scopes the blast radius to the pack.

VS Code runs extensions in a separate **extension host process**, and the reason is mostly stability rather
than security: a wedged or crashing extension must not take the window down.

## The trigger

**Packs this repo did not write, installed by users.** Today `resolveFromRemoteRegistry`
(`abuddy-cli/src/commands/install.ts:17`) throws for every name, so every pack in existence is in this tree
and a crash is a bug to fix rather than a hazard to contain. When third-party distribution is real, so is
this plan — and `declared-capabilities.md` becomes its prerequisite rather than its sibling, because
containment without a declared surface is containment of nothing in particular.

A second trigger, weaker but earlier: a crash report that names a pack's frontend as the cause of a blank
window. That is the cheap half's evidence.

## The cheap half, worth doing before the trigger

**Scope the frontend blast radius to the pack.** A pack's canvas, panel and settings each render inside a
`PluginScope` already; an error boundary at that seam turns "a pack's component threw" into "that pack's
pane shows an error and the app keeps working", with the pack named. Vue's `onErrorCaptured` is the
mechanism and the shell is the owner.

This is a contained change with its own payoff, independent of any trust story: today the global handler
(`main.ts:92`) learns about the error, and the user learns that the window is blank.

## The expensive half, when the trigger trips

**A process boundary for pack backends.** The shape VS Code uses, and the questions it forces here:

- **The bus crosses it.** `sendToSystem`, `broadcastToPlugin` and the envelope would become cross-process
  messages for pack systems. The envelope already carries `from`/`via` and the bus already routes on `to`,
  so the addressing survives; the synchronous assumptions do not.
- **EARS does not cross it.** Packs query and transact synchronously against an in-memory engine
  (`qx`/`tx`, *"synchronous, do NOT await"*). That is the hard constraint: an out-of-process pack cannot
  keep that API, and changing it changes every pack's data code. **This, not the process spawn, is what
  makes this expensive**, and any estimate that misses it is wrong.
- **Services cross it** as RPC, which is what `declared-capabilities.md` would already have made explicit.

## Verification

For the cheap half: a fixture pack whose component throws on render, asserted to leave the rest of the app
working and to name the pack. `tests/packs/external-pack` is the natural home.

For the expensive half, when it happens: a fixture pack that wedges (an infinite loop) and one that crashes,
with the app surviving both and reporting which pack. Neither is assertable today without the boundary.

## Risks

**The cheap half can hide a bug.** An error boundary that swallows a pack's failure into a quiet pane makes
a broken pack look merely empty. It has to report — `reportError` and the pack's record (`lastError`,
already the convention) — or it trades a loud failure for a silent one.

**The expensive half is a rewrite of the data contract, not an isolation feature.** Treat "packs run
out-of-process" as a goal with EARS at its centre, not as a hardening task.

## What this is not

- Not a security boundary against hostile packs. In-process JavaScript with access to the bound runtime is
  not contained by an error boundary, and saying otherwise would be worse than saying nothing.
- Not a replacement for `declared-capabilities.md`. That plan limits what a pack may *reach*; this one
  limits what its failure *costs*. They are different axes and the first is the one with present-tense value.
