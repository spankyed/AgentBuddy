# CLI selectors: consistent meaning across commands

Status: selector work planned; public app-development namespace removal implemented. Baseline: `c3af5ea1f` (2026-10-11).

## Purpose

Give each selector one meaning wherever it appears. Commands accept the selectors that apply to
their operation; they do not need identical options.

The original problem was ambiguous command purpose: opening an installed app and controlling a
development session were mixed under `open --session` and root-level `drive`. Separating development
automation from installed-app commands corrected that boundary. App development now lives only
behind repository npm scripts; the distributed CLI serves installed-app management and pack authors.
Splitting executable selection between
`--app` and `--channel` then introduced another ambiguity: `--channel beta` selects an installed
release in app commands but a downloaded authoring artifact in pack commands.

Keep the command boundaries and lifecycle fixes. Replace the inconsistent selection rules without
adding production debugging or changing release scripts, versions, or stored data.

## Selector contract

| Selector | Question it answers | Values |
|---|---|---|
| `--channel` | Which published/installed app release? | `production`, `beta`, `preview`, where supported |
| `--host` | Which executable artifact runs this development/test operation? | Checkout path, `.app` path, or `beta` for a downloaded release artifact |
| `--profile` | Which stored database/settings directory? | Built-in names such as `production` and `development`, or a custom profile name |

`--host beta` always means a cached/downloaded authoring artifact, never the installed beta app.
Its actual channel comes from build metadata: the release source does not establish runtime identity
or debugging capability. Preserve manifest `hostVersion` compatibility checks.

Paths are expanded and normalized. Treat the exact value `beta` as a named host; use `./beta` for a
checkout directory with that name. Keep explicit profile-directory options where they are currently
needed, with conflicts against named profiles rejected.

Replace executable `--app` and authoring `--channel` with `--host`. Replace storage `--data` with
`--profile`. Remove the superseded forms and migrate callers together; do not retain aliases.
Do not rename unrelated options such as `pack add migration --app`, whose meaning is migration scope.

## Command boundaries and defaults

| Operation | Selectors | Default and constraints |
|---|---|---|
| App install/upgrade/uninstall | `--channel` | Production; published channels only, no preview installation |
| App open/doctor | `--channel` | Production; installed channel identity determines its normal data location |
| Repository `dev:open` | `--host`, `--profile` | Current source checkout and development profile; source debugging host required |
| Repository `dev:drive` scripts | `--host`, `--profile` | Source checkout; disposable test profile unless explicitly selected |
| Repository `dev:drive` live questions | `--profile`; `--host` only with `--spawn` | Existing development session; no implicit launch except an explicitly fresh run |
| Pack dev | `--host`, `--profile` | Checkout when applicable, otherwise compatible downloaded host; validate live-development capabilities before launch |
| Pack drive scripts/test | `--host`, `--profile` | Preserve each command's documented host-resolution policy; isolated test profile by default |
| Pack drive live questions | Same session rules as repository drive | Requires the pack context, but does not infer a different session from it |
| Database and pack install/uninstall/list | `--profile` | Production for standalone CLI; document bundled CLI defaults explicitly |

The matrix separates selection from capability. A valid artifact can still be unsuitable for an
operation. Refuse it before launching, with an error naming the missing capability and a usable
alternative. Retain the current production-host refusal for live pack development during this work;
any relaxation requires a separate decision about isolation and runtime behavior.

Do not enable TCP debugging in production, beta, or preview bundles. Packaged test automation retains
its existing isolated launch mechanism; choosing a host does not grant live attachment capability.

## Profiles and session identity

Built-in and custom profiles use one resolver. Reject custom names that collide with built-in names;
do not move existing directories. Resolve temporary profiles as well as persistent ones, and reject
ambiguous matches. An explicitly selected built-in profile uses its canonical directory rather than
an inherited data-directory override.

A profile locates a session; it does not prove which executable owns that session. Record the
normalized host identity and runtime capabilities in the session descriptor. Verify these before
attachment. For either drive entry point with `--spawn --host …`, attach only when an existing session matches the requested
host; otherwise fail without stopping or replacing it. With no live session, resolve the host and
launch explicitly. Do not silently ignore an executable selector or environment override.

Only the launching supervisor owns cleanup. Reusing a temporary profile does not acquire deletion
ownership. Keep shared, awaited shutdown so concurrent exit paths cannot skip cleanup.

## Resolution and environment rules

Use one host resolver and one profile resolver. Keep command-specific default policies explicit
rather than embedding them in argument parsing. Return typed results containing actual artifact
identity, metadata, paths, and supported capabilities; downstream code must not infer channel from
download origin or a filename.

Public host selection uses `--host` and `APACK_HOST`, replacing `APACK_APP` and authoring
`APACK_CHANNEL`. Explicit flags override public environment defaults. Reject duplicate or conflicting
explicit selectors. Validate environment defaults when they are used, rather than letting an unused
inherited selector invalidate an explicit choice.

Keep resolved child-process handoffs separate from public selection: `APACK_ENV`,
`APACK_USER_DATA_DIR`, source root, and executable path describe an already resolved launch.
Audit their callers before changing names; avoid unrelated internal renames. Never use a shell
override to redirect an explicit production-profile operation to another directory.

## Repository development boundary (implemented)

There is no public `apack dev` namespace. Preserve `npm run dev` and `dev:inspect` for source watchers,
`dev:open` for a built source session without watchers, and `dev:drive`, `dev:eval`, `dev:query`, and
`dev:state` for app automation. These call `scripts/app-dev.mjs` directly through source resolution.
Detached app `--spawn` uses the same entry point in the repository checkout; it cannot depend on a
removed public command. Pack authors retain `apack pack dev`, `pack drive`, and `pack test`.
App-only launch help and routing live in repository tooling, not CLI command modules.
App contributor instructions belong in the root README and drive guide; public CLI help and docs
address installed-app users and external pack authors. Shared internal session and automation code
remains reusable by both entry points.

This boundary is implemented separately from the selector replacements below. Current `--app`,
`--channel`, and `--data` forms stay in place until the selector work is implemented.

## Implementation sequence

1. Inventory selector consumers, environment readers, command defaults, and session descriptors.
   Confirm the matrix against actual launch and test mechanisms; document any required exception
   before implementing it.
2. Consolidate typed host/profile resolution and capability validation. Add host identity to session
   publication and verify it on attachment. Preserve existing debug gates and cleanup ownership.
3. Replace public flags and host environment selection. Make unknown, duplicate, and incompatible
   options fail before download, launch, database mutation, or installation.
4. Migrate command help, npm wrappers, CI, scaffolds, testing helpers, current docs, and tests together.
   Leave historical records and release scripts alone. Update stale current guidance describing
   `-d`, `-b`, `--build`, executable `--app`, or storage `--data`.
5. Verify behavior, review the final matrix against help output, and commit the implementation.

## Acceptance checks

- Root `apack dev`, `dev open`, and `dev drive` are rejected; repository npm entry points retain
  launch, script, and one-shot automation, including detached spawn. Pack development remains public.
- Every accepted selector has the meaning in the contract; unsupported selectors produce an error.
- A downloaded artifact stamped production is identified as production and cannot become a live
  debugging host through its download label.
- Explicit flags beat valid inherited defaults; duplicates and conflicting selectors fail before
  side effects. No public host selector is silently ignored when attaching.
- Source launch, attach, explicit spawn, host mismatch, child exit, and temporary-profile cleanup
  behave correctly, including repeated shutdown requests.
- Built-in, custom, and temporary profile lookup agree across database, pack, launch, and attachment
  commands; canonical selection is unaffected by an inherited data-directory override.
- Pack test defaults still honor `hostVersion` and use disposable state. Live development refuses
  unsupported packaged hosts before launching.
- No app-management command publishes a debugging session or enables production attachment.
- Run focused behavioral specs, a real source launch/attach/stop check with disposable data, and
  `npm run chain`. Use serial execution if concurrent Electron teardown reproduces the known timeout.

## Completion

Users can choose a release, executable host, or stored profile without learning different meanings
for the same option. Help explains legitimate capability restrictions. The implementation retains
the verified lifecycle fixes and adds no compatibility layer, data migration, or production debugging.
