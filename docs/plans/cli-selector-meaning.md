# CLI selectors: consistent meaning across commands

Status: implementation and cleanup verified; final review complete; ready for commit.

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
| Repository `dev:open` | `--profile` | This repository checkout and development profile; no executable selector |
| Repository `dev:drive` scripts | `--profile` | This repository checkout; disposable test profile unless explicitly selected |
| Repository `dev:drive` live questions | `--profile` | Session belonging to this checkout; --spawn launches this checkout if absent |
| Pack dev | `--host`, `--profile` | Checkout when applicable, otherwise compatible downloaded host; validate live-development capabilities before launch |
| Pack drive scripts | `--host`, `--profile` | Explicit host, linked checkout, then compatible downloaded beta; disposable test state by default |
| Pack test | `--host` | Explicit host or compatible downloaded beta; always disposable state; no persistent profile/secret flags |
| Pack contract tests | None | No app launch; executable selectors are refused |
| Pack drive live questions | `--profile`; `--host` only with `--spawn` | Pack context required; explicit host must match an existing session or be suitable for a new source debugging session |
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
attachment. Repository automation always verifies ownership by this checkout. For pack drive with
`--spawn --host …`, attach only when an existing session matches the requested host; otherwise
fail without stopping or replacing it. With no live session, resolve the host and launch explicitly.
Never silently ignore an explicit executable selector. Public environment defaults apply only when
selecting a host for a launch, as defined below.

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
Use the exact handoff names and migration rules defined in the naming audit below. Never use a shell
override to redirect an explicit production-profile operation to another directory.

## Settled terminology and naming audit

The `APACK_BUILD` → `APACK_APP` and `--build` → `--app` changes tried to distinguish executable
selection from compilation. A broad build-to-app replacement did not establish that distinction:
`app` still described artifacts, runtime environments, storage defaults, and the product itself.
Audit by payload and responsibility; do not perform another global word replacement.

| Term | Meaning | Examples that retain the term |
|---|---|---|
| Build | Compilation or the resulting artifact and its metadata | `pack build`, build scripts, `build-manifest.json`, build version |
| Channel | Packaged app identity or published release lineage | `AppChannel`, `PublishedAppChannel`, metadata `channel` |
| Environment | Runtime mode, including development and test | `AppEnv`, `APACK_ENV` |
| Host | Executable artifact selected to run a pack | `PackHost`, `resolvePackHost`, `--host` |
| Profile | Stored state directory, independently of executable identity | profile resolver, temporary-profile ownership |
| App | The desktop product and operations over it | installed app, app version, app lifecycle |

### Audit inventory and decisions

Before changing source, inventory declarations and all readers/writers across CLI, SDK, host,
testing, Electron/API, repository scripts, CI, scaffolds, current docs, and specs. Search for the
old and current names, including `APACK_BUILD`, `--build`, `APACK_APP`, `--app`, `APACK_CHANNEL`,
`AppBuild`, `AppTarget`, `AppChoice`, `build`, and `app`. Inspect occurrences; unrelated build or
app concepts are not rename candidates. Record any additional overloaded declaration here with
its payload, owning layer, chosen name, consumers, and whether it crosses a persisted boundary.
The following decisions are the initial inventory, checked against this checkpoint's source:

| Current surface | Final decision | Reason / owner |
|---|---|---|
| Executable `--app`, `APACK_APP`, old executable `--build`, `APACK_BUILD` | Pack commands use `--host` / `APACK_HOST`; old forms rejected | One public request for a pack host, owned by CLI selection |
| Authoring `--channel beta`, `APACK_CHANNEL` | Move to host selection; reject in authoring operations | Download source is not installed-app channel selection |
| Repository executable options and selector environments | Remove support; reject explicit executable flags; ignore inherited public host defaults | Repository tooling owns the checkout identified by its entry point, not cwd or a pack's linked dependencies |
| `AppTarget`, `AppChoice`, `AppFlags`, `parseAppFlags` | `PackHost`, `HostSelection`, `HostFlags`, `parseHostFlags` | Distinguish the resolved artifact from a user's request; keep build toggles separate |
| `resolveLaunchApp`, `resolvePinnedApp`, `deriveApp` | One `resolvePackHost` with named default policy | Dev/drive may prefer linked checkout; tests prefer manifest-compatible released host |
| `resolveDevApp` | Repository checkout validation; no selector or downloaded fallback | App contributors develop the checkout containing the repository entry point |
| `configuredAppPackagesDir` | Host dependency-package resolution | Dependencies must come from the same selected artifact as execution; source builds need not be launchable |
| `appLabel`, `packagedAppEnv`, `appEnv` when given a host artifact | Name by payload: host description, packaged channel, host runtime environment | Avoid treating an artifact as the whole product; do not rename actual app lifecycle operations |
| SDK `AppBuild = AppEnv`, context/option `build` fields that carry `AppEnv` | Remove alias; use `AppEnv` and `env` | Development/test are runtime environments, not packaged channels or compilation results |
| Channel parser returns `env` and uses widened `AppEnv` | `parseAppChannel` returns typed `channel: AppChannel` | Installed-app selection carries channel identity, independently of storage/runtime defaults |
| Profile management refers to storage targets as builds | Built-in/custom profile names | Storage targets do not select executable artifacts |
| SDK `ReleaseChannel`, CLI `AppChannel`, `PublishedAppChannel` | Canonical SDK `AppChannel` includes preview; published subset remains explicit | One full packaged-channel definition; publication supports production/beta only |
| `APACK_ROOT`, `APACK_APP_EXECUTABLE` testing handoffs | `APACK_HOST_ROOT`, `APACK_HOST_EXECUTABLE` | Resolved source checkout or executable path; neither is the user's selection request |
| `APACK_ENV`, `APACK_USER_DATA_DIR`, `APACK_APP_MANIFEST` | Retain | Runtime environment, concrete storage path, and app build metadata already describe their payloads |
| Build metadata, version guards, build commands, migration `--app` | Retain | Actual build/product concepts; migration option names its version line |

Do not introduce a type alias to preserve an old name. Verify whether renamed context fields are
serialized or stored before changing them. Keep on-disk directory names, database/settings keys,
keychain identities, metadata formats, and release scripts unchanged. If an unexpected persisted
use is found, record it and handle it explicitly rather than silently renaming storage.

### Resolve once, then hand off

Public `APACK_HOST` is a default selection request for pack operations. After resolution, downstream
execution receives exactly one of `APACK_HOST_ROOT` or `APACK_HOST_EXECUTABLE`. Derive dependency
packages from that same resolved host. Do not also pass a public selector that can re-resolve to
another artifact or change when a newer release arrives. Clear inherited host requests and conflicting
resolved handoffs when creating a child environment. Reject two resolved host identities.

Runtime environment and profile remain independent outputs. A test may use a production artifact
in the test environment on disposable state; that does not relabel the artifact or grant debugging.
Session descriptors record the actual executable/checkout identity and capabilities. In a source
checkout, identity means canonical repository path, not a promise of immutable source contents.

### Defaults that cannot drift

Repository scripts derive their checkout from the entry point's location. They neither inspect a
pack dependency to discover a checkout nor honor `APACK_HOST`, `APACK_APP`, or authoring
`APACK_CHANNEL`. Changing cwd or inheriting a pack author's shell settings cannot select another app.
To develop another checkout, run that checkout's npm scripts. Explicit unsupported flags fail with
that instruction; inherited public host defaults are irrelevant to repository operations.

Pack dev and scripted pack drive use an explicit host, then a linked checkout, then a compatible
cached/downloaded release. Pack test uses an explicit host or compatible cached/downloaded release;
linking SDK packages does not silently change the test target. Name these policies at call sites,
and print the selected host and selection reason. Capability checks run before launching: a
resolved beta-origin production artifact remains production and is refused for live development.
Do not silently try another artifact after an explicit selection fails.

Live questions select a session by profile, not by downloading an executable. Without `--spawn`,
reject an explicit `--host`; an inherited host default does not select or replace an existing session.
With `--spawn`, resolve the requested/default host and compare it with any existing session before
attachment. A mismatch fails; it never closes someone else's app. Repository live questions always
expect the entry point's own checkout and use the same ownership check.

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

Repository and pack callers now use the final selector contract above; superseded forms are rejected.

## Implementation sequence

1. Complete the naming inventory above before edits. Identify persisted boundaries and every
   selector/handoff reader. Record additional decisions here; do not expand the public vocabulary.
2. Consolidate typed host/profile resolution and capability validation. Add host identity to session
   publication and verify it on attachment. Preserve existing debug gates and cleanup ownership.
3. Apply the naming audit atomically across declarations and callers. Remove repository executable
   selection, unify packaged-channel types, replace public flags and host environment selection. Make unknown, duplicate, and incompatible
   options fail before download, launch, database mutation, or installation.
4. Migrate command help, npm wrappers, CI, scaffolds, testing helpers, current docs, and tests together.
   Leave historical records and release scripts alone. Update stale current guidance describing
   `-d`, `-b`, `--build`, executable `--app`, or storage `--data`.
5. Verify behavior and review the final matrix against help output; leave the implementation ready for review.

## Acceptance checks

- Root `apack dev`, `dev open`, and `dev drive` are rejected; repository npm entry points retain
  launch, script, and one-shot automation, including detached spawn. Pack development remains public.
- Repository launches and automation target their own checkout even with another cwd or inherited
  host selector. Explicit executable-selection flags are rejected. Existing sessions from another
  checkout are refused before attachment.
- Host dependency packages and execution come from the same artifact; children receive one resolved
  identity with no inherited public selector or conflicting handoff.
- Old executable selectors and handoffs are no longer supported; current help, templates, and docs
  use the new contract. Historical records and explicit rejection messages may name the old forms.
  Legitimate build and app terminology remains. Runtime environment fields use `env` and `AppEnv`.
- Every accepted selector has the meaning in the contract; unsupported selectors produce an error.
- A downloaded artifact stamped production is identified as production and cannot become a live
  debugging host through its download label.
- Explicit flags beat valid inherited defaults; duplicates and conflicting selectors fail before
  side effects. No explicit host selector is silently ignored when attaching.
- Source launch, attach, explicit spawn, host mismatch, child exit, and temporary-profile cleanup
  behave correctly, including repeated shutdown requests.
- Built-in, custom, and temporary profile lookup agree across database, pack, launch, and attachment
  commands; canonical selection is unaffected by an inherited data-directory override.
- Pack test defaults still honor `hostVersion` and use disposable state. Live development refuses
  unsupported packaged hosts before launching.
- No app-management command publishes a debugging session or enables production attachment.
- Run focused behavioral specs, a real source launch/attach/stop check with disposable data, and
  `npm run chain`. Use serial execution if concurrent Electron teardown reproduces the known timeout.

## Review gate

Before committing implementation, review the final command matrix, naming inventory, and actual
help output together. Each selector must have one payload and one owner. Each subprocess must
receive one resolved host and one concrete profile. Trace a repository launch, external pack dev,
pack test, live attachment, and installed-app operation end to end. A new alias, fallback, or selector
exception indicates an unresolved model issue; fix the model rather than documenting the exception.
This is an implementation review checklist, not an additional user-approval requirement.

## Completion

Users can choose a release, executable host, or stored profile without learning different meanings
for the same option. Help explains legitimate capability restrictions. The implementation retains
the verified lifecycle fixes and adds no compatibility layer, data migration, or production debugging.


## Implementation review

- SDK runtime fields use `env` / `userDataDir`; packaged channels use `AppChannel`, and published channels remain the production/beta subset.
- Channel parsing returns `channel`; profile management and command output name built-in/custom storage targets consistently.
- Pack dependency builds and app execution receive the same resolved host. Host-owned dependencies take precedence over ambient workspace copies; missing/incompatible selected-host builds fail instead of substituting another app. Explicit manifest file dependencies remain authoritative. Repository entry points ignore inherited host choices and own their checkout, including when SDK links point elsewhere. Repository driving and spawning validate that root directly; they never derive another host from linked dependencies.
- Source sessions declare host identity and development environment. Attach, spawn, and reclaim refuse mismatched or unverifiable owners.
- Explicit development profile selection survives child spawning without inheriting another data path. Shared launches and attachment honor the same unnamed data handoff.
- Fresh profile IDs retain the full random component; timestamp-prefix truncation had produced collisions during verification.
- Superseded selectors are rejected. Current help, scaffolds, scripts, documentation, and SDK API reports are migrated.
- A disposable source app launched from outside the checkout with invalid inherited host selectors, attached through the same supervisor, and stopped with its profile removed.
- Final `npm run chain -- --cores 1` passed all 30 steps (29 executed, one cached), including integration, packaged authoring, and app smoke tests. Both working-tree and staged whitespace checks passed.


## Final branch review — 2026-10-11

Reviewed the six commits in `master..b2b50fa10` and the cleanup working tree. No GitHub PR exists
for this branch; this review covers the local branch diff. No remaining blocking findings were found.

Cleanup removes duplicated storage parsing, redundant host-selection state and types, unused quit
arguments, and obsolete implementation-history comments. Drive help and scaffolds now interpolate
explicit app/pack command names rather than rewriting another command's prose. Test-host resolution
lives in a small module that can be checked without initializing Playwright fixtures.

Findings fixed during review:

- Fixture host overrides could launch a different app from the CLI-selected dependency host. Conflicts
  now fail; canonical paths and symlink aliases to the same artifact agree.
- Packaged development could reuse an unidentified app occupying its profile. Reuse now requires a
  verified source session; packaged hosts require an unused profile.
- Session readers accepted process-group PIDs and invalid debug ports. Positive integer PIDs and
  valid TCP ports are required before liveness checks.
- A failed secret copy could bypass temporary-profile cleanup. Cleanup ownership is established first;
  secret copying refuses existing profiles instead of silently ignoring the request.
- Live questions ignored unused arguments or cleanup/copy flags during attachment. These now fail
  clearly, including the losing side of a concurrent spawn. Boolean flags reject inline values.
- Pack uninstall help invoked the error path. It now uses command-tree help without loading the handler.
- Pack doctor duplicated incomplete required-field checks and rejected optional hostVersion omission.
  It now uses the canonical manifest validator. Documentation matches dependency precedence and
  profile/session ownership.

Verification:

- Full `npm run chain -- --cores 1` passed: 29 steps executed, one cached, including integration,
  external-pack app tests, packaged authoring and app smoke checks.
- After removing the final stale comment, the same chain passed again: eight steps executed,
  22 reused their verified inputs.
- Actual repository/pack help and refusal output were checked through the CLI entry points.
- A real source app spawned from outside the checkout with invalid inherited host selectors,
  attached through the same supervisor, stopped, and removed its disposable profile. Process exit
  and absence of both regular and temporary profile paths were confirmed.
- App install/upgrade/uninstall fixtures exercise temporary macOS bundles with injected release data;
  packaged checks exercise the built app. The review ran on macOS Apple Silicon.
- `git diff --check` passed.
