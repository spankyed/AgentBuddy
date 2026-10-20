# PR #246 review repairs — 2026-10-19

Disposition of the findings in [the review](pr-246-review.md), checked against current source.
The review documents being edited separately are preserved; this record owns repair verification.
No CI, broad integration suite, packaged application, or native compiler fixture was run for this repair.

## Disposition

| Findings | Resolution | Source checkpoint |
|---|---|---|
| 8.1, 8.2 | Import retains durable rollback files through hydration/acceptance. Recovery restores memory too; a failed recovery preserves both errors and names the retained copy. | `53da4c140` |
| 8.3, 8.5, 8.6 | Replacement-owned initialization/migration writes are allowed; unrelated writers remain refused. Import lifecycle documentation and reset/import refusal text are corrected. Detached initialization loses its privilege when its operation ends. | `c960deca3`, `d282c7624` |
| 8.4 | One app-data service refuses overlapping resets/imports, including import preflight. | `53da4c140` |
| 2.1, 2.3, 2.4 | Explicit reinstall enables a deliberately removed pack, including through actual installer/callback ordering; ordinary disabled updates stay disabled. A healthy verified producer repairs a damaged same-revision cache. CLI record documentation is corrected. | `46ef9a95e`, `88be3f633` |
| 1.1 | Discovery reports both conflicting destination owners and withholds their activation, allowing boot to continue. It retains rejected claims for subsequent admission checks. Explicit candidate publication still refuses collisions. Disabling a claimant resolves the catalog conflict on refresh. | `fed33dae8` |
| 1.2 | Disabled shipped/dev reloads refresh their installed build and catalog without loading or starting the runtime. | `fed33dae8` |
| 2.2 | Previous builds remain uncommitted until synchronous acceptance; retired builds are committed cleanup. Recovery restores the incumbent even when the candidate reached its final path, restores only its ownership row, preserves unrelated rows, and never sweeps failed/ambiguous recovery copies. Installed admission refuses unresolved interrupted candidates. | `88be3f633` |
| 1.3, 2.5 | Host module, hashing and recovery guides now match current source. | Documentation accompanying this record |
| 5.3 | A successful save carries the committed snapshot. The window applies it before resolving the write, preserving sequential comparison correctness before the broadcast. Duplicate frames do not republish. Invalid acknowledgements cannot claim success. | `d3f3e1765` |
| 5.4 | Backend and accepted frontend bindings share target/owner/dependency authorization. The host window port remains administrative. | `d3f3e1765` |
| 5.5 | Personal autosave awaits one submission at a time. Its own echo preserves newer typing; remote/reset changes replace the draft and cancel queued saves. Equivalent snapshots and disposal are covered. | `8ec60b1e5`, `f6eceeeda` |
| 7.1 | Service facades refuse structural mutation of mutable provider objects and nested objects. They do not write patches through to shared services. Provider methods retain their actual receivers. | `7b68cad48` |
| 7.2 | Accepted step bindings carry their owner's service factory; execution supplies that factory rather than the flow runner's. Selection, sender attribution and retirement belong to the step owner. Authored handler identity is preserved. | `7b68cad48` |
| 7.3 | Undeclared service reads identify the caller, missing name and `consumes.services`. Ordinary JS promise/serialization probes remain valid. | `7b68cad48` |

## Findings that require distinguishing a contract from a defect

**5.1: admission and explicit recovery implemented.** `8d31bdccc` checks candidate declarations
before placement/publication; `3a6b649b5` checks persisted preferences before executable boot and
provides host-only recovery with an atomic explicit reset and relaunch. Typed settings remain strictly
validated. No grandfathering, conversion or implicit discard is added. The host retains a repaired
recovery state across window reconnects until relaunch. See [settings recovery evidence](settings-recovery.md)
for focused checks, the startup-related S.1/S.2 resolution, and native/packaged acceptance limits.

**5.2: preserve explicit intent; correct the guide.** The
[settings plan](../archive/plans/settings-architecture.md) expressly requires whole-document replacement
to record every supplied value, including default-equal values. Reset opts back into future defaults.
The writer and its test implement that decision. The contrary "only what changed" guide was stale and
is corrected; no default-pruning behavior is introduced.

**2.5: factual correction.** `packFileHashes` exists in
[assets.ts](../../packages/apack-host/src/packs/assets.ts) and is re-exported through layout. The defects
were the guide's parameter/usage description and obsolete `publishing` staging kind, not a missing
function. The updated guide distinguishes sealing hashes, verified receipt projections, source revision
comparison and installed verification.

## Verification

All focused Vitest runs used at most two workers. Final source checks:

- 148 cases across ten settings/runtime, API transport, renderer, service-binding, registry-isolation
  and step-catalog files pass. `/private/tmp/apack-review-final-focused.log`.
  The final window-runtime file also passes 37 cases after adding malformed-save-acknowledgement
  coverage: `/private/tmp/apack-review-save-ack-tests.log`. Seven final Personal form cases also cover
  edits made after a reset while an older save is settling: `/private/tmp/apack-review-personal-final.log`.
- 74 install/cache/discovery/recovery/reinstall cases across six files pass.
  `/private/tmp/apack-review-final-install-tests.log`.
- 161 catalog/registration/replacement/reload/recovery cases pass at the preceding pack checkpoint.
  `/private/tmp/apack-review-pack-tests.log`. Some overlap the final install batch; do not add the totals.
- Seven filesystem import-transaction and host-service cases pass, including failed acceptance,
  recovery-error preservation and overlapping replacement refusal.
  `/private/tmp/apack-review-transaction-tests.log`.
- Host and CLI typechecks pass. The subsequent step/settings edits pass the host typecheck; renderer
  application/test typechecking and default-setup typechecking pass. Scoped renderer ESLint and source
  Oxlint pass. Logs: `/private/tmp/apack-review-final-types.log`,
  `/private/tmp/apack-review-final-host-types.log`, `/private/tmp/apack-review-renderer-types.log`,
  `/private/tmp/apack-review-pack-types.log`, `/private/tmp/apack-review-renderer-lint.log`,
  `/private/tmp/apack-review-personal-lint.log`.
  Final host/CLI checks: `/private/tmp/apack-review-closeout-types.log`.
- Published workspace packages were rebuilt once for current SDK declarations. The regenerated step API
  report changes only `StepBackendBinding.servicesForAction`; all 28 SDK API reports check current.
  `/private/tmp/apack-review-api-check.log`.

### Remaining acceptance limits

The real-LMDB import spec aborted inside the native addon before yielding case results. macOS recorded
`SIGABRT` with `___BUG_IN_CLIENT_OF_LIBMALLOC_POINTER_BEING_FREED_WAS_NOT_ALLOCATED`, with `lmdb.node`
frames in environment close/open. Evidence:
`~/Library/Logs/DiagnosticReports/node-2026-10-19-210159.ips`,
`/private/tmp/apack-review-backup-focused.log`. Retrying was stopped. A module-only LMDB import succeeded;
the real environment-open/hydration acceptance is **unproven**. The real-LMDB regression cases remain;
the passing filesystem transaction cases mock only database inspection and do not substitute for that gate.

No newly built Electron application or default-setup runtime was exercised. In particular the actual
flow executor's step-owner injection has source/type and binding coverage, but no fresh external/app
integration run. Existing historical acceptance is not attributed to these source changes. The earlier
[goal evidence](settings-and-pack-contracts.md) now bounds its closure claim to the source actually run.
Fresh integrated acceptance remains outstanding under the user's no-CI instruction.

Recovery uses the existing PID/boot-time ownership heuristic, not an OS crash-consistency guarantee.
If retirement cannot be recorded after runtime acceptance, the helper warns and retains the prior copy;
next-boot recovery conservatively restores it. Filesystem recovery cannot undo arbitrary runtime side
effects. Ambiguous copies are preserved for explicit recovery instead of choosing one by directory order.
