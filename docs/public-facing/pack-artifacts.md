# Pack artifacts

`apack.json` owns authored declarations. Pack-root-relative module paths identify source used by the
build; installed discovery reads the built declarations without importing those modules or requiring
the source files. Entity shapes select TypeScript exports, never executable bindings. A `null` shape
keeps an entity untyped. See the [manifest reference](manifest.md).

| Context | Declaration and execution contract |
|---|---|
| Source checkout | `apack.json` and declared source modules; generated code under `src/__generated__/`. Source edits require rebuilding before installation. Source advertisements are metadata, not accepted runtime bindings. |
| Completed build | `dist/apack.json`, `dist/types/snapshot.json` and `dist/integrity.json`, alongside built runtime and dependent-facing files. Publication replaces `dist/` after all checks succeed. |
| Release archive / installed pack | The staged pack layout below, without the `dist/` prefix. Staging verifies producer bytes, omits source maps and build-only standalone editor definitions, and verifies the copied result. Installation requires no source checkout or `node_modules` inside the pack. |
| App-shipped pack | The same staged layout. The app installs it into the profile's packs directory before discovery. Installation ownership and deliberate replacement are distinct from native composition. |
| Native host composition | Host-supplied declaration data and separately checked executable registrations. There is no installed directory, file-integrity receipt or invented artifact revision. Native dependency declarations use version ranges, rather than authored file/GitHub source locators. |

Build paths below are relative to `dist/`; archive and installed paths are relative to the pack directory.
Optional files exist only when the build produces that contribution.

| Path | Purpose |
|---|---|
| `apack.json` | The declaration used by this accepted build. It must agree with the snapshot's manifest. |
| `integrity.json` | Exact layout-format stamp, pack/version information, optional provenance and SHA-256 inventory of every shipped file except the receipt itself. |
| `runtime/index.cjs` | Backend registrations and executable bindings, including lifecycle hooks. Loading it activates code; reading declarations does not. |
| `runtime/fe.js`, `runtime/fe.css` | Bundled frontend bindings and styles. |
| `runtime/content/` | Compiled content and its index. Source declaration regrouping does not change unchanged content identities. |
| `build/steps.build.mjs` | Step build facets used to validate dependent flows. |
| `build/content-runtime.mjs` | Entity/repository/content-writer bindings used by dependent tests. |
| `build/content-compilers.mjs` | Declared content compilers used by dependent builds. |
| `types/snapshot.json` | Validated manifest, declaration revision, entity/relation types, facade declarations, flow helpers, contribution provenance, compiled help and snapshot/SDK version information. |
| `types/pack-types.d.ts` | Standalone facade declarations for dependent TypeScript code. |

The source build also produces `dist/defs/monaco/<name>-defs.d.ts` for declared Monaco DSL targets.
Generated frontend code imports these as raw text, embedding them in the frontend bundle. Staging
does not ship the standalone `defs/` directory. `.apack/reads.json` and phase stamps are development
build records, not installed declarations. Facade declarations and DSL editor definitions serve
different consumers even though both contain TypeScript declarations. Snapshot `facades` and the
dependency cache's `facades/` hold dependent-facing declarations, keyed by lowercase names containing
letters, digits and hyphens (such as `pack-types`); `defs/monaco/` remains the DSL build
output. `PACK_TYPES_FACADE` names the `pack-types` entry without changing its physical filename.

Three identities serve different boundaries:

- **Declaration revision:** identifies the declared contract shared by snapshot and generated bindings.
- **Artifact revision:** identifies the verified installed file inventory; copying or replacing bytes must preserve or change this identity accordingly.
- **Runtime revision:** host-issued identity for a particular accepted runtime. Reloading identical files can create a new runtime revision.

Metadata availability does not imply execution readiness. Disabled or failed packs can retain readable
declarations; executable use requires eligible owners and matching accepted bindings. Native and source
entries do not acquire installed receipts merely by appearing in the catalog.

Snapshot format, layout format, SDK version, pack release version and `hostVersion` are separate
contracts. The current reader validates its supported snapshot/layout formats; `hostVersion` is the
pack's npm semver constraint on the app. A format mismatch requires a matching build/host, rather than
automatic conversion. Changing declarations is not a release/version bump by itself.

Dependency codegen checks the facade types it actually imports with the TypeScript export reader.
Malformed declaration syntax and missing, value-only or unresolved required types fail with the
dependency name and a rebuild remedy.
Plugin state is required when a generated frontend imports it; a backend-only consumer does not gain
that requirement merely because the dependency declares a plugin. Bundled declaration text takes
precedence over stale generated files during these checks, without executing dependency modules.

Build and source checks validate exported shape types and executable targets before publication.
Installed discovery validates built data and integrity; activation separately checks binding membership
and invokes lifecycle behavior. See [building](cli.md#building) and [pack development](getting-started.md).
