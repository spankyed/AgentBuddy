# A shipped pack is replaceable, and nothing special-cases it

## Context

`goal-one-kind-of-pack` made the pack the app ships an installed pack like any other — one build path, one
load path, one content path. What it did not settle is what happens when a **user wants their own version of
it**: clone `default-setup`, edit it, install the result.

Today that cannot work. Three facts stack:

- `installShippedPacks` hash-compares the installed copy against the shipped build on **every boot** and
  overwrites anything that differs, so a fork is gone at the next start. The overwrite is pinned
  (`tests/packs/shipped-packs.spec.ts:72-79` writes `'// a user got in here'` and asserts it is gone).
- The same refresh runs as **step 0 of every `/dev/reload`** (`packs/runtime/reload.ts:105-115`), so a fork
  is clobbered mid-session by `abuddy build --watch`.
- `abuddy pack` **refuses** to archive a pack whose manifest says `builtIn: true`
  (`abuddy-cli/src/commands/pack.ts:42`), which is the one live reader of that field — so you cannot even
  package a clone of `default-setup`.

And commit `b530a4899` (2026-10-08) made it worse by refusing an install that takes a shipped pack's id. It
was written on an inference — that `canUninstall: false` promised the pack could not be replaced — which was
never a requirement. **It is reverted first.**

**The requirements, as given:** a shipped pack should not be easy to remove through the UI; it should be
replaceable, because an external dev may want their own version; and the app should not brick when one is
gone.

**Outcome:** a fork survives restarts and reloads, the app's own copy still updates with the app, and the
protections that read like safety mechanisms are revealed as a UI preference and treated as one.

## What the investigation overturned

Three premises this plan was nearly built on, all false:

- **"Uninstalling the shipped pack bricks the app."** It does not. `features/registration.ts:2` —
  *"The plugins are always there"* — the host registers `application`, `packs` and `settings`
  unconditionally, so an app with no packs is a working app showing the Packs view. The way back is a view
  that is always present.
- **"The shell picks its opening plugin with `getDesignated('threads')`."** It does not.
  `application/fe/machine.ts:492` is inside `closeDevLetter`, which fires when the dev letter is dismissed.
  The opening pick is "its first plugin", and a host plugin is always first. That one call still wants a
  guard, but it is one action, not a structural dependency.
- **"Shipped packs need protecting."** They need a UI that does not offer destruction casually. That is not
  the same thing, and it is why `canUninstall` goes.

## The shape

**One field decides one thing.** Every mess here is a field that decided two unrelated things because both
correlated with provenance: `builtIn` (provenance pretending to be policy), `shipped` (origin deciding
migration routing), `canUninstall` (a capability answering a presentation question). The new field gets
exactly one job and one consumer.

```ts
// in pack-records.json, per pack
updatesWith: 'app' | 'user'
```

**It means who owns updates, not who may overwrite files.** App-owned packs update with the app, imposed —
necessary, because an app update that left a stale pack behind could leave its snapshot format unreadable
and the pack would not load at all. User-owned packs get the shipped version offered as an **available
update**, which is what a fork wants and which reuses `checkForUpdates`/`availableVersion`/`UPDATE_PACK`
rather than inventing a restore verb.

**Absence means `'user'`.** The app only overwrites what it can prove it placed. That also means the CLI
never has to start writing records — a CLI install is a user install, which is simply true — and it means
no stored-data migration to land this, because absence is the correct reading of every file on disk today.

**Replacement is an explicit act, not an inference.** `abuddy replace <id> <source>` and the UI's
"Replace default"; a plain install onto a shipped id is refused and points at `replace`. Inferring intent
from an id collision would let a pack whose manifest happens to claim `default-setup` silently become the
user's choice.

**Uninstall uses `enabled: false`.** Removing an app-owned pack records that and keeps the row, so
install-if-absent does not put it back. `enabled` already means "it is there but I do not want it running"
and is already the thing `pack-records.json` exists to remember. Re-enabling reinstalls it, so the restore
path is a control that already exists. The one behaviour change is that uninstalling an app-owned pack keeps
its row rather than calling `forgetPack`.

**The toggle is hidden, not refused.** The Packs view shows no toggle for shipped packs by default; a
developer-mode switch in Settings reveals it, and then every pack has one. Same gate covers `replace`. The
CLI needs no gate — reaching for the CLI *is* the opt-in. One condition in the view, instead of a
`canUninstall` predicate threaded through the system, the `PackInfo` payload and the renderer.

**`shipped` retires to provenance.** It describes origin and decides nothing.

## The work

1. **Revert `b530a4899`.** It refuses the install this plan requires.
2. **Rename `installed-packs.json` to `pack-records.json`** and add `updatesWith`. The file's own header
   opens by denying its name (*"not the list of installed packs — `packs/<id>/` is"*), and the code already
   says record (`PackRecord`, `recordInstalled`, `packRecord`). Read the old file once if present, write the
   new name, delete the old — three lines, not a migration, because the only loss would be a re-enabled pack.
3. **Boot:** install when the id is absent *unless* the record says `enabled: false`; re-install on app
   version change only where `updatesWith === 'app'`. Stop hash-comparing on every boot. Reconcile existing
   installs once — equal hashes mean the app placed it, so mark those `'app'`, or every current install
   silently becomes a fork.
4. **`/dev/reload`'s step-0 refresh respects `updatesWith`**, or a fork is clobbered by the very loop a fork
   author lives in. Verify that `abuddy dev` in the fork's own directory is the path that serves them.
5. **`abuddy replace <id> <source>`** and the UI's "Replace default"; plain install onto a shipped id
   refused. Uninstall of an app-owned pack records `enabled: false`.
6. **Delete `builtIn`** — the type, the schema entry, `default-setup`'s declaration, and `abuddy pack`'s
   refusal, which is its only reader and actively blocks packaging a fork. **Drop `canUninstall`** in both
   forms. Hide the toggle behind developer mode. Guard `closeDevLetter`'s `getDesignated('threads')`.
7. **Fix the failed-load pack hiding its own error** — a shipped pack that fails to load has no
   `PackOrigin`, so it reads `canUninstall: true` and its load-problem message sits inside
   `v-if="pack.canUninstall"`. The pack most needing a diagnostic is the one that hides it. Falls out of 6.

Order: 1 is independent. 2 before 3 and 4. 5 after 2. 6 and 7 independent.

## Footguns, named because each was nearly missed

- **Every existing install silently becomes a fork** without the one-time reconciliation in step 3.
- **The update offer has no version line to compare.** A shipped pack has no GitHub release, so the offer
  comes from the shipped dir's manifest; and a fork at `0.9.0` against a shipped `0.4.0` makes
  `compareVersions` offer nothing. The offer must read "the app ships X", not "X is newer than yours".
- **Content re-import on every swap.** The applied content's revision is keyed by pack id and content-hashed, so installing
  a fork re-applies and restoring the default re-applies again, merging the other pack's rows into user data.
  Whether a swap should re-apply is a product call this plan does not make.
- **Nothing stops a fork that drops a feature the app assumes.** With `canUninstall` gone there is no
  derived guard. Deliberate: it is the user's pack.
- **Migrations are routed by provenance, and that is a separate plan.** A fork at `default-setup`'s id would
  have its migrations run against the **app's** version line. The stopgap is to route on `updatesWith`
  instead of id membership; the real fix is
  [`migration-version-lines.md`](migration-version-lines.md), which lets a migration declare its own line.
  **Whichever lands second deletes the other's workaround.** Migrations are already fused and partly broken
  (`default-setup` declares `0.1.0` and ships migrations named `0.3.0`–`0.3.15` against an app at `0.3.14`);
  the goal here is to not make that worse, which routing on ownership achieves.

## Out of scope

Fixing `default-setup`'s decorative version. Anything about when migrations run. Whether a swap should
re-apply. Whether the app should ship more than one pack — the directory scan already supports it and
nothing here assumes one.

## Verification

```bash
npm run spec -- packages/abuddy-host/tests/packs
npm run spec -- packages/abuddy-host/tests/features/packs
npm run typecheck
npm run chain
```

The cases that decide it, none of which can be written today:

- a fork installed at a shipped id **survives a restart**, and survives a `/dev/reload`
- an **app-owned** pack is still re-installed when the shipped build changes with the app version
- an app-owned pack uninstalled through the CLI **stays gone** across a restart, and comes back on re-enable
- an existing install with no record is reconciled to `'app'`, not left as a fork
- `abuddy pack` archives a clone of `default-setup`

And the rewrite of the pinned invariant at `tests/packs/shipped-packs.spec.ts:72-79`: an edited **app-owned**
file is still repaired at the next boot; a **user-owned** pack is left alone. Those are the same bytes
differing for different reasons, which is the distinction the hash comparison cannot make on its own and the
record exists to supply.
