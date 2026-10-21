# A shipped pack is replaceable, and nothing special-cases it

Status: completed 2026-10-19. Shipped packs use the ordinary installation/catalog contract; explicit forks, managed updates, restoration, override retention and incumbent preservation are accepted.
See the [completed goal](../goals/goal-settings-and-pack-contracts.md#outcome-2026-10-19) and
[final requirement/source audit](../../references/evidence/settings-and-pack-contracts.md#final-requirement-and-source-audit--2026-10-19).
Dated checkpoint notes below are historical; deferred work keeps its separate owner.

Historical checkpoint status: in progress, using [settings architecture](settings-architecture.md) and the
[discovery catalog](discovery-without-activation.md). Checkpoints below record implemented behavior;
the original survey is historical evidence, not the current policy.
Validate replacements before publishing one committed build/catalog revision. Pre-publication failure
retains the prior build/view; activation failure is a separate outcome, not a promise to undo
user-data effects. Preserve owner IDs and stored settings overrides.
Keep migration version lines independent of update provenance. The planned catalog default-navigation policy
supersedes the old first-plugin survey below.

Current settings acceptance confirms that booting with a current-format disabled `default-setup`
record works: host Personal and shortcut preferences remain usable without it. Live controls remove
`canUninstall` and separate replacement, restoration, disable and removal. Required dependencies remain
required; removing their provider does not silently weaken an acceptance fixture's contract. The external authoring fixture depends on default-setup's content providers and cannot
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
and the pack would not load at all. User-owned forks keep their selected build until explicit replacement or restoration. App-owned
packs can receive an app-source update offer keyed by source revision, independently of remote release
updates. Restoration explicitly adopts the app source and enables it. An absent deliberately removed
pack needs restoration, not an enable toggle.

**Absence means `'user'`.** The app only refreshes what it can prove it owns. CLI/app/dev installation
records user ownership with the selected source before publication; unrecorded existing builds are
also user-owned. No migration or byte-based adoption supplies app ownership. Every new shipped installation records app ownership;
unrecorded builds remain user-owned. There are no users requiring automatic adoption of historical
installs. Developer backup conversion, if needed, is a separate explicit operation on a copy.

**Replacement is an explicit act, not an inference.** Proposed `apack pack replace <id> <source>` and the UI's
"Replace default"; a plain install onto a shipped id is refused and points at `replace`. Inferring intent
from an id collision would let a pack whose manifest happens to claim `default-setup` silently become the
user's choice.

**Disable and uninstall remain different operations.** Disable keeps the build and discoverable
settings/help/metadata, changing eligibility and runtime availability. Uninstall removes the build and
its declarations, preserving stored settings overrides. Record `suppressAppInstall: true` separately from `enabled`; otherwise a disabled installed pack and an intentionally absent
pack become indistinguishable. Boot pruning retains this marker. `shippedRevision` records the published source-content identity last accepted for an app-owned install, separate from the runtime nonce and installed build receipt. Restoration
explicitly installs the shipped build again; enabling alone does not install a missing build.

**Installed packs have lifecycle controls.** Disable and remove are available for every installed pack;
update ownership does not grant a shipping privilege. Replacement and restoration require explicit
intent and a selected source. The native host is not an installed pack and is not removable. No
`canUninstall` flag or developer-mode gate duplicates these rules.

**Runtime identity describes the selected build.** App-source advertisements and update ownership
remain separate from the loaded build; the obsolete runtime `shipped` flag is removed.

## The work

1. **Support deliberate replacement.** Re-audit the current install refusal and replace it with explicit
   intent checks; do not blindly revert historical commits.
2. **Extend the current install-record contract** with update ownership and removal suppression.
   Retain `installed-packs.json` unless the implementation establishes a separate reason to rename it.
   Use the completed naming conventions. Change owned callers, fixtures and documentation together;
   do not add old-file reads, conversion or ownership inference for historical developer data.
3. **Boot:** install when the id is absent *unless* the record suppresses automatic installation;
   record new shipped installations as `updatesWith: 'app'`. Refresh a changed shipped build only
   where that field is `'app'`. Stop hash-comparing on every boot. Matching bytes alone never grant the
   app ownership of an existing unrecorded build. An explicit restoration can choose app ownership.
4. **`/dev/reload`'s step-0 refresh respects `updatesWith`**, or a fork is clobbered by the very loop a fork
   author lives in. Verify that `apack pack dev` in the fork's own directory is the path that serves them.
5. **Proposed `apack pack replace <id> <source>`** and the UI's "Replace default"; plain install onto a shipped id
   refused. Uninstall records automatic-install suppression separately from enablement.
6. **Delete `builtIn`** — the type, the schema entry, `default-setup`'s declaration, and `apack pack archive`'s
   refusal, which is its only reader and actively blocks packaging a fork. **Drop `canUninstall`** in both
   forms. Expose installed-pack lifecycle controls without shipping privileges. Resolve optional Threads
   through the window-local registry during onboarding.
7. **Fix the failed-load pack hiding its own error** — a shipped pack that fails to load has no
   `PackOrigin`, so it reads `canUninstall: true` and its load-problem message sits inside
   `v-if="pack.canUninstall"`. The pack most needing a diagnostic is the one that hides it. Falls out of 6.

Start only after the roadmap’s discovery checkpoint. Within this plan, audit intent/commit boundaries
first; establish records before changing boot/reload/CLI behavior. Update the UI and tests with those
contracts so no intermediate checkpoint silently overwrites a fork.

## Footguns, named because each was nearly missed

- **Unrecorded builds are user-owned by design.** Do not silently adopt them from byte equality;
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
  [`migration-version-lines.md`](migration-version-lines.md) landed first: a migration is
  declared under `migrations.app` or `migrations.pack` in its pack's manifest and the runners read one map
  each, so nothing routes on provenance. A fork at `default-setup`'s id has its migrations compared against
  whichever line it declared them on, which is the fork author's choice. **Do not add the `updatesWith`
  routing this plan used to propose** — it would put provenance back in the one place it has been taken out
  of. `default-setup`'s own `version` is still decorative (`0.1.0` against migrations named for app
  releases), which is correct now rather than merely harmless: those are declared on the app's line.

## Out of scope

Fixing `default-setup`'s decorative version. Anything about when migrations run. Changing content
semantics merely because update ownership changed. Audit actual replacement
migration/content execution before promising rollback; pre-publication build rollback cannot undo
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
- an unrecorded build remains user-owned even when its bytes match the shipped copy; explicit
  restoration records app ownership, with no historical-format read or automatic conversion
- `apack pack archive` archives a clone of `default-setup`

Replace the historical hash-repair invariant with the selected update contract: unchanged app-owned
builds are not hash-compared and rewritten on every boot; shipped revision changes refresh app-owned
copies; user-owned builds survive restart/reload. Invalid builds produce diagnostics rather than
silently reclassifying a fork. Also verify disabled installed packs retain their catalog definitions,
uninstalled packs do not, restoration reuses preserved overrides, and failed staging leaves the prior
build/catalog available. Use discovery’s stale-load checks during in-flight replacement.

## Installed publication audit (2026-10-13)

At audit time, the app's install handler tore down an active pack in `beforePlace`; the update handler
tore it down before downloading. Neither path used the registry's transactional `replacePack`.
A download, runtime-load or registration refusal can therefore discard a working incumbent even
though the build checks pass. The existing install lock also uses the source slug while update uses
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
filesystem rollback restore the old build without teardown, reactivation or record changes.
Install reserves its resolved id before placement, preventing two source slugs from accepting one owner
at once. The update lock holds its owner through download and acceptance. These are app-system guards,
not a claim of coordination with independent CLI processes.

Acceptance returns a starter, invoked after filesystem publication even if saving the install/update
record fails. The shared activation path retires old hooks and handles initialization, migrations and
content application. Successful replacement restarts old/new system ids before `PACK_CHANGED`.
Initialization refusal stops affected systems and removes runtime bindings but retains accepted files
and declarations; it cannot restore arbitrary data writes. Disabled updates refresh their build and
catalog while preserving disabled state, without loading a runtime.

Focused tests cover actual sealed builds and app handlers: download/import/binding refusal,
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
builds stay untouched; matching bytes confer no ownership. App-managed copies update only when the
shipped source revision changes, preserving enablement. Dirty/invalid installed bytes are diagnosed by
build admission, not automatically repaired on each boot. Outcomes distinguish `unchanged` source
identity, `preserved` user builds and `suppressed` installation; they are not health reports.

Installation decisions participate in synchronous acceptance: save them before registration, restore
them and files on refusal, and initialize after publication. Actual shipped reload also uses transactional
registration there, retaining runtime/catalog/files/records on collision. App/CLI/dev installs explicitly
choose user ownership, clearing app revision/suppression; CLI source recording also precedes acceptance.
Uninstall records removal before deleting files and restores prior records on deletion failure. Boot
pruning retains deliberate removal. Settings/database effects remain outside filesystem/record rollback.

Focused coverage includes repeated boot and removal, byte-identical unrecorded builds, real user
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

`apack pack restore <id> --host <path|beta> [--profile <name>]` selects an app-shipped build,
re-enables it, clears removal suppression and records app-managed updates. It preserves database
settings/content overrides. Source selection uses the existing read-only host-packages resolver:
explicit host flag or associated host handoff/environment, no working-directory inference, app launch
or download. A missing selection or uncached beta is an actionable refusal. Profile chooses stored
state independently of the source host; no profile name chooses an executable or release channel.

Both commands hold the existing profile mutation lock and refuse a running app. Candidate validation,
compatibility, identity, ownership-record update and filesystem acceptance precede publication. Failed
restoration must retain the old build/record or the existing removal marker. Helpers share the same
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
retains the previous build/record or removal marker.

A composed CLI fixture runs restore → replace → boot preservation → uninstall → boot suppression →
restore, using real sealed builds whose runtime throws if activated. Preferences are written to
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
flag from selected build provenance and recorded update ownership; it must not regain authority over
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


### Shipped source catalog prototype (2026-10-13)

The existing declaration catalog's installed/native/authoring inputs define active owners; an app's
available defaults must not enter those settings/help projections and override a selected user fork.
Add a separate app-source projection carrying verified built snapshots, publication-file identities and
source paths, with diagnostics for incomplete or conflicting advertisements. Read it without executing
pack code or writing data. Reject inconsistent source/build/receipt pairs rather than manufacturing an
installed receipt for a source projection.

Boot and explicit restore should share the same source reader instead of separate manifest scans.
Identity follows the manifest, not folder names; duplicate advertised ids name both sources and refuse
selection. Source failures leave installed builds/ownership untouched and remain visible diagnostics.
The host catalog publishes app-source changes independently of active settings definitions, supplying
full advertised-id guards, missing-default restore controls and app-source update offers in the next
consumer integration. This does not remove any other discovery or replacement requirements.

Implemented reader/boot/restore integration: `readAppPackSources` verifies complete source builds and
captures snapshots plus the installation variant's file hashes. Boot and CLI restoration use that
reader; selection never executes pack code. Duplicate ids exclude every claimant, including one whose
build is invalid. `catalog.appPackSources` publishes immutable copies independently of installed
settings owners; withdrawal clears offers without unloading the selected installation. A source-only
publication preserves the effective settings projection identity/revision.

CLI restore carries the selected `expectedSourceRevision` through final filesystem acceptance. A
changed candidate is refused before installation records change, and filesystem acceptance restores
the incumbent. App-managed boot installs likewise check the captured id/revision before accepting.
This binds selection to the offered bytes; it does not imply rollback of post-acceptance data effects.

Focused evidence: 51 host checks and six CLI restore/replacement checks pass, plus the host typecheck.
The ten new source checks include poisoned runtime entries, manifest/folder identity, invalid builds,
duplicate claimants, immutable publication, disabled-fork settings isolation, source withdrawal and
restoration refusal preserving the actual incumbent receipt/record. Removing the restore revision guard
makes its regression resolve instead of reject; the source was restored and 24 source/catalog checks
then passed. The reader owns no active bindings and creates no synthetic installed receipts.

Remaining consumer integration: advertised-id installation guards, missing-source diagnostics and
restore controls, live deliberate replacement/restoration, app-source update offers, provenance-only
uninstall/toggle decisions and the complete external fork/restart/reload acceptance matrix. This
checkpoint does not complete replacement or any other unfinished goal phase.

Strict checkpoint validation passes all 30 gates in 355.4s (one cached), including real external-pack
app and packaged authoring. Evidence:
`node_modules/.cache/apack-chain/runs/2026-10-13T20-52-16Z-20954`;
`/private/tmp/apack-app-sources-strict-chain.log`.
This is not the final full-goal strict `--all` run and does not resolve the independent fixture/API
shutdown cleanup race recorded above.


### Live controls implementation plan (2026-10-13)

1. Publish installation update ownership and app-source offers separately in `PACKS_LIST`; include
   invalid-source diagnostics and missing defaults. No source advertisement becomes an installed row.
2. Use explicit `REPLACE_PACK { packId, packSlug }` and `RESTORE_PACK { packId, sourceRevision }`
   requests. Reuse normal installer acceptance and startup; require replacement id equality and the
   selected restoration revision. Reserve resolved owner ids across every concurrent mutation.
3. Ordinary live install refuses host, advertised app defaults (including invalid advertisements) and
   app-owned incumbent ids. Deliberate replacement assigns user ownership; restoration enables the
   accepted app-owned build. Refusal retains incumbent resources and records.
4. Remove `canUninstall` and shipping-based disable/uninstall restrictions. The host remains non-removable;
   it is not an installed pack. Present all installed packs with the same controls and explain update
   ownership. Show explicit replacement input, restoration confirmation and missing-default restore
   actions. Keep load/source failures visible independently of ownership.
5. Prove actual sealed-build replace/restore/disable/uninstall behavior, invalid/stale offer refusal,
   named-id collisions and control event routing; update public contracts/docs and run strict validation.

App-source update offers and standalone CLI host-selection/advertised-id enforcement are subsequent
consumer checkpoints, not implicitly supplied by these live controls. Complete external fork/restart/
reload acceptance and all other goal work remain required.


### Live controls working implementation (2026-10-13)

`PACKS_LIST` now carries update ownership, separate available app defaults and source diagnostics.
Missing defaults are restorable without fabricating installed rows. Every installed pack has enable/
disable/remove controls; host remains native and non-removable. The frontend uses the backend's
outgoing event type rather than a duplicate payload contract.

Ordinary live install refuses advertised ids even without active origin metadata, including invalid
source advertisements; it also refuses an app-owned incumbent if advertisements are withdrawn.
`REPLACE_PACK` requires incoming id equality and assigns user ownership. `RESTORE_PACK` validates the
selected offer revision before staging and again during filesystem acceptance, then enables app updates.
Both share the accepted-runtime startup path. Detail restoration confirms the selected revision;
source refresh cannot silently substitute a different build. Replacement input explains stored-setting
preservation. Removal confirmation is now visible in the selected detail pane.

The lifecycle audit also corrected save/teardown ordering. A failed enablement write leaves runtime
unchanged. Removal stops runtime only after deletion succeeds; a refused record write/deletion does
not itself deactivate the incumbent. The canonical cache path is captured before deletion and cleared
on success. This is not atomic recursive deletion: a filesystem failure partway through deletion may
leave incomplete bytes, which ordinary build admission must diagnose. Cleanup callbacks after
accepted deletion likewise cannot restore arbitrary data effects.

Focused checks currently pass 67 host lifecycle/system/routing checks and nine renderer checks, plus
host and renderer typechecks. Sealed-build cases exercise the complete live restore → replace →
restore cycle, missing/disabled/activation-failed/invalid advertised ids, stale restoration, replacement
id mismatch, disabled declaration preservation and removal suppression. Renderer checks verify
selected-revision confirmation, explicit replacement, and detail removal confirmation. The real Electron
control test passes independently against the rebuilt app, including explicit replacement of the absent
default and active restoration; final strict validation remains due.

App-source update offers, standalone CLI advertised-id enforcement, selected-copy provenance cleanup
and the full cloned-source edit/build/restart/reload matrix remain required. Nothing here completes
other unfinished discovery/navigation/fault/API/provenance work or final full-goal validation.


### Actor and binding retirement correction (2026-10-13)

The first real control test failed after disabling default-setup: its Logs actor received log events
through a still-live subscription after generated settings authority had been revoked, crashing the API.
Stopping actors by sending `TEARDOWN_PACK` was insufficient because XState queues actual stop and drains
current work. The bus now confirms completion after every active target finishes, including callback
cleanup; teardown unregisters/revokes the pack only then. A composed test requests stop from inside the
actor's own action and proves current work and subscription cleanup precede authority retirement.

Extending the real UI cycle exposed the same defect on active replacement/restoration. Registry admission
still validates and publishes the candidate before retiring anything. Runtime coordinators now supply
`PackReplacementOptions.retireBinding`: incumbent settings authority survives until its actors finish
stopping, then the host disposes its captured binding. Direct registry-only replacements retain immediate
retirement. The installed acceptance path and ordinary dev reload both use this coordinator. Candidate
refusal still preserves incumbent actors/bindings; post-commit retirement diagnostics never masquerade
as installation refusal. Candidate actor startup remains separate from admission and filesystem commit.

The final focused suite passes 100 host tests. Three mutations fail their intended assertions:
removing advertised-source protection admits absent/disabled/failed default ids; removing replacement
id equality installs a different owner; retiring the incumbent immediately revokes its handle before
actor cleanup. Original source is restored. Nine renderer checks pass. Real Electron acceptance now
passes disable → remove → replace by explicit id as user-managed → restore over the active replacement
as app-managed, with native settings usable while the default is absent. The replacement deliberately
uses the same verified bytes, proving ownership does not follow byte equality. It is not yet the complete
cloned-source edit/build/restart/multiple-window acceptance matrix.

Per-window stale outgoing delivery remains a separate navigation/readiness requirement. This correction
coordinates owned actor/binding lifetimes; it does not undo arbitrary asynchronous pack side effects,
provide process isolation or fix the independent Electron/API shutdown cleanup race.


Final strict checkpoint validation passes all 30 gates in 357.0s (one cached), including the extended
real default-pack control cycle and packaged authoring. Evidence:
`node_modules/.cache/apack-chain/runs/2026-10-13T21-28-44Z-84566`;
`/private/tmp/apack-live-controls-strict-chain-final.log`.
The earlier failed strict run and targeted active-restoration failure established the two lifetime bugs;
they were fixed before this pass. This checkpoint is not final full-goal `--all` acceptance and does not
close app-source update offers, CLI host/advertisement selection, complete fork/restart/multiple-window
acceptance or the independently recorded process shutdown race.


### App-source update implementation plan (2026-10-13)

- Derive app update offers from verified source revision versus the installed record's `shippedRevision`,
  only for app-managed installed packs. Same-version changed builds can be offered; user forks instead
  retain explicit restoration. Report missing/invalid app sources independently of GitHub checks.
- Add an explicit selected-revision app-update request. Require current app ownership and an existing
  installation; verify selection again at filesystem acceptance. Preserve enablement and settings.
- Share app-source acceptance/record preparation with restoration, while keeping restore's enable/adopt
  semantics distinct from update's ownership/preserve semantics. Disabled updates never activate code.
- Exclude app-managed records from GitHub checks/offers and refuse the remote update route for them,
  even if a stray remote source is recorded. Required identity checks and per-owner reservation remain.
- Verify enabled/disabled updates, same-version changes, user-fork exclusion, invalid/stale offers,
  ownership change during acceptance and failed candidate preservation; update UI/contracts/docs,
  run focused checks and strict validation, then commit this checkpoint.


### App-source update working implementation (2026-10-13)

App update offers are derived from verified app sources versus recorded `shippedRevision`, only for
app-owned installed packs. Source errors are visible; user-owned forks receive explicit restoration
instead of app update offers. A changed build at the same version remains an update. No offer is
persisted as a remote release or inferred from byte equality of a user-managed installation.

`UPDATE_APP_PACK` carries a selected source revision separately from the remote `UPDATE_PACK` route.
`updateShippedPack` shares source verification and record acceptance with restoration but requires
current app ownership and an existing installation. Ownership is checked again at acceptance; update
preserves enablement while restore deliberately enables/adopts. Disabled updates do not execute pack
code. Remote release checks/offers and the live GitHub route reject app-managed records, including a
record with a stray remote source. List refresh no longer clears a mutation failure before it can be read.

Focused evidence: all 109 host checks and 11 renderer checks pass, plus renderer typechecking. Cases
exercise enabled/disabled update acceptance (a poisoned disabled runtime writes no activation marker),
same-version changes, user-fork exclusion, invalid source diagnostics, stale selection refusal,
mid-preparation ownership change retaining incumbent bytes/records, and remote exclusion without fetch.
Three ownership/enablement/remote-exclusion mutations fail their specific assertions; the restored
suite passes. Strict checkpoint validation passes all 30 gates in 359.0s (one cached), including real app and
packaged authoring. Evidence: `node_modules/.cache/apack-chain/runs/2026-10-13T21-47-31Z-16865`;
`/private/tmp/apack-source-updates-strict-chain.log`.

Standalone CLI host/advertisement selection, selected-copy provenance cleanup and the full cloned-source
edit/build/restart/reload/multiple-window matrix remain required, along with every other unfinished goal
phase. This is not final full-goal acceptance or a fix for the independent process shutdown race.


### CLI advertised-id guard implementation plan (2026-10-13)

Ordinary `pack install` must know the source app before it can protect advertised default ids, especially
before first launch or after uninstall. Require `--host <path|beta>` or the existing associated host
handoff; neither cwd nor `--profile` selects that source. Share offline host selection with restoration,
including explicit-selector precedence and cached-only beta. Check the selected packages directory exists,
then read the common source catalog without executing pack code or downloading an app.

Refuse every advertised id, including invalid/duplicate advertisements, and app-managed incumbent ids.
Reserve the native host id regardless of source selection. Explicit `pack replace <id>` remains independent
of the source app because its named operation already authorizes replacement; identity validation remains.
Update owned CLI callers/help/docs and prove absent/disabled/failed/removed default guards, unrelated
installs, selected-host precedence, profile independence, missing selection and no network/activation.


### CLI source selection and reservation working implementation (2026-10-13)

Ordinary install now requires a selected/associated offline host. `selectedHostPackages` is shared
with restoration, honors explicit selection over resolved handoffs and checks the packages directory.
No cwd/profile inference, launch or beta download is introduced. Named replacement remains usable
without selecting a source app. The native host id is refused regardless of operation.

The guard reads current advertisements immediately before placement, including source diagnostics,
and rechecks current installation ownership. A download cannot bypass an advertisement added while
it was in progress. Refused placement leaves installed builds and records unchanged; unrelated
pack IDs remain installable in custom profiles. Host-version/build-format checks still use the selected
storage profile's recorded app compatibility, independently of which source app advertises defaults.

All 34 focused CLI tests pass, including the real bin invocation, absent/disabled/failed/removed/invalid
advertisements, explicit host precedence, custom profile independence, cached-only beta and a source
change during download. Executable fixture entries throw if activated; these offline paths do not load
them. Removing advertisement protection makes all six targeted regressions resolve instead of reject;
original source is restored and the same focused suite passes.

Remaining replacement acceptance includes selected-copy provenance cleanup and actual cloned-source
edit/build/restart/reload/multiple-window checks. Every other unfinished goal phase remains required;
this checkpoint does not establish full-goal completion or fix the independent process shutdown race.


The first strict run passed real-app checks but exposed a missed packaged-authoring shell caller.
That install step now passes the same known checkout used for its build, retaining offline behavior
and authoring outside the monorepo. Final strict validation passes all 30 gates in 97.2s (21 cached),
including fresh packaged authoring/app checks. Evidence:
`node_modules/.cache/apack-chain/runs/2026-10-13T22-12-00Z-78713`;
`/private/tmp/apack-cli-source-guard-strict-chain-final.log`.
The prior run's failure is recorded in `node_modules/.cache/apack-chain/runs/2026-10-13T22-05-33Z-49117`;
no guard or test expectation was weakened to bypass the missing selector. Final full-goal `--all`
acceptance and the independently recorded shutdown race remain outstanding.


### Runtime provenance cleanup plan (2026-10-13)

`PackOrigin.shipped` is an id classification, not evidence that the installed copy came from the app.
It still drives loader priority and is carried through replacement; `shippedPacks()` has only fixture
readers. Remove the flag, query and loader argument plumbing rather than inventing another ownership
cache. Verified installed origin remains path/declaration/build identity; installation records own
update policy; the app-source catalog owns advertisements. No replacement flag or compatibility alias.

Remove advertised-id load priority. Use deterministic pack-id order and retain named registration
conflicts; shipping does not grant a designation privilege. This does not substitute for the remaining
catalog navigation/eligibility policy or dependency-readiness work. Migrate owned runtime/harness/tests,
prove conflict diagnostics and build identity, then run strict validation and commit.


### Selected runtime identity cleanup working implementation (2026-10-13)

Removed `PackOrigin.shipped`, `shippedPacks()` and all loader/boot/reload/harness argument propagation.
Runtime origins now describe verified selected builds without falsely claiming app-source provenance
from an advertised id. Updates still follow installation records; available app defaults remain a
separate source projection. No alias or replacement ownership cache is introduced.

Loading uses deterministic pack-id order, removing advertised-id priority. A designation conflict still
refuses the later registration and names both owners; this is not the final catalog eligibility/navigation
resolver. Content application retains its separate dependency ordering. Owned fixtures and API boot/reset
composition use the common loader without shipping arguments.

All 148 focused host loader/reload/registration/migration/event checks and the host typecheck pass.
A verified app advertisement shares an id with a different selected user build; the actual loaded
origin retains that build's path, version, receipt/file identity while the advertisement remains
unchanged. Conflicting designation checks verify deterministic order and both owner diagnostics.
Strict validation passes all 30 gates in 390.7s (one cached), including actual app and packaged authoring.
Evidence: `node_modules/.cache/apack-chain/runs/2026-10-13T22-20-12Z-93616`;
`/private/tmp/apack-runtime-provenance-strict-chain.log`. Actual cloned-source editing,
restart/reload and multiple-window acceptance remain open, as do all other unfinished goal phases.


After correcting two stale comments, the final committed candidate's strict recheck passes all 30 gates
in 208.7s (15 cached), evidence `node_modules/.cache/apack-chain/runs/2026-10-13T22-27-18Z-24275`;
`/private/tmp/apack-runtime-provenance-strict-chain-final.log`. The preceding full checkpoint run
supplies unchanged real-app/packaged-authoring evidence. No version/release metadata changes and no
archive of unfinished plans. The independent process shutdown race and final full-goal `--all` remain due.


### Actual default-pack fork acceptance plan (2026-10-13)

Copy the real default-setup sources into a temporary external pack, excluding build/cache output.
Use the established external-authoring test toolchain setup; source and generated output remain private
to the clone. Edit the manifest's display name and an executable frontend plugin label, keeping owner
ids and versions unchanged. Build/archive with the public CLI and verify the emitted receipt.

Install deliberately at the default id into isolated app data. In actual Electron windows prove the
fork's label and retained preference values, live replacement and frontend acceptance, dev reload and
restart preservation, then disable/uninstall/restoration distinctions. Compare accepted installed bytes
and recorded update ownership around boot/reload; never treat matching bytes as app ownership.
Use normal shutdown/startup and fix demonstrated lifecycle bugs rather than killing the app or
weakening timeouts/assertions. Multiple-window refresh must show the accepted fork consistently.
Published-tarball isolation is already covered separately by packaged authoring; this clone test must
state when its build borrows the checkout toolchain rather than claim distribution hermeticity.


### Real clone and multi-launch acceptance working implementation (2026-10-13)

The new E2E case copies actual default-setup outside the checkout, excludes prior output, edits its
manifest name and executable Notes plugin label, then builds and archives through the public CLI.
It borrows the established test toolchain link; it does not claim published-package hermeticity.
Two actual windows accept the changed frontend, the authenticated dev-reload endpoint retains it,
and a preference acknowledged in a second settings window survives both operations. Initial test
failures corrected fixture assumptions: build uses supported `APACK_HOST`, and pending form drafts
must be acknowledged before testing stored-value preservation. Form-disposal cancellation remains
unchanged, consistent with existing regression tests.

A repository-only runner drives four normal Electron launches over its own temporary data. It uses
`fixtureEnv` and then deliberately supplies caller-owned storage; public `pack test` continues clearing
inherited storage overrides. The runner verifies the accepted user build receipt/label/ownership
and preference survive restart, restores app ownership via offline CLI, uninstalls through CLI,
proves host-only boot preserves removal suppression and host settings, then restores the app default
and proves app ownership/Notes/preferences return. The dependent external fixture is uninstalled for
host-only absence; its dependency requirement is not weakened. Raw record assertions use the current
`{ packs: [...] }` format. All four targeted launches pass.

The normal external-pack app gate runs the live test and this lifecycle runner, with the new runner
explicitly included in its fingerprint inputs.
The first full run refused test collection in the lifecycle runner: its direct CLI path used the
checkout's lower-case spelling while the testing fixture resolved the canonical path, producing two
Playwright module identities on macOS. Using the public CLI's resolver alone reproduced the refusal:
Node's JavaScript `realpathSync` preserves supplied case aliases, while `realpathSync.native` restores
the on-disk casing. The runner now canonicalizes its checkout with native realpath before using the
existing `resolvePlaywrightCli(pack)` used by public `pack test`. The ordinary fixture suites had
passed before that collection refusal; the standalone four-launch run also passed from the shell's
final fixture working directory, confirming the failure depended on the resolved path spelling.
Final strict validation passes all 30 gates in 193.2 seconds (22 cached); the full external-pack app
gate ran freshly and passed in 151.8 seconds, including both ordinary fixture suites and all four
lifecycle launches. Evidence: `node_modules/.cache/apack-chain/runs/2026-10-13T23-02-15Z-81766` and
`/private/tmp/apack-real-fork-strict-chain-canonical.log`. Its old measured 18-second cost now understates
the expanded gate; no assertion, timeout or measured-cost declaration was relaxed to obtain this pass.
Unchanged selected source/update ownership and earlier failed-admission cases remain covered by their
existing checkpoints. Full all-kind discovery, navigation, frontend boundaries, API/provenance work
and the independently recorded shutdown race remain required; this acceptance does not close the goal.


### API shutdown completion correction (2026-10-13)

The recorded cleanup race is a product lifecycle defect, not a reason to retry recursive deletion.
Electron's cancellable `before-quit` event provides the coordination point:
https://www.electronjs.org/docs/latest/api/app#event-before-quit.
Stop accepting new API starts once shutdown begins, cancel quit while the API child is exiting, and
resume ordinary quit only after completion. Repeated quit/reload stop requests share the same wait.
Relaunch and startup-error quit must use this boundary rather than bypassing it through `app.exit`.
The existing last-window terminator retains platform policy; the API module needs no second listener.

The process manager previously resolved after its deadline even if the child survived, and treated
Node's `killed` signal-delivery flag as proof the process was gone. Neither can support cleanup safety.
Timeout now rejects, pending shutdown remains live, concurrent stops retain one exit waiter, and exit
clears both deadline and escalation timers. An unsuccessful quit remains cancelled and logs its cause;
a subsequent request can retry. This does not claim the separate Electron hidden-window native stall
has been fixed, and does not force-kill Electron itself.

Focused checks cover real child exit, signal escalation, cancellation, failure/retry and concurrent
requests. The app fixture captures the current API pid before closing Electron and fails the test if that
child survives Electron close. The actual app gate must pass this check, rather than relying on a
passing repeat of recursive removal. All 51 main unit tests and main/testing typechecks passed before final review. Initial strict validation
passes all 30 gates in 485.3 seconds (one cached), including real external app and packaged authoring;
its external app gate ran in 158.9 seconds with child-exit assertions. Evidence:
`node_modules/.cache/apack-chain/runs/2026-10-13T23-09-45Z-96278` and
`/private/tmp/apack-coordinated-shutdown-strict.log`.

Final review adds a late-exit regression: an API can exit after a failed wait discarded its listener;
a subsequent stop recognizes the actual exit status instead of waiting for an event that already ran.
All ten focused checks pass. Removing quit cancellation fails both coordinator tests; making timeout
resolve instead of reject fails both refusal assertions. Exact source is restored and all focused
checks pass again. Final strict validation on the reviewed candidate passes all 30 gates in 226.6 seconds (18 cached),
including the freshly run external-pack app gate in 160.2 seconds. Evidence:
`node_modules/.cache/apack-chain/runs/2026-10-13T23-18-58Z-29821` and
`/private/tmp/apack-coordinated-shutdown-strict-final.log`. The coordinated-quit API/fixture cleanup
race is resolved by waiting for actual child exit, with real teardown assertions. The separate native
Electron hidden-window shutdown stall is not claimed fixed. Remaining discovery, navigation, pane
boundaries, API/provenance work and final goal-wide strict `--all` acceptance remain open.
