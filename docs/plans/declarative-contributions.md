# What a pack contributes should be readable without running it

Compiled 2026-10-08 on `AS/one-action-cache`. **An inventory first, then a decision** — the work is not
designed yet because the split between declared and imperative has never been written down, and that split
is the whole question.

## Context

A pack contributes two ways.

**Declared**, in `abuddy.json` and compiled into each pack's built `snapshot.json` (`PACK_LAYOUT.snapshot`): features and their ids, designations,
system and plugin entries with their contracts, repositories, settings sections, the EARS entities and
relation kinds, the boot apply and its policy, dependencies and `hostVersion`.

**Imperative**, in the `PackRegistration` object the pack's runtime module exports
(`abuddy-sdk/src/framework/pack-registration.ts:64-80`): `steps`, `artifacts`, `blocks`, `content.writers`,
`services`, `repositories`, `migrations`, `ears`, `boot`. These are only knowable by **loading and
evaluating the pack's module**.

That split is not wrong — a step's implementation has to be code. The question is whether the *fact that a
pack contributes a step of type X* is declared, when only its implementation needs to be imperative. VS
Code's `contributes` is the reference: the manifest names the contribution, the code implements it, and the
host can list, index and lazily activate without executing anything.

## Why it matters, concretely

- **`lazy-activation.md` depends on it.** You cannot lazily activate what you can only discover by running.
  How much of a pack is declarative sets the ceiling on that plan.
- **Tooling reads a manifest, not a runtime.** Listing what an installed pack contributes, diffing two
  versions, or showing a user what they are about to install all require evaluating pack code today.
- **The host already wants it.** A pack's built `snapshot.json` exists precisely because some facts have to be
  readable without loading — it is the pattern, applied to part of the surface.

## Step 0 — the inventory

For each member of `PackRegistration`, one row: what it is, whether its *existence* could be declared with
its implementation left as a path (the way `features[].system.entry` already is), and what reads it.

The answer is likely to differ sharply by member. `steps` and `blocks` look declarable — a type name and an
entry path, which is the shape `abuddy.json` already uses everywhere else. `migrations` is an ordered list
whose `up()` is pure code. `ears` is already mirrored in the manifest. `boot.onInit` is a function by
nature.

**Write the table before designing anything.** The plan's value is mostly in that table: it says how much of
`lazy-activation.md` is reachable, and the two should be read together.

## The direction, after the inventory

For every member the table marks declarable: the manifest names it with an entry path, `generate-entries`
keeps building the same registration object from those paths, and the built `snapshot.json` carries the declared
set. Nothing a pack author writes gets harder — the manifest already names system, plugin, contract,
repository and service entries the same way, so this is the existing pattern extended rather than a new one.

The check that keeps it honest is the one this repo uses everywhere: the declared set and the registered set
must agree, derived from each, asserted. A pack registering a step its manifest does not declare should fail
`abuddy validate`, not be silently accepted.

## Verification

- `abuddy validate` fails a fixture pack that registers an undeclared contribution, and the message names
  it.
- The snapshot carries the declared set, and a reader can list a pack's contributions **without loading its
  runtime** — asserted by a test that never imports the pack's module.
- `npm run chain`, plus `schema:update` and `api:update` for the manifest surface.

## Risks

**This is a manifest migration, and the manifest is a published contract.** Every change here moves
`abuddy.schema.json` and `PACK_SNAPSHOT_FORMAT`, which is the version a host and a pack author's CLI agree
on (`abuddy-sdk/src/build/manifest.ts`). Doing it in one pass is better than several, which is an argument
for finishing the inventory before starting.

**Declaring something twice is worse than declaring it once imperatively.** If the manifest names a step and
the registration also carries one, they can disagree. The derivation has to be one-way — the manifest names
it, codegen builds the registration from it — or the check above has to be the thing that cannot be skipped.

## What this is not

- Not a change to how contributions *work* at runtime; the registration object stays the interface the host
  consumes.
- Not a prerequisite for `declared-capabilities.md`, which gates a different thing (what a pack may reach)
  and should not wait for this.
