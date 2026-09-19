# Goal: the packs directory is what's installed

> **Written in session** `358d44db-c4f3-4dfe-89d3-40b001a63086` (Claude Code, 2026-09-19). Resume it with
> `claude -r 358d44db-c4f3-4dfe-89d3-40b001a63086`.

```
# Goal: the packs directory is what's installed

Implement docs/goals/goal-installed-packs-record.md on `AS/external-pack-authoring`.

Where a detail isn't specified, pick the conventional option following best practices, note it in the final summary, and keep
going. No backward compatibility in code: change signatures, move modules, migrate every in-repo caller,
test, fixture, template and doc in the same change, and fix forward. Stored user data is the exception:
it moves with migrations — though this goal needs none (Decision 9).

Several phases delete tests written in the session above. That is intended: they pin behaviour this goal
removes. Delete them and say so in the summary; don't preserve them out of caution.

Finished when:
- Phases 1–7 are implemented and each meets its "Done when"; every new guard, helper or test is
  mutation-checked.
- `reconcileInstalledPacks`, `ensureInstalledPack`, `InstalledPacksRecord`'s `found` discriminant and
  `recoverStagingDirs`'s installed-ids parameter no longer exist anywhere in the tree.
- No module outside `packages/abuddy-host/src/packs/installed-packs.ts` reads or writes the record's
  file shape: no `entries.map`, no read-modify-write, no `addInstalledPack`/`removeInstalledPack` at a
  call site.
- A pack present in `packs/<id>/` is listed as installed whether or not the record mentions it, and a
  failed write of a decision is reported as the decision that was lost.
- `npm run typecheck`, `npm run test:unit`, `npm run build`, `npm test`, `npm run test:external-pack`
  and `npm run test:packaged-authoring` pass.
- A final summary: phase → done/deferred, evidence, and the conventional choices made.

Commit as you go:
- Commit each phase when its "Done when" holds and the checks are green — not once at the end. A phase
  is landable on its own; a commit is how that stays true. Conventional message, no Co-Authored-By or
  session lines, `git commit -- <paths>` naming only that phase's files.
- Check `git diff --cached` first: something outside the session stages files, and a pathspec commit
  leaves the rest of the index alone.
- Don't push, tag, or open a PR unless the user asks.

Never:
- push, tag or open a PR unless the user asks in this session.
- npm publish, create GitHub releases, or trigger workflows (dry runs only).
- open, copy or modify ~/Library/Application Support/abuddy* or any real data dir.
- pkill/killall Electron or node; launch the app outside the test env without an isolated
  ABUDDY_USER_DATA_DIR.
- run bare tsc on packages/preload, `npm install` in the example pack, or edit version/release metadata.
- change the typed EARS types' behaviour (packages/abuddy-sdk/TYPED-EARS.md) to make a call site compile.
- add backward-compat shims or loosen a failing assertion instead of investigating.
- change the on-disk file name or its top-level `{ packs: [...] }` shape (Decision 9).
```

## Background (2026-09-19, at `18b068a18` on `AS/external-pack-authoring`)

`installed-packs.json` is modelled as a **mirror** of what is installed. Every path that changes reality
has to remember to update the mirror, in the right order, with the right merge semantics — and a missing
row is indistinguishable from "this pack is not installed". That single modelling choice is the cause of
every divergence found in the session above.

### The field survey

| Field | What it is | Derivable from `packs/<id>/`? |
|---|---|---|
| `id` | the row's key | the directory name |
| `name`, `version` | copies of the manifest | **yes** — `discoverPacks` reads it |
| `dir` | copy of the install path | **yes** — `path.join(packsDir, id)` |
| `enabled` | the user's choice | no |
| `installedFrom` | where the install came from | no |
| `installedAt` | when it was placed | no |
| `lastError` | the last seed's outcome | no (history) |
| `availableVersion`, `availableTag`, `updateCheckError` | the last update check | no (remote state) |

Three fields of ten are copies. They are the only ones the directory can already answer, and they are
what makes the row look like a list rather than a side table.

### The design already exists in this repo

`packages/abuddy-host/src/database/schema.ts:70-84` — the path `abuddy db` uses on a data dir the app is
**not** running on — gets it right:

```ts
const disabled = disabledPacks(installedPacksFile);   // reads only `enabled === false`
return discoverPacks(packsDir).filter(…not disabled); // the directory is the list
```

Its comment says it outright: *"the app registers a pack it hasn't listed yet as enabled"*.
`checkDependencies` (`pack-installer.ts`) does the same, testing
`fs.existsSync(packsDir/<id>/abuddy.json)`. Two of the three consumers already treat the directory as the
list. The app's own runtime path is the one that mirrors, and the one that keeps breaking.
`pruneHostPackOutputs` (`pack-layout.ts`) is the same shape for `host-packs/`: derive, then prune what the
build no longer ships.

### What the mirror model has cost

| Symptom | Fixed at | Why it happened |
|---|---|---|
| Packs view empty while a pack ran | `e14ed7767` | `reloadExternalPack` loaded a pack, wrote no row |
| A first reload's seed failure dropped | `6d7f94714` | the seed wrote onto a row that did not exist yet |
| Toggle losing the user's click | `e7e906c74` | `entries.map` over a record with no row |
| Staging deleted a pack's only copy | `e007d8021` | "record lists none" read as "nothing installed" |
| Two readers differing only in the absent case | `1d6cf3226` | same ambiguity, one layer up |
| **`installedFrom` lost on an out-of-app reinstall** | **open** | see below |

The last one is live and documented as a gotcha in `packages/abuddy-host/CLAUDE.md:214`:
`reconcileInstalledPacks` rebuilds a row whose `version` or `dir` changed from only
`id, name, version, dir, enabled`, so `installedFrom` and the update cache are destroyed. An
`abuddy install` outside the app therefore makes the pack **stop offering updates** at the next boot,
silently. It exists only because the row duplicates `version` and `dir` and reconcile rewrites it.

### Readers and writers today

Readers (8): `schema.ts:70`, `pack-updater.ts:103,161`, `pack-discovery.ts:91`, `staging.ts:119`,
`runtime/activation-outcome.ts:11`, `runtime/packs-system.ts:143,263,360`.

Writers: `writeInstalledPacks` / `updateInstalledPacks` / `addInstalledPack` / `removeInstalledPack` /
`ensureInstalledPack` (`installed-packs.ts`), plus in-place merges at `runtime/seed.ts:53`,
`pack-updater.ts:148`, `runtime/packs-system.ts:169,240,291,378`, and the boot rebuild in
`pack-discovery.ts:86`.

`writeInstalledPacks` logs a failed write and returns; no caller can tell (`installed-packs.ts:71`).

### The invariant nobody owns

"A loaded pack has a row" is maintained by convention at each site: install writes the row before
`activatePack`, boot reconciles before `startPacks`, and the reload was taught to in `e14ed7767`. Nothing
enforces the ordering — it was broken inside the very commit that introduced it, and again one call
earlier in `recordSeedOutcome`. Under Decision 1 the invariant is not needed, so it cannot be broken.

### Staging's use of the record

`recoverStagingDirs(dir, installed)` restores an orphaned `.previous` unless the caller says the pack is
not installed. `.previous` is created in exactly two places — `pack-installer.ts:178` (`placePack`) and
`pack-layout.ts:298` (`publishHostPackOutput`, which passes `{ known: false }` regardless) — and
`placePack` deletes it on success and on a failed rename. So a surviving `.previous` means a crashed
install. For the guard to change the outcome the pack must also be absent from the record, which needs a
*successful* uninstall; `uninstallPack` throws when `packs/<id>` is missing, and a crashed install has
already moved it aside. The state the guard defends looks unreachable without hand-editing the file.

### Wide survey: neighbouring state keyed by pack id

- `AppState.packVersions` and `AppState.packSeedHashes` are never pruned when a pack is uninstalled
  (`app-state/index.ts:22-24`, written at `migrations/index.ts:90` and `runtime/seed.ts:106`). A pack
  uninstalled and reinstalled therefore skips its seed. The pack's *entities* survive an uninstall —
  `uninstallPack` deletes only the directory — so the end state is usually the same, but nothing records
  that as the intent, and the maps grow without bound. Deferred.
- `pack-dev-servers/<packId>.json` is written by `abuddy dev` and removed by it on exit
  (`abuddy-cli/src/commands/dev.ts:149,152`). A crashed `abuddy dev`, or an uninstall while it runs,
  leaves a marker naming a dead port that the `pack://` handler will still try to proxy to. Deferred.
- `_loadedPacks` (`runtime/loaded-packs.ts`) and the registry's registrations are two in-memory lists of
  the same packs. Same mirror shape, one level up, in memory. Deferred.

## Decisions

Final.

1. **The packs directory is the list; the record is a side table keyed by pack id.** A pack present in
   `packs/<id>/` is installed. A row is optional decoration, and its absence is a defined state per
   field, never "not installed".
2. **The row holds only what the directory cannot say:** `enabled`, `installedFrom`, `installedAt`,
   `lastError`, `availableVersion`, `availableTag`, `updateCheckError`. `name`, `version` and `dir` are
   deleted from it; every consumer takes them from discovery. This is what makes the loss of
   `installedFrom` impossible: there is nothing for a rebuild to rewrite.
3. **Absent means:** `enabled` → true (matching today's reconcile, and `schema.ts`'s comment); every
   other field → undefined. No caller repeats these defaults; one accessor applies them.
4. **`reconcileInstalledPacks` is deleted.** Boot filters `discoverPacks()` by the disabled set, through
   the same function `schema.ts` uses. There is no rebuild, because there is nothing to rebuild.
5. **`ensureInstalledPack` is deleted**, with its call in `reloadExternalPack` and the ordering constraint
   it created. Nothing has to remember to create a row when a pack appears.
6. **Writes are named intentions, not merges.** `installed-packs.ts` exports one function per thing the
   app decides or learns — set enabled, record the install source, record a seed outcome, record an
   update check, forget a pack — and nothing outside it reads or writes the file's shape. No call site
   maps over rows, and the `map`-versus-upsert judgement disappears with the merges.
7. **A failed write is reported as the decision that was lost**, not as a log line about a file. Writes
   are decisions now, so "couldn't save that this pack is disabled" is a statement the caller can make.
8. **Staging stops consulting the record.** An orphaned `.previous` is always restored; the installed-ids
   parameter and its `InstalledIds` type are deleted. Restoring is the safe direction, and deleting was
   the original bug (`e007d8021`).
9. **No migration, and no format change.** The file keeps its name and its `{ packs: [ { id, … } ] }`
   shape. Old files already carry every field the new reader wants; new writers simply write fewer. Old
   and new readers each tolerate the other's files, so this is compatible in both directions by
   construction — and a test pins that.
10. **Naming.** `InstalledPack` becomes `PackRecord`: it is what the app has recorded about a pack, not
    the pack itself. The accessor reads `packRecord(id)`.

## Phases

### Phase 1 — one derivation, shared with `abuddy db`

- Extract the derivation `schema.ts:81` already performs into one exported function: the discovered packs
  minus those a row disables, taking the paths it needs so both an app and a tool can call it.
- `loadExternalPacks` (`runtime/loader.ts:287`) uses it instead of `reconcileInstalledPacks`'s return
  value. Leave `reconcileInstalledPacks`'s writes in place for now; Phase 2 deletes them.

**Done when:** boot and `schema.ts` derive the enabled external packs through one function; a pack in
`packs/` with no row loads at boot. `npm test -w @abuddy/host` and
`npx vitest run tests/database --root packages/abuddy-host` pass. Mutation: making the shared function
ignore the disabled set fails a spec that a disabled pack does not load.

### Phase 2 — the row stops copying the directory

- Delete `name`, `version` and `dir` from the record type (Decision 2) and rename it `PackRecord`
  (Decision 10). Consumers take those from discovery.
- Delete `reconcileInstalledPacks` and its spec (Decision 4), and the gotcha it caused from
  `packages/abuddy-host/CLAUDE.md:214`.

**Done when:** `reconcileInstalledPacks` exists nowhere; `PackRecord` has no `name`/`version`/`dir`;
`packages/abuddy-host/CLAUDE.md` no longer documents the lost-`installedFrom` gotcha. A new spec: a pack
installed out of the app, whose version then changes, keeps its `installedFrom`. Mutation: restoring a
rebuild that rewrites the row from the manifest fails that spec.

### Phase 3 — a missing row is a defined state

- `readInstalledPacks` returns the rows; the `found` discriminant goes (Decision 3). One accessor,
  `packRecord(id)`, applies the absent-value defaults.
- Delete `ensureInstalledPack` and its call in `reloadExternalPack` (Decision 5).
- `activation-outcome.ts`, `packs-system.ts` (×3) and `pack-updater.ts` (×2) become row lookups over the
  derived list.
- Delete the tests that pin the removed behaviour: `reload.spec.ts`'s "records a pack it is the first to
  load", "leaves an existing entry alone" and "records a first-time pack's seed failure" — the first two
  describe machinery this phase removes, and the third's ordering constraint no longer exists.
  `tests/fixtures/external-pack/tests/e2e/dev-reload.spec.ts` keeps its second half (the pack comes back
  up) and drops the record assertion.

**Done when:** `ensureInstalledPack` and `InstalledPacksRecord` exist nowhere; a pack running with no row
appears in `PACKS_LIST` as enabled; `npm test -w @abuddy/host` and `npm run test:external-pack` pass.
Mutation: making `packRecord` default `enabled` to false hides a running pack and fails that spec.

### Phase 4 — writes are intentions

- One exported function per decision or observation (Decision 6). `updateInstalledPacks`,
  `addInstalledPack` and `removeInstalledPack` stop being exported.
- Migrate `runtime/seed.ts:53`, `pack-updater.ts:148` and `runtime/packs-system.ts:169,240,291,378`.
- Delete `recordSeedOutcome`'s "could not record" warning: with no row required, there is nothing to fail
  to find.

**Done when:** a guard spec asserts that no file outside `installed-packs.ts` names
`addInstalledPack`, `removeInstalledPack` or `updateInstalledPacks`; `npm run test:unit` passes.
Mutation: reintroducing a `map`-based write in `packs-system.ts` fails the guard.

### Phase 5 — a failed write names the lost decision

- The write path reports failure to its caller, and the enable/disable path says which decision was not
  saved (Decision 7). Boot and background writes log; a user action surfaces it.

**Done when:** a spec with an unwritable record shows the enable/disable path reporting the lost decision
rather than appearing to succeed; `npm test -w @abuddy/host` passes. Mutation: swallowing the write
failure again fails that spec. **Closes action item 1a.**

### Phase 6 — a pack that is gone

- Uninstall forgets the row. A row naming a pack that is not in `packs/` is pruned on the next write, as
  `pruneHostPackOutputs` prunes host output.
- A *failed* uninstall leaves the directory, so the pack stays listed and enabled — correct by
  derivation, with nothing to roll back.

**Done when:** a spec shows a failed uninstall leaving the pack listed (because it is still installed) and
a successful one leaving no row; rows for absent packs do not accumulate. Mutation: skipping the prune
fails the accumulation spec. **Closes action item 1b.**

### Phase 7 — staging stops consulting the record

- Delete `recoverStagingDirs`'s installed-ids parameter and the `InstalledIds` type (Decision 8);
  `prepareHostDataDirs` stops reading the record.
- Record the reasoning from Background in the function's doc comment: `.previous` survives only a crashed
  install, and restoring is the safe direction.

**Done when:** `recoverStagingDirs(dir)` takes one argument; `InstalledIds` exists nowhere; an orphaned
`.previous` is restored whatever the record says; `npx vitest run tests/packs/staging.spec.ts --root
packages/abuddy-host` and `npx vitest run tests/unit/boot-recovery.spec.ts --root packages/api` pass.
Mutation: deleting rather than restoring an orphaned `.previous` fails both boot-recovery specs.

## Outcome (2026-09-19, at `908a3b1cf`)

Done. Phases 1–7 landed as six commits — Phases 2 and 3 as one, see below.

| Phase | Commit |
|---|---|
| 1 — one derivation, shared with `abuddy db` | `7ccdafb53` |
| 2 + 3 — the row stops copying the directory; a missing row is a defined state | `4890f5acf` |
| 4 — writes are intentions | `a0756328b` |
| 5 — a failed write names the lost decision (**item 1a**) | `0936c68d4` |
| 6 — a pack that is gone (**item 1b**) | `c487ba187` |
| 7 — staging stops consulting the record | `908a3b1cf` |

### Corrections to the Decisions

- **Phases 2 and 3 are one commit.** Phase 2 removes `name`, `version` and `dir` from the row, which
  forces every reader that used them onto the join — which is Phase 3's change for those same readers.
  Split, neither commit builds. The goal README's own warning applies: once two phases touch one file
  there is no honest split left.
- **`InstalledPacksRecord` died in Phase 7, not Phase 3.** Staging was its last reader, and Phase 7 is
  what removes that. Keeping it one phase longer is what let each phase leave the suite green.
- **`recordSeedOutcomes` moved in Phase 2/3, not Phase 4.** With `ensureInstalledPack` gone, a first-time
  pack's seed failure had nothing to write onto, so the fix had to travel with the deletion for the
  coverage to stay continuous.
- **`enabledExternalPacks` takes the discovered packs, not a directory** (Phase 6). Boot prunes and
  filters from one discovery pass; passing a directory meant two.

### Conventional choices made

- The row is `PackRecord`; the join of a pack's directory with its row is `InstalledPack`
  (`pack-discovery.ts`), which is the name the row used to have.
- `packRecord(id)` is total — it answers with defaults for a pack that has no row — so no caller repeats
  what absence means.
- The boot prune takes the ids discovery just found rather than testing the filesystem itself: an install
  moves a pack's directory aside while it replaces it, so any other moment could read a mid-install pack
  as gone and throw away its enabled choice.
- `writeInstalledPacks` reports a failed write rather than throwing, so boot can carry on while a user
  action can speak up.

### What it deleted

`reconcileInstalledPacks`, `ensureInstalledPack`, `InstalledPacksRecord`, `InstalledIds`,
`recoverStagingDirs`'s installed-ids argument, and the exported `addInstalledPack` /
`removeInstalledPack` / `updateInstalledPacks`. A boundary spec keeps the last three inside the module.

Also deleted: the documented gotcha at `packages/abuddy-host/CLAUDE.md:214`, where an out-of-app
reinstall silently lost a pack's update source. `tests/packs/discovery.spec.ts` pins that the slug now
survives a version change on disk.

### Tests removed, deliberately

- `reload.spec.ts`: "records a pack it is the first to load" and "leaves an existing entry alone" —
  both described `ensureInstalledPack`, which no longer exists. "Records a first-time pack's seed
  failure" survives, reworded: the behaviour is still wanted, the ordering constraint it named is not.
- `discovery.spec.ts`: the two `reconcileInstalledPacks` specs, with the function.
- `staging.spec.ts`: "doesn't restore a pack uninstalled while its interrupted install's copy sat here"
  and "restores a pack the registry still lists" — both described the argument Phase 7 deletes. One spec
  replaces them, asserting the restore happens whatever the record says.
- `tests/fixtures/external-pack/tests/e2e/dev-reload.spec.ts` keeps the half that matters (the pack comes
  back up) and drops its record assertion.

### Checks

`npm run typecheck`, `npm run test:unit` (7 suites), `npm run build`, `npm test` (13),
`npm run test:external-pack` (23 unit + 8 + 1 E2E) and `npm run test:packaged-authoring` all pass. Every
new guard, helper and test was mutation-checked; the mutations and what they broke are in the commit
messages and the session transcript.

## Deferred

Found while surveying; out of scope, and the agent must not do them.

- **`AppState.packVersions` / `packSeedHashes` are never pruned.** A pack uninstalled and reinstalled
  skips its seed. Probably benign — the entities survive an uninstall — but the intent is unrecorded and
  the maps grow without bound.
- **Stale `pack-dev-servers/<packId>.json` markers.** A crashed `abuddy dev` leaves one naming a dead
  port that `pack://` still proxies to.
- **`_loadedPacks` and the registry are two in-memory lists of the same packs.** The same mirror shape,
  one level up.
- **The record as a map rather than an array.** `{ packs: { <id>: {…} } }` would make lookups direct and
  duplicate ids unrepresentable, but it breaks Decision 9's no-migration property. Worth revisiting only
  if a migration becomes necessary for another reason.

## Constraints

- Commit each phase as it finishes, in logical chunks, no attribution lines, `git diff --cached` first;
  pushing, tagging and PRs are on request.
- No publishing, releases or triggered workflows.
- No real data dirs, no broad pkill, E2E in the `abuddy-test` namespace.
- Preload, example pack and release metadata rules.
- Typed EARS types are change-controlled (`packages/abuddy-sdk/TYPED-EARS.md`).
- Published packages: no `any`, the TypeScript floor, `api:update` after export changes. This goal is
  expected to touch none of `@abuddy/sdk`'s exports; if it does, run `api:update` and say why.
- Build order: `packages:build` before the CLI suite, default-setup's runtime before the api suites and
  E2E.
- Investigate failing tests; mutation-check every new guard.
- External packs are first-class: keep the fixture packs, the example pack and
  `test:packaged-authoring` passing.
- `abuddy install` and `abuddy dev` write the packs directory and never the record. That is the whole
  premise: the directory has to be the list because tools change it while the app is not looking.
