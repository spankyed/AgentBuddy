> **Done and closed.** A migration is declared under a version line in its pack's `apack.json` —
> `migrations.app` or `migrations.pack`, keyed by the version it targets — and the runners read one map
> each (`packMigrationTargets(line)`), so neither asks where a pack came from. `shippedPacks()` keeps the
> one consumer that is genuinely about shipping (`migrations/app/0.3.15.ts`'s `PluginOwners.shipped`).
>
> **Five of the plan below were falsified before implementing, and it is kept for the design rather than
> the mechanism.** What was wrong: a pack never writes `target` (it was already the manifest key, so the
> ambiguous field was gone and only the *line* was missing); provenance routing was in **two** places, not
> one (`migrations/index.ts` and `packMigrationTargets`' `!o.shipped` filter); `shippedPacks()` keeps a
> consumer and was not deleted; **no files moved** — the change is manifest plus codegen, and
> `default-setup/src/migrations/` has no `index.ts` to list anything in; and `appMigrations` was already
> taken by the host's own list, which is why the shape is nested (`migrations.app`) rather than the two
> sibling registration fields proposed here.
>
> Two further corrections the work found. The lines are **one method with a `line` argument**, not two
> accessors, so a call site must name the line and the pair cannot drift. And the answer is **every pack in
> dependency order** with the migrations it declared on that line, which means a registered pack whose
> origin carries no manifest is in neither answer — the loader gives every origin one, and three fixtures
> without one were packs whose migrations nothing would have run.
>
> The text below is the plan as written.

# A migration says which version line it is on

## Context

A pack declares `PackMigration { target, description, up }` (`apack-sdk/src/framework/pack-registration.ts:10`).
`target` is a bare version string and **says nothing about which version it is a version of** — so the
*runner* decides, from the pack's provenance:

- `runAppMigrations` (`apack-host/src/migrations/index.ts:65`) takes `registry.shippedPacks()`' migrations
  and runs them against the **app's** version, recording `AppState.version`.
- `runPackMigrations` (`:82-99`) takes an external pack's migrations and runs them against that **pack's**
  manifest version, recording `AppState.packVersions[id]`.

So the same field means two different things depending on who shipped the pack, and nothing in the
declaration says which. That is the whole of the fusion.

**What it looks like in the tree today.** `packages/default-setup` declares `version: 0.1.0` in both its
manifest and its `package.json`, and its migrations are `0.3.0.ts`, `0.3.1.ts`, `0.3.14.ts`, `0.3.15.ts`
against an app at `0.3.14`. They are app migrations living in a pack's folder, and they work — because
shipped-ness routes them to the app's line, which is the line they were named for. The pack's own version is
decorative: nothing compares anything to `0.1.0`.

**The state is already unfused; only the declaration is not.** Two runners, two recorded lines
(`AppState.version`, `AppState.packVersions`), two correct behaviours. The missing piece is a migration
being able to say which of them it belongs to, instead of being told by where its pack came from.

**Why this is worth writing down now rather than fixing now.** The pack-replacement work
(`apack replace <id>`, a user's fork at a shipped id) makes provenance-based routing reach a third party:
a fork at `default-setup`'s id is shipped *by id membership*, so a fork author's migrations would run
against the **app's** version. Naming files after their own pack version, `1.0.0.ts` would never run
(1.0.0 > app 0.3.x) and `0.2.0.ts` would run instantly. Silently wrong, and inherited rather than ours.

That work's stopgap is to route on ownership rather than id membership, which keeps the confusion in-house.
**This plan removes the need for that stopgap**: once a migration declares its own line, routing stops
guessing from provenance at all.

## The shape

**Two lists on the registration, not a field on each migration.**

```ts
interface PackRegistration {
  /** Migrations on this pack's own version line (`manifest.version`) */
  migrations?: PackMigration[];
  /** Migrations on the app's version line — for a pack whose data moves when apack moves */
  appMigrations?: PackMigration[];
}
```

**Why two lists rather than `line: 'app' | 'pack'` on each entry.** A per-entry field needs a default, and
whichever default it takes becomes the next silent fusion — exactly how this one arrived. Two lists make the
wrong line unrepresentable at the call site rather than defaulted into.

**Routing stops reading provenance.** `runAppMigrations` runs every registered pack's `appMigrations`;
`runPackMigrations` runs every registered pack's `migrations`. Neither asks who shipped the pack. The
recorded lines are unchanged, so nothing about the stored state moves.

**`shippedPacks()` loses its only consumer**, which is the point: provenance stops deciding behaviour and
goes back to describing origin.

## What does not change

- **default-setup's seven files move to `appMigrations` verbatim.** They are app-targeted, they are named
  for app versions, and they run on the app's line before and after. Byte-identical behaviour.
- **Every external pack's migrations stay `migrations`**, on their own version line, as today.
- **Both recorded lines keep their meaning**, so no stored-data migration is needed to land this.
- **The prerelease and development-build rules** (`runAppMigrations`' "a prerelease counts as its release",
  "a development build runs every pending migration on every boot") are properties of the app line and
  stay with `appMigrations`.

## Risks and the awkward parts

- **A pack can now declare both**, and the two run at different times — `runAppMigrations` before
  `runPackMigrations`, both inside `startPacks()`. A pack splitting one logical change across both lines
  gets an ordering it probably did not intend. Worth a sentence in the pack-author docs rather than a check.
- **`appMigrations` on an external pack is a real capability**, not a mistake to refuse: a pack whose data
  shape follows apack's rather than its own has a legitimate reason to use it. But it is also a way for
  a third party to put code on the app's version line, so it deserves a deliberate yes rather than arriving
  by default.
- **default-setup's decorative version stays decorative** until it declares a `migrations` entry. That is
  the next question after this one, not part of it.
- **The migrations guide** (`apack-host/src/migrations/CLAUDE.md`) tells default-setup authors to name a
  file after "the next release version", meaning the app's. That advice becomes specific to `appMigrations`
  and needs its counterpart written.

## Out of scope, deliberately

- Fixing default-setup's `0.1.0` — whether the shipped pack should version with the app or on its own line
  is a product question, and this plan is correct either way.
- Anything about *when* migrations run, how failures are recorded, or the retry rules. Only the declaration
  moves.
- The pack-replacement work. These two plans touch the same routing code and this one subsumes that one's
  stopgap, so whichever lands second should delete the other's workaround rather than keep both.

## Verification

```bash
npm run spec -- migrations          # the runner specs, which already cover both lines
npm run typecheck
npm run chain
```

The case that matters is the one that proves routing stopped reading provenance: an **external** pack
declaring `appMigrations` must have them run against the app's version, and a **shipped** pack declaring
`migrations` must have them run against its own. Both are impossible to express today, which is why neither
has a case.
