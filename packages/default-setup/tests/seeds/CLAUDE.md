# Seed parity (`tests/seeds/`)

## What this is

Seeding is the step that writes a pack's shipped content — notes, library documents, 69 actions, 6 prompts, flows —
into a user's database, and then *keeps doing it* on every upgrade without destroying what the user changed. That
second half is the hard part, and it is what these specs exist for.

They compile default-setup's real seed sources, import them into a scratch database the test discards — never the
user's — and compare the rows that ended up there against a committed snapshot in `__golden__/`. One question: **does seeding still produce
the database it produced before?**

The goldens were first recorded from the pipeline that preceded the generic seed compiler, which is why they are a
recording rather than hand-written expectations. See `docs/public-facing/seeds.md` ("The four stages") for the
vocabulary — *seed* is the content, *import* is the act — and `src/seeds/CLAUDE.md` for authoring.

## The specs

| Spec | What it holds |
|---|---|
| `seed-parity.spec.ts` | the gate itself: fresh seeds and re-seeds in each import mode, against `__golden__/` |
| `edited-rows.spec.ts` | a row the **user edited** survives a seed change — the seeder skips it |
| `edited-flows.spec.ts` | the same for flows, matched by seed key rather than label |
| `notes-change-tracking.spec.ts` | notes' own change-tracking rules (goal-generic-seed-compiler Decision 10) |
| `dependent-pack.spec.ts` | another pack seeding through *default-setup's* formats and hooks gets the same rows |
| `harness.ts` | compiles, seeds, and snapshots rows with ids and timestamps normalized |

## What goes in the golden, and what must not

This is the part that is easy to get wrong twice, so the rule is explicit:

**Record what a deliberate change moves. Leave out what any change moves.**

| Field | In the golden? | Why |
|---|---|---|
| `label`, `description`, `category` | yes | move only when someone means them to |
| `input` / `inputs` (the parameter schema) | yes | a contract; a silent change to it is exactly what this should catch |
| relations, media, counts, display order | yes | the shape seeding produced |
| `actionFn` / `templateFn` (compiled body) | **no** | changes on every edit to the source |
| `sourceHash` (value) | **no** | hashes the compiled bundle, so it changes with the body — *and* with a bundler or TypeScript upgrade where nothing was edited |
| `sourceHash` (presence, as `hasSourceHash`) | yes | see below |

`seed-parity.spec.ts`'s `forGolden` records an action or prompt **by exclusion** — everything except the two volatile
fields — so a field added to an action later is covered without anyone remembering to add it.

### Why presence but not value

A row with **no** `sourceHash` is the user's for good: the seeder skips an existing row that has none as user-owned
(`@abuddy/sdk/src/seed/seeder.ts`, "skipped (edited)"). So whether a hash is there is the difference between
"seeded" and "hands off", which is parity. Which hash it is, is the compiler's business. One row in the goldens
records `false` — `Action:Set Instructions` in the `untracked` scenario — and that row is the reason the field
exists.

### Why the volatile fields were removed

They made this a build-output lock wearing a parity test's name. An action inlines its `_helpers/` at compile time,
so **editing two helper files once moved 47 of 62 rows** — for a change that was a `\/` → `/` in a regex. A test
that fails on every correct change stops being read; you re-record reflexively and the signal is gone.

What the exclusion does *not* cover is that the compiler emitted a usable body at all, which the old whole-row
digest covered by accident. `compiled-bodies.spec.ts` beside it covers it directly instead: every action and prompt
has a non-empty body that parses. That check is stable under content changes and catches the failure that is
otherwise silent — the seed imports, the row looks right, and the action dies when a flow reaches it.

## When the golden legitimately moves

Any change to what seeding *produces*: a new or removed action, a renamed label, an edited description or parameter
schema, a change to the seeder or a format.

```bash
npm run seed-parity:check  -w @app/default-setup    # compare
npm run seed-parity:update -w @app/default-setup    # re-record, deliberately
```

Re-recording rewrites a **test expectation**. It changes no user data and needs no migration. What reaches users is
a new `sourceHash` from the compile stage, and the seeder updates only rows the user never edited — so read the
diff, confirm it is the change you meant, and commit it with the change that caused it. Never hand-edit a golden.

Note the split: the `v1`/`v2` scenario goldens seed fixture sources in `packages/default-setup/tests/_support/fixtures/`, so
only a change in *seeding* moves them. `default-setup.json` follows the pack's own sources, so it also moves when
content does.

## Why the goldens are hand-rolled, and stay that way

`checkGolden` reads and writes the files itself, switched by `UPDATE_SEED_GOLDEN`. Vitest's own
`toMatchFileSnapshot` + `-u` would replace that, and was considered and declined. The reasons, so it isn't
re-raised:

- **It would lose a check.** Vitest computes `updateSnapshot` as `isCI && !UPDATE_SNAPSHOT ? 'none' : UPDATE_SNAPSHOT
  ? 'all' : 'new'`. This repo's CI is off on purpose, so `isCI` is false and the mode is `'new'` — a *missing*
  snapshot is written and the test passes. The explicit `existsSync` assertion above fails instead, which is what you
  want when a scenario is added and nobody recorded its golden. Keeping that under `toMatchFileSnapshot` needs a flag
  or a config knob, which is the custom code the swap was meant to delete.
- **It would be the only one.** No spec in this repo uses vitest snapshots, while five recorded artifacts (`api`,
  `facade`, `exports`, `schema`, and these) share one shape: a committed file and a `<artifact>:check`/`:update`
  script pair. A framework-owned mechanism here would be a sixth thing to learn, not a convention joined.
- **The diff is already better than a snapshot's.** These are committed files, so the readable diff is `git diff`
  after re-recording — which is the documented workflow. A failure message only has to point at it, and it does.
- **The format is load-bearing.** `notes-change-tracking.spec.ts` reads these files as input data, so a swap would
  have to write byte-identical JSON through a pre-serialized string, giving up the serializer that is the reason to
  switch.

One inconsistency is real and forced: the four sibling artifacts take a CLI flag (`--check`, `--local`) and this one
takes an environment variable, because vitest owns `argv`. `seed-parity:update` hides that, so the flag convention
holds at the script level where it is read.
