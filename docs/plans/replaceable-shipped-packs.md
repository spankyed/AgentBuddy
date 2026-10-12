# A shipped pack is replaceable, and nothing special-cases it

Status: retained; implement after [settings architecture](settings-architecture.md) and the
[discovery catalog](discovery-without-activation.md). Re-audit the original survey on the naming result.
Validate replacements before publishing one committed artifact/catalog revision. Pre-publication failure
retains the prior artifact/view; activation failure is a separate outcome, not a promise to undo
user-data effects. Preserve owner IDs and stored settings overrides.
Keep migration version lines independent of update provenance. The planned catalog default-navigation policy
supersedes the old first-plugin survey below.

## Context

`goal-one-kind-of-pack` made the pack the app ships an installed pack like any other — one build path, one
load path, one content path. What it did not settle is what happens when a **user wants their own version of
it**: clone `default-setup`, edit it, install the result.

Today that cannot work. Three facts stack:

- `installShippedPacks` hash-compares the installed copy against the shipped build on **every boot** and
  overwrites anything that differs, so a fork is gone at the next start. The overwrite is pinned
  (`tests/packs/shipped-packs.spec.ts:72-79` writes `'// a user got in here'` and asserts it is gone).
- The same refresh runs as **step 0 of every `/dev/reload`** (`packs/runtime/reload.ts:105-115`), so a fork
  is clobbered mid-session by `apack pack build --watch`.
- `apack pack archive` **refuses** to archive a pack whose manifest says `builtIn: true`
  (`apack-cli/src/commands/pack.ts:42`), which is the one live reader of that field — so you cannot even
  package a clone of `default-setup`.

The dated survey below describes earlier implementation; re-audit these assertions before making changes.
The earlier survey named `b530a4899` as the source of a replacement refusal. Audit the current refusal
and implement explicit replacement behavior; do not revert an old commit whose surrounding code has
changed merely because the original plan named it.

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
for installed packs. An absent deliberately removed pack needs explicit restoration, not an enable toggle.

**Absence means `'user'`.** The app only overwrites what it can prove it placed. That also means the CLI
never has to start writing records — a CLI install is a user install, which is simply true — and it means
no new settings migration merely to default this field. Renaming the record file does require a
stored-data migration, and existing install ownership needs the reconciliation described below.

**Replacement is an explicit act, not an inference.** Proposed `apack pack replace <id> <source>` and the UI's
"Replace default"; a plain install onto a shipped id is refused and points at `replace`. Inferring intent
from an id collision would let a pack whose manifest happens to claim `default-setup` silently become the
user's choice.

**Disable and uninstall remain different operations.** Disable keeps the artifact and discoverable
settings/help/metadata, changing eligibility and runtime availability. Uninstall removes the artifact and
its declarations, preserving stored settings overrides. Record explicit suppression of automatic shipped
installation separately from `enabled`; otherwise a disabled installed pack and an intentionally absent
pack become indistinguishable. Settle that host-owned record field during implementation. Restoration
explicitly installs the shipped artifact again; enabling alone does not install a missing artifact.

**The toggle is hidden, not refused.** The Packs view shows no toggle for shipped packs by default; a
developer-mode switch in Settings reveals it, and then every pack has one. Same gate covers `replace`. The
CLI needs no gate — reaching for the CLI *is* the opt-in. One condition in the view, instead of a
`canUninstall` predicate threaded through the system, the `PackInfo` payload and the renderer.

**`shipped` retires to provenance.** It describes origin and decides nothing.

## The work

1. **Support deliberate replacement.** Re-audit the current install refusal and replace it with explicit
   intent checks; do not blindly revert historical commits.
2. **Rename `installed-packs.json` to `pack-records.json`** and add `updatesWith`. The file's own header
   opens by denying its name (*"not the list of installed packs — `packs/<id>/` is"*), and the code already
   says record (`PackRecord`, `recordInstalled`, `packRecord`). Read the old file once if present, write the
   new name through an idempotent stored-data migration, preserving enabled choices and provenance.
   A file rename is optional if the current naming goal already settles the record terminology.
3. **Boot:** install when the id is absent *unless* the record suppresses automatic installation; re-install on shipped
   artifact revision change only where `updatesWith === 'app'`. Stop hash-comparing on every boot. Reconcile existing
   installs once — copies matching the shipped artifact may be adopted as app-managed, so mark those `'app'`, or every current install
   silently becomes a fork.
4. **`/dev/reload`'s step-0 refresh respects `updatesWith`**, or a fork is clobbered by the very loop a fork
   author lives in. Verify that `apack pack dev` in the fork's own directory is the path that serves them.
5. **Proposed `apack pack replace <id> <source>`** and the UI's "Replace default"; plain install onto a shipped id
   refused. Uninstall records automatic-install suppression separately from enablement.
6. **Delete `builtIn`** — the type, the schema entry, `default-setup`'s declaration, and `apack pack archive`'s
   refusal, which is its only reader and actively blocks packaging a fork. **Drop `canUninstall`** in both
   forms. Hide the toggle behind developer mode. Guard `closeDevLetter`'s `getDesignated('threads')`.
7. **Fix the failed-load pack hiding its own error** — a shipped pack that fails to load has no
   `PackOrigin`, so it reads `canUninstall: true` and its load-problem message sits inside
   `v-if="pack.canUninstall"`. The pack most needing a diagnostic is the one that hides it. Falls out of 6.

Start only after the roadmap’s discovery checkpoint. Within this plan, audit intent/commit boundaries
first; establish records before changing boot/reload/CLI behavior. Update the UI and tests with those
contracts so no intermediate checkpoint silently overwrites a fork.

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
- **Migrations no longer need a workaround here, and this is the one footgun that closed.**
  [`migration-version-lines.md`](../archive/plans/migration-version-lines.md) landed first: a migration is
  declared under `migrations.app` or `migrations.pack` in its pack's manifest and the runners read one map
  each, so nothing routes on provenance. A fork at `default-setup`'s id has its migrations compared against
  whichever line it declared them on, which is the fork author's choice. **Do not add the `updatesWith`
  routing this plan used to propose** — it would put provenance back in the one place it has been taken out
  of. `default-setup`'s own `version` is still decorative (`0.1.0` against migrations named for app
  releases), which is correct now rather than merely harmless: those are declared on the app's line.

## Out of scope

Fixing `default-setup`'s decorative version. Anything about when migrations run. Changing content
semantics merely because update ownership changed. Audit actual replacement
migration/content execution before promising rollback; pre-publication artifact rollback cannot undo
arbitrary applier or migration side effects. Whether the app should ship more than one pack — the
directory scan already supports it and
nothing here assumes one.

## Verification

```bash
npm run spec -- packages/apack-host/tests/packs
npm run spec -- packages/apack-host/tests/features/packs
npm run typecheck
npm run chain
```

Required cases, after checking which current specs already cover them:

- a fork installed at a shipped id **survives a restart**, and survives a `/dev/reload`
- an **app-owned** pack is still re-installed when the shipped build changes with the app version
- an app-owned pack uninstalled through the CLI **stays gone** across a restart, and comes back through explicit restoration
- an existing install matching the shipped artifact is reconciled to `'app'`; a differing copy is
  preserved as user-owned instead of guessed to be app-owned
- `apack pack archive` archives a clone of `default-setup`

Replace the historical hash-repair invariant with the selected update contract: unchanged app-owned
artifacts are not hash-compared and rewritten on every boot; shipped revision changes refresh app-owned
copies; user-owned artifacts survive restart/reload. Invalid artifacts produce diagnostics rather than
silently reclassifying a fork. Also verify disabled installed packs retain their catalog definitions,
uninstalled packs do not, restoration reuses preserved overrides, and failed staging leaves the prior
artifact/catalog available. Use discovery’s stale-load checks during in-flight replacement.

The output is a deliberate update-ownership and removal contract on top of discovery. It does not alter
settings ownership, catalog identities, migration version lines or the consumed-API security model.
