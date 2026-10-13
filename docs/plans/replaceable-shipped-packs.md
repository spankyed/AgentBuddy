# A shipped pack is replaceable, and nothing special-cases it

Status: retained; implement after [settings architecture](settings-architecture.md) and the
[discovery catalog](discovery-without-activation.md). Re-audit the original survey on the naming result.
Validate replacements before publishing one committed artifact/catalog revision. Pre-publication failure
retains the prior artifact/view; activation failure is a separate outcome, not a promise to undo
user-data effects. Preserve owner IDs and stored settings overrides.
Keep migration version lines independent of update provenance. The planned catalog default-navigation policy
supersedes the old first-plugin survey below.

Current settings acceptance confirms that booting with a current-format disabled `default-setup`
record works: host Personal and shortcut preferences remain usable without it. The Packs backend
still uses `canUninstall` to refuse disabling a shipped pack, conflating two separate operations.
Resolve that guard with this replacement contract, not by weakening an acceptance fixture's dependency
requirements. The external authoring fixture depends on default-setup's content providers and cannot
serve as a host-only boot fixture; the host-only app suite instead installs no external fixture.

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
// in installed-packs.json, per pack
updatesWith: 'app' | 'user'
```

**It means who owns updates, not who may overwrite files.** App-owned packs update with the app, imposed —
necessary, because an app update that left a stale pack behind could leave its snapshot format unreadable
and the pack would not load at all. User-owned packs get the shipped version offered as an **available
update**, which is what a fork wants and which reuses `checkForUpdates`/`availableVersion`/`UPDATE_PACK`
for installed packs. An absent deliberately removed pack needs explicit restoration, not an enable toggle.

**Absence means `'user'`.** The app only refreshes what it can prove it owns. CLI/app/dev installation
records user ownership with the selected source before publication; unrecorded existing artifacts are
also user-owned. No migration or byte-based adoption supplies app ownership. Every new shipped installation records app ownership;
unrecorded artifacts remain user-owned. There are no users requiring automatic adoption of historical
installs. Developer backup conversion, if needed, is a separate explicit operation on a copy.

**Replacement is an explicit act, not an inference.** Proposed `apack pack replace <id> <source>` and the UI's
"Replace default"; a plain install onto a shipped id is refused and points at `replace`. Inferring intent
from an id collision would let a pack whose manifest happens to claim `default-setup` silently become the
user's choice.

**Disable and uninstall remain different operations.** Disable keeps the artifact and discoverable
settings/help/metadata, changing eligibility and runtime availability. Uninstall removes the artifact and
its declarations, preserving stored settings overrides. Record `suppressAppInstall: true` separately from `enabled`; otherwise a disabled installed pack and an intentionally absent
pack become indistinguishable. Boot pruning retains this marker. `shippedRevision` records the published source-content identity last accepted for an app-owned install, separate from the runtime nonce and installed artifact receipt. Restoration
explicitly installs the shipped artifact again; enabling alone does not install a missing artifact.

**The toggle is hidden, not refused.** The Packs view shows no toggle for shipped packs by default; a
developer-mode switch in Settings reveals it, and then every pack has one. Same gate covers `replace`. The
CLI needs no gate — reaching for the CLI *is* the opt-in. One condition in the view, instead of a
`canUninstall` predicate threaded through the system, the `InstalledPackSummary` payload and the renderer.

**`shipped` retires to provenance.** It describes origin and decides nothing.

## The work

1. **Support deliberate replacement.** Re-audit the current install refusal and replace it with explicit
   intent checks; do not blindly revert historical commits.
2. **Extend the current install-record contract** with update ownership and removal suppression.
   Retain `installed-packs.json` unless the implementation establishes a separate reason to rename it.
   Use the completed naming conventions. Change owned callers, fixtures and documentation together;
   do not add old-file reads, conversion or ownership inference for historical developer data.
3. **Boot:** install when the id is absent *unless* the record suppresses automatic installation;
   record new shipped installations as `updatesWith: 'app'`. Refresh a changed shipped artifact only
   where that field is `'app'`. Stop hash-comparing on every boot. Matching bytes alone never grant the
   app ownership of an existing unrecorded artifact. An explicit restoration can choose app ownership.
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

- **Unrecorded artifacts are user-owned by design.** Do not silently adopt them from byte equality;
  a developer who wants an app-managed copy restores it explicitly.
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
- an unrecorded artifact remains user-owned even when its bytes match the shipped copy; explicit
  restoration records app ownership, with no historical-format read or automatic conversion
- `apack pack archive` archives a clone of `default-setup`

Replace the historical hash-repair invariant with the selected update contract: unchanged app-owned
artifacts are not hash-compared and rewritten on every boot; shipped revision changes refresh app-owned
copies; user-owned artifacts survive restart/reload. Invalid artifacts produce diagnostics rather than
silently reclassifying a fork. Also verify disabled installed packs retain their catalog definitions,
uninstalled packs do not, restoration reuses preserved overrides, and failed staging leaves the prior
artifact/catalog available. Use discovery’s stale-load checks during in-flight replacement.

## Installed publication audit (2026-10-13)

At audit time, the app's install handler tore down an active pack in `beforePlace`; the update handler
tore it down before downloading. Neither path used the registry's transactional `replacePack`.
A download, runtime-load or registration refusal can therefore discard a working incumbent even
though the artifact checks pass. The existing install lock also uses the source slug while update uses
the pack id: different sources resolving to one owner need a resolved-id guard, not just a slug guard.

The filesystem acceptance checkpoint adds synchronous `InstallOptions.accept`. The callback reads the
verified candidate at its final path while `replaceDir` retains the old directory. Throwing restores
the old bytes; a refused first install is removed. The callback receives independent metadata. Rollback
checks directory identity before deleting the candidate, retaining the old backup rather than deleting
a destination now owned by another replacement. This is a mechanism, not completed host integration.

Next migrate live install/update to a shared acceptance operation: load and check the candidate, then
use `replacePack` when an incumbent is registered. A refusal must preserve its settings leases,
contributions, actors, accepted revision and install record, and clear the refused candidate's module
cache. Stop sending `PACK_DEACTIVATED` for a replacement. After acceptance, retire the previous hooks
and restart affected actors through the existing replacement lifecycle; perform initialization,
migrations and content application after that acceptance decision. Report post-acceptance failures
separately without claiming to restore arbitrary user-data effects. Cover new/disabled packs and
resolved-id concurrency before accepting this integration. Shipped update ownership, suppression,
explicit replacement and restoration remain the subsequent required work in this plan.

Checkpoint validation also exposed a separate shutdown lifetime race: all 21 external-pack app tests
passed, but fixture cleanup raised `ENOTEMPTY` for `apack-e2e-GOJY57`. The surviving file was
`apack/logs/app-events.log`, ending with API LMDB shutdown entries. Electron's `before-quit` calls
`stopApiServer`, whose process-manager `kill` starts `stop` without awaiting it; the fixture awaits
Electron close and immediately removes the data directory. Inspect and coordinate child-process
completion before deleting fixture-owned storage. A passing repeat is not evidence that this race is
fixed; do not hide it with extended test deadlines or swallowed cleanup errors. Initial strict evidence:
`node_modules/.cache/apack-chain/runs/2026-10-13T17-46-38Z-83704` (296.6s).

The output is a deliberate update-ownership and removal contract on top of discovery. It does not alter
settings ownership, catalog identities, migration version lines or the consumed-API security model.


### Coordinated app installation (2026-10-13)

The app now supplies `acceptInstalledPack` to the installer acceptance hook. Final-path runtime load
and registration use `replacePack` for an incumbent; refusal clears candidate module cache and lets
filesystem rollback restore the old artifact without teardown, reactivation or record changes.
Install reserves its resolved id before placement, preventing two source slugs from accepting one owner
at once. The update lock holds its owner through download and acceptance. These are app-system guards,
not a claim of coordination with independent CLI processes.

Acceptance returns a starter, invoked after filesystem publication even if saving the install/update
record fails. The shared activation path retires old hooks and handles initialization, migrations and
content application. Successful replacement restarts old/new system ids before `PACK_CHANGED`.
Initialization refusal stops affected systems and removes runtime bindings but retains accepted files
and declarations; it cannot restore arbitrary data writes. Disabled updates refresh their artifact and
catalog while preserving disabled state, without loading a runtime.

Focused tests cover actual sealed artifacts and app handlers: download/import/binding refusal,
incumbent registration/revision/records, generated settings handles and subscriptions, refused module
cache cleanup, competing source identities, disabled update, and old/new system retirement after
success or initialization failure. Four guard mutations (unregister-first, skipped cache cleanup,
missing owner reservation, activating a disabled candidate) fail; source was restored and 163 focused
tests pass. Explicit shipped ownership/suppression, replacement/restoration operations and final real
app acceptance remain required. The separate fixture/API shutdown race above remains unresolved.

Strict checkpoint validation passes in 393.9s (one cached gate), with all 30 gates accepted and evidence
`node_modules/.cache/apack-chain/runs/2026-10-13T18-05-22Z-18099`. This covers the ordinary install/update
acceptance implementation, not the remaining shipped replacement contract or final goal `--all` audit.
After removing teardown-first installation, production callers no longer request
`teardownPack(..., { replacing: true })`; audit and remove that flag's registry/bus suppression machinery
rather than retaining an unused lifecycle. Teardown is also the remaining production consumer of
`getPackExtensions`, used only for system ids; migrate it to the lifecycle accessor before deleting
that obsolete discovery projection. Preserve actual teardown and frontend readiness behavior.


### Removal of teardown-first replacement glue (2026-10-13)

Removed the teardown `replacing` option, registry replacement-window map and marker methods, and bus
suppression of drops to missing plugins. Transactional replacement keeps an incumbent registered until
acceptance, so a temporary unregistered window is no longer a lifecycle to model. Genuine teardown
always announces removal; absent or invalid plugin delivery remains observable.

Removed `getPackExtensions` and its runtime metadata assembly. Teardown queries registered system ids;
presence checks query registration; installed information continues using catalog declarations. Tests
use the relevant runtime lookup rather than recreating the removed metadata projection. The test-app
registry contract also loses its unused suppression method. No aliases or fallback path remain.

Focused checks pass 226 tests and the host typecheck. Three composed bus cases cover refused candidate
retention, valid delivery plus invalid-event reporting after acceptance, and reporting after genuine
removal. Suppressing drop reports fails two of those tests; the source was restored and the focused suite
passed again. This removes obsolete mechanics; shipped update ownership, removal suppression and
explicit replace/restore behavior remain required.

Initial strict validation stopped in the host unit step without reported assertion failures. The machine
power log records Low Power Sleep at 14:19:10 and wake at 14:43:24 (1,454 seconds), coinciding with
the step's 1,469.6-second elapsed timeout. Initial evidence is
`node_modules/.cache/apack-chain/runs/2026-10-13T18-17-26Z-49534`. Recheck the unchanged source while
awake; do not extend suite deadlines or interpret the sleep interval as test execution cost.

The unchanged-source awake recheck passes all 30 strict gates in 247.3s (21 cached), evidence
`node_modules/.cache/apack-chain/runs/2026-10-13T18-48-01Z-55317`. The separate API/fixture shutdown
cleanup race remains unresolved; passing this run does not establish its repair. The next replacement
checkpoint must implement explicit update ownership and removal suppression, not reintroduce a
replacement window or use runtime metadata as the discovery catalog.


### Explicit update ownership and removal suppression (2026-10-13)

Selected record contract: `updatesWith: 'app' | 'user'` (absence means user ownership),
`shippedRevision` (deterministic published-source content/layout identity for app ownership), and
`suppressAppInstall: true` (deliberate removal, distinct from enablement). Strict reads refuse invalid
ownership or revision values. There is no historical-file adoption or conversion.

Boot and id-specific refresh require the target profile's record file. Existing unrecorded/user-owned
artifacts stay untouched; matching bytes confer no ownership. App-managed copies update only when the
shipped source revision changes, preserving enablement. Dirty/invalid installed bytes are diagnosed by
artifact admission, not automatically repaired on each boot. Outcomes distinguish `unchanged` source
identity, `preserved` user artifacts and `suppressed` installation; they are not health reports.

Installation decisions participate in synchronous acceptance: save them before registration, restore
them and files on refusal, and initialize after publication. Actual shipped reload also uses transactional
registration there, retaining runtime/catalog/files/records on collision. App/CLI/dev installs explicitly
choose user ownership, clearing app revision/suppression; CLI source recording also precedes acceptance.
Uninstall records removal before deleting files and restores prior records on deletion failure. Boot
pruning retains deliberate removal. Settings/database effects remain outside filesystem/record rollback.

Focused coverage includes repeated boot and removal, byte-identical unrecorded artifacts, real user
installation across a shipped rebuild, disabled refresh, candidate/refusal/record-write/deletion failure,
and actual app-owned reload collision with the incumbent catalog/runtime retained. Five ownership,
suppression, pruning, record-write and rollback mutations fail and were restored. Explicit replace/restore,
app-source update offers, provenance-only controls, archive eligibility and final acceptance remain
required; this is not completion of the shipped replacement workstream or the larger goal.

Checkpoint validation passes 169 focused host tests, seven CLI caller tests and CLI/testing typechecks.
All 30 strict gates pass in 356.8s (one cached), evidence
`node_modules/.cache/apack-chain/runs/2026-10-13T19-24-50Z-88047`. The independent API/fixture shutdown
cleanup race remains open despite this passing run. Final goal `--all` and complete shipped replacement
acceptance remain outstanding.


### Explicit operation prototype (2026-10-13)

`apack pack replace <id> <source> [--profile <name>]` selects user-managed updates and requires the
verified candidate id to match the explicit target. The operation kind supplies replacement intent;
the identity check does not double as an authorization flag. It can also fill an explicitly named
missing slot. Ordinary install must refuse an app-managed incumbent and point to replace.

`apack pack restore <id> --host <path|beta> [--profile <name>]` selects an app-shipped artifact,
re-enables it, clears removal suppression and records app-managed updates. It preserves database
settings/content overrides. Source selection uses the existing read-only host-packages resolver:
explicit host flag or associated host handoff/environment, no working-directory inference, app launch
or download. A missing selection or uncached beta is an actionable refusal. Profile chooses stored
state independently of the source host; no profile name chooses an executable or release channel.

Both commands hold the existing profile mutation lock and refuse a running app. Candidate validation,
compatibility, identity, ownership-record update and filesystem acceptance precede publication. Failed
restoration must retain the old artifact/record or the existing removal marker. Helpers share the same
record acceptance boundary as boot; there is no reset/import or historical-format conversion.

The full advertised shipped-id guard, app UI replace/restore controls, app-source update offers,
archive eligibility and provenance-only policy still need their subsequent integration. These command
checkpoints do not close the replacement workstream or alter any other required goal phase.


### CLI replace/restore checkpoint (2026-10-13)

Implemented `pack replace` and `pack restore` with command routing and public help/docs. Install and
replace share validation/publication under the profile lock; a discriminated operation supplies intent,
while the incoming id must match replace's explicit target. Plain install refuses an app-managed
incumbent. Restore resolves the selected host packages read-only without cwd inference/download/launch,
requires exactly one matching declared id and shares boot's app-record preparation. It re-enables the
pack, clears removal suppression/remote offers and records app ownership; source or acceptance failure
retains the previous artifact/record or removal marker.

A composed CLI fixture runs restore → replace → boot preservation → uninstall → boot suppression →
restore, using real sealed artifacts whose runtime throws if activated. Preferences are written to
actual LMDB, closed before mutation and reopened after restoration; app and pack override values
persist. Further cases cover identity/compatibility refusal, running-app locks, independent custom
profiles, explicit host precedence, missing/duplicate ids and uncached beta with fetch mocked to refuse.
Twenty-eight focused CLI and 27 shipped-host tests pass. Five identity/intent/enablement/offline mutations
fail and were restored; CLI/testing and host typechecks pass.

This delivers offline CLI operations. The full advertised shipped-id guard, source catalog/provider
identity audit, live app UI controls, app-source update offers, archive eligibility and the complete
replacement acceptance matrix remain required. It does not establish full discovery, pane boundaries,
API/provenance contracts or final goal completion. Database initialization/runtime effects are not
covered by filesystem/record rollback. The separately recorded fixture/API shutdown race remains open.

Strict checkpoint validation passes all 30 gates in 325.8s (one cached), evidence
`node_modules/.cache/apack-chain/runs/2026-10-13T20-01-02Z-23338`. This is not the final full-goal
requirement audit or strict `--all`; no unfinished plan is archived.


### Manifest shipping privilege removal (2026-10-13)

Removed `builtIn` from the manifest schema, generated JSON Schema, controlled SDK build report,
default-setup declaration, codegen fixtures and public authoring docs. No alias, conversion or special
parser exists for the removed field. Archive no longer refuses a pack based on its manifest origin.
CLI list exposes `updatesWith` rather than a pack's self-declared privilege; GitHub update selection
uses installation ownership, so a user-managed fork at the default id is eligible for its recorded
remote source while an app-managed record is not. Upgrade still validates identity/version and the
existing compatibility/dependency guards.

Focused checks pass 92 SDK schema/codegen tests, 18 host discovery/migration tests and four CLI tests.
The archive test uses the real freshly rebuilt default-setup: create its archive/checksum, extract it
and verify its installed receipt. The SDK report diff contains exactly six `builtIn` declarations removed;
line endings were normalized before review. No release/version metadata changes.

`canUninstall` and the live toggle/install restrictions remain pending the app source catalog and live
replace/restore controls. In that integration audit, distinguish the currently id-based `PackOrigin.shipped`
flag from selected artifact provenance and recorded update ownership; it must not regain authority over
updates. Complete the clone/edit/build/install/restart acceptance matrix, source update offers and the
other replacement requirements before closing this plan. All broader goal work remains required.

Strict validation passes all 30 gates in 381.0s (none cached), evidence
`node_modules/.cache/apack-chain/runs/2026-10-13T20-15-31Z-55624`. This is a manifest/archive eligibility
checkpoint, not final goal `--all` acceptance or completion of the replacement workstream. The
independently observed fixture/API shutdown race remains unresolved despite passing this run.


### Optional Threads during onboarding (2026-10-13)

The controls audit found Welcome closing through the SDK's throwing process-global `getDesignated`.
The shell now reads optional `designation('threads')` from its injected window registry and sends the
existing selection action only when a role is present. The existing action safely handles a designation
without a frontend plugin; no duplicate availability check, fallback feature or fabricated actor is added.

Six new cases cover a host-only registry, another current plugin, an alternate Threads provider,
a backend-only role, provider removal before click, and two independent window registries. Welcome
advances to onboarding without error and retains the existing selection when no destination is available.
Renderer bootstrap registers the native host frontend before shell creation; the packless case represents
that real host-only state, not an unsupported completely empty shell initializer.

The focused run passes 23 tests and the host typecheck. A hardcoded default-setup Threads ref fails the
window-local selection test and was restored. An initially attempted redundant frontend-membership guard
had no behavioral effect because selection already handles absence; the guard was removed. This is the
optional-role prerequisite, not completion of live replace/restore, catalog/provenance or update offers.
All other replacement and larger goal acceptance remain required.

Strict validation passes all 30 gates in 331.9s (one cached), evidence
`node_modules/.cache/apack-chain/runs/2026-10-13T20-32-47Z-87954`. This is the optional-role prerequisite;
source catalog/provenance, live pack controls, update offers, complete replacement acceptance and final
goal `--all` remain outstanding. The independently observed fixture/API shutdown race is not declared
fixed by this passing run.
