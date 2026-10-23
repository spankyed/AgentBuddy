# Required fields when a data dir is opened outside the app

Status: deferred by request, 2026-10-23. Notes to come back to; nothing designed.

## The gap

Inside the app, the engine refuses a row without its required fields for every pack's shapes: codegen reads them
off each shape into the pack's registration (`PackEARS.requiredFields`). A data dir opened by `apack db`
(`openAppDatabase`, `packages/apack-host/src/database/`) builds its schema from the installed packs' manifests, and
a manifest names a shape as `path#Export` without carrying it, so the tool checks only the SDK's own
(`SDK_REQUIRED_FIELDS`). `apack db exec` and `db script` can therefore write a `Note` the app would refuse.

## The idea

Put each pack's required fields in its built snapshot (`snapshot.types`, beside `relKinds` and `roles`), which
codegen already computes, and have `readInstalledSchema` read them from there. A `--schema-from` snapshot would
then carry them too.

## Questions before building

- Whether a pack built before the field existed reads as "requires nothing" or refuses to open for writing.
