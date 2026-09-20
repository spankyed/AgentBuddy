> **Written in session** `358d44db-c4f3-4dfe-89d3-40b001a63086` (Claude Code, 2026-09-19), from a review of
> the notes left by `AS/external-pack-authoring`. Resume it with `claude -r 358d44db-c4f3-4dfe-89d3-40b001a63086`.

```
# Goal: `defs` names one concept

Implement docs/goals/goal-defs-naming.md on the current branch. Read Background,
Decisions, Open decisions, Phases and Constraints first. Decisions are final: implement them, don't reopen
them or stop to ask. Open decision 1 must be settled with the user before Phase 2; if it is still marked
open when you reach it, stop and ask.

Where a detail isn't specified, pick the conventional option, note it in the final summary, and keep going.
No backward compatibility in code: change signatures, move modules, migrate every in-repo caller, test,
fixture, template and doc in the same change, and fix forward. Stored user data is the exception: it moves
with migrations. Nothing here is stored user data.

Finished when:
- Phases 1-3 are implemented and each meets its "Done when"; every new guard or test is mutation-checked.
- `defs` names exactly one thing in the tree: a pack's DSL type definitions (`src/defs/`, `dist/defs/monaco/`).
  The facade bundle is `facades` everywhere — the snapshot field, the cache directory, the constant.
- A dependency built before the rename fails a dependent's build with a message naming the remedy, and is
  never silently read as an untyped dependency.
- `npm run typecheck`, `npm run test:unit`, `npm run schema:check -w @abuddy/sdk`, `npm run api:update` (and
  the committed `etc/`), `npm run build`, `npm run test:external-pack`, `npm run test:packaged-authoring`.
- A final summary: phase -> done, evidence, the conventional choices made.

Commit as you go: commit each phase when its "Done when" holds and the checks are green, not once at the
end. Conventional message, no attribution lines.
```

# Goal: `defs` names one concept

## Background

`defs` names three things. Two are one concept at two stages; the third is unrelated and is the one to
rename.

| Sense | Where | Verdict |
|---|---|---|
| A pack's **DSL type definitions**, as source | `src/defs/{action,database,prompt}.ts`, `abuddy.json` `dsl[].entry` | keep |
| The same, built for the editor | `DEFS_DIR`, `bundleDslDefs`, `dist/defs/monaco/<name>-defs.d.ts` | keep |
| The **facade bundle** a pack publishes for its dependents | `PackSnapshot.defs`, `PACK_TYPES_DEF`, `.abuddy/deps/<id>/defs/pack-types.d.ts` | **rename** |

The third is the intruder, and the repo has already named it everywhere else: `facade-gate.ts`,
`facadeProblems`, `facade:check`/`facade:update`, `bundlePackTypes`, `PACK_TYPES_FORMAT`,
`etc/pack-types.api.md`, and the error text "this CLI generates facade format N". `defs` is the last place
it is called something else. One line in `abuddy-sdk/src/build/manifest.ts` holds the whole collision:

```ts
/** The facade shape this pack's `defs` are in (`PACK_TYPES_FORMAT` when it was built) */
```

`snapshot.types` is already the entity and relation-kind manifest, so `facades` is free.

This is the same shape as `goal-pack-naming.md`'s `registry`, `bundle`, `artifact` and `contributions`: a
word doing two jobs, where one job already has a better word. That goal's lesson applies here too — its
phase greps read zero while three leftovers stood, because they searched for retired *names* and the
leftovers were prose, a key and a parameter. Phase 3 below is written against that.

### Why it is worth doing now

Reviewing the notes for this branch, I spent several exchanges establishing that
`.abuddy/deps/<id>/defs/pack-types.d.ts` is not `dist/defs/monaco/*.d.ts`. The question was reasonable and
the answer was not obvious from the names. That is the cost the rename removes.

## Decisions

1. **The facade sense is renamed; the DSL sense keeps the word.** Every other name for the facade already
   says facade or pack types, and the DSL sense is internally consistent from `src/defs/` to
   `dist/defs/monaco/`. Renaming the DSL sense would be the larger change for the weaker reason.
2. **`facades`, not `packTypes`.** It matches `facade-gate.ts`, `facadeProblems` and `facade:check`, and it
   reads as a plural of things the pack publishes, which is what the field holds.
3. **No compatibility read.** Nothing has shipped: no git tag contains the pack machinery, so no snapshot
   with the old field exists outside a checkout's build output and `.abuddy/deps` caches, both regenerated
   on demand. The code never reads `defs` as a fallback.
4. **The cache directory follows the field.** `.abuddy/deps/<id>/defs/` -> `facades/`. It is a cache, not a
   format: `cacheDep` rewrites it and `abuddy clean` removes it.

## Open decisions (settle with the user)

1. **What a pre-rename dependency does to a dependent's build.** Today a snapshot without
   `defs[PACK_TYPES_DEF]` is *skipped*, not rejected:

   ```ts
   if (!snap.defs?.[PACK_TYPES_DEF]) continue;
   const typedDeps = [...].filter(([, snap]) => snap.defs?.[PACK_TYPES_DEF])
   // "Dependencies built with facade types (older snapshots have none, so their types stay untyped)"
   ```

   After the rename every old snapshot takes that path, so a stale sibling or `.abuddy/deps` cache makes a
   dependency **silently untyped** rather than failing. That is the failure mode this repo has already been
   bitten by once, recorded in the rollup spike: "Packs with looser code get no error at all, just silently
   lost typing."

   The existing comment argues deliberately that the gate should be the exports, not `typesFormat`, because
   a format number is a bad proxy for export drift. That argument holds for drift and does not cover a
   container rename, where nothing is missing — the whole field moved.

   - **A. Bump `PACK_TYPES_FORMAT` to 2 and gate on it.** A dependency whose `typesFormat` is absent or
     lower fails with the existing rebuild remedy. Costs: the "older snapshots stay untyped" allowance goes,
     which is only reachable for packs built before facades existed — none outside a checkout.
   - **B. Leave the gate on exports and accept silent untyping** for a stale dependency until it is rebuilt.
     Cheapest, and consistent with the recorded rationale; the cost is a dev-loop footgun with no message.
   - **C. Require the field.** Treat a snapshot with neither `facades` nor a recorded format as malformed
     and throw. Strictest, and it removes the untyped-dependency concept entirely.

   This must be settled before Phase 2.

## Phases

### Phase 1 — the snapshot field

- `PackSnapshot.defs` -> `facades` (`abuddy-sdk/src/build/manifest.ts`), and the doc comment that currently
  uses both words.
- `PACK_TYPES_DEF` -> `PACK_TYPES_FACADE` (`abuddy-sdk/src/build/manifest.ts`, re-exported from
  `build/index.ts`).
- Writers and readers: `abuddy-cli/src/commands/build.ts` (the local `defs` record and the snapshot write),
  `fetch-deps.ts` (`cacheDep`, and `defCount` -> `facadeCount` in the printed summary),
  `abuddy-sdk/src/build/generate-entries.ts` (`requireFacadeExports`, `typedDeps`, `emitDepTypes` if it
  still exists — see Deferred).
- Specs asserting `snapshot.defs['pack-types']`: `dep-types-version`, `dependency-graph`, `facade-typing`,
  `generate-entries`.

**Done when:** `git grep -n "\.defs\b\|PACK_TYPES_DEF" -- 'packages/**/src/**' 'packages/**/tests/**'` finds
only the DSL sense; `npm run typecheck` and `npm run test:unit` pass.

### Phase 2 — a pre-rename dependency fails loudly

Implement Open decision 1. Whichever option is chosen, the end state is a test that builds a dependent
against a snapshot in the old shape and asserts the outcome the decision names — a named failure under A or
C, a recorded and asserted silence under B.

**Done when:** that test exists and is mutation-checked; the message (under A or C) names the pack and the
remedy.

### Phase 3 — the cache directory, the docs, and keeping it retired

- `.abuddy/deps/<id>/defs/` -> `facades/` in `cacheDep` and `resolveFromLocal`.
- Docs: `abuddy-cli/CLAUDE.md`, `abuddy-sdk/CLAUDE.md`, `docs/public-facing/architecture.md`, and any
  sentence that uses `defs` for the facade.
- A guard is **not** the tool here. `defs` stays a live word for the DSL sense, so a name list cannot
  separate the senses — the limitation Decision 7 of `goal-naming-conventions.md` records.
  Instead: a spec asserting `PackSnapshot` has no `defs` key and that `cacheDep` writes `facades/`. That is
  checkable and cannot fire on the DSL sense.

**Done when:** `git grep -ni "defs"` outside `dist/` returns only the DSL sense and that spec; the spec
fails when the field is renamed back.

## Deferred

- **The `emitDepTypes` deletion is a separate task and should land first.** `.abuddy/generated/types.ts` is
  written by `abuddy generate`, re-exports four names from the cache, and is imported by nothing — the
  scaffolded tsconfig compiles it, so it can only fail, never help. Removing it deletes two of this goal's
  call sites and the only consumer of the cache as program input. Tracked separately.
- **Renaming the DSL sense** (`dist/defs/monaco/` -> `dist/monaco/`). Not needed once the facade sense is
  gone, and it touches the renderer's imports.

## Constraints

Never, unless the user asks in this session:
- commit, stage, push or tag;
- publish anything, or trigger a workflow;
- open, copy or modify `~/Library/Application Support/abuddy*`, or any real data dir.

Always:
- mutation-check every new guard or test: break the thing on purpose, watch the right test fail, restore
  from a copy rather than `git checkout`, and confirm the tree is clean afterwards;
- run the narrowest check that could fail during the work, and the full chain once before asking for a merge;
- run `npm run api:update` and commit `etc/` if a published export changes — a JSDoc edit moves the stamp too.
