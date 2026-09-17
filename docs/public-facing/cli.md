# CLI Reference

The `abuddy` CLI manages the full pack lifecycle: scaffolding, code generation, building, validation, testing, releasing and installation. It also reads and repairs the app's database (`abuddy db`).

## Installing

- From the app (macOS): **AgentBuddy → Install 'abuddy' command in PATH**. It links `/usr/local/bin/abuddy` (`abuddy-beta` for AgentBuddy Beta) to the CLI bundled with the app, which runs on the app's own Node runtime.
- `npm i -g @abuddy/cli`
- Homebrew: `build/homebrew/abuddy.rb`

Packs pin `@abuddy/cli` in `devDependencies`. Any `abuddy` run inside a pack hands off to that pinned version.

## Commands

### Scaffolding

#### `abuddy init [name]`

Create a new pack from scratch. `name` is the pack id: lowercase letters, digits and hyphens (prompted for when omitted). The directory must not exist.

```bash
abuddy init my-pack
```

Creates no feature (add one with `abuddy add feature`). It writes:

- `abuddy.json`: one entity type named after the pack, empty `features`, `dependencies` and `permissions`, `steps` with `register` and `build` barrels, and `boot.seed` with `actions`, `flows` and an `examples` entry using the `examples` seed format (`markdown-tree`)
- `package.json` (depends on `@abuddy/sdk`; pins `@abuddy/cli`, `@abuddy/testing`, `vitest`, `typescript`), `tsconfig.json`, `.gitignore`, `src/env.d.ts`
- `.github/workflows/release.yml`: publishes the GitHub release when `abuddy release` pushes a `v*` tag
- `src/extensions/steps/register.ts` and `src/extensions/steps/build.ts`
- `src/seeds/actions/`, `src/seeds/flows/`, `src/seeds/examples/hello.md`
- `vitest.config.ts`, `tests/setup.ts` (the `@abuddy/testing/harness` setup) and `tests/unit/<name>.spec.ts`

Then runs `generate` and `generate-entries`.

#### `abuddy add <entity> <name> [options]`

Add an entity to an existing pack. Run from inside a pack directory. Names other than a feature's are kebab-case (`^[a-z][a-z0-9-]*$`). Existing files are never overwritten.

| Entity | Command | What it creates |
|---|---|---|
| Feature | `abuddy add feature <name> [--label <Label>] [--icon <Icon>] [--designation <role>]` | See below |
| Step | `abuddy add step <type> [--trigger]` | `src/extensions/steps/<type>/{build.ts,index.ts,fe.ts,types.ts,form.vue}` (`types.ts` declares `DSL<Type>Node` and `<Type>Node`); adds the step to the `steps.register` barrel (and `<register>-fe.ts` if it exists), its build facet to the `steps.build` barrel, and a `steps.definitions` entry |
| Artifact | `abuddy add artifact <type> [--icon <Icon>]` | `src/extensions/artifacts/viewers/<type>-artifact.vue`; when the manifest declares `artifacts`, adds `{ type, fe: { icon } }` to that register file and the viewer to its `-fe.ts` `componentMap` |
| Block | `abuddy add block <type> [--input]` | `src/extensions/blocks/display/<Type>Block.vue` (or `input/<Type>Input.vue`); updates the `blocks` register file and its `-fe.ts` when the manifest declares `blocks` |
| Action | `abuddy add action <name> [--category <cat>]` | `src/seeds/actions/<category>/<name>.ts` (category defaults to the pack id) |
| Prompt | `abuddy add prompt <name>` | `src/seeds/prompts/<name>.ts` |
| Flow | `abuddy add flow <name>` | `src/seeds/flows/<name>.ts`. Needs a dependency that provides flow steps (e.g. `default-setup`) |
| Service | `abuddy add service <name> [--feature <feature>]` | `src/extensions/services/<name>.ts` in `packServices`, or `src/features/<feature>/be/services/<name>.ts` in that feature's `services`. The key is the camelCased name, the value `path#<camelName>Service` |
| Migration | `abuddy add migration [version] [--version <ver>]` | `src/migrations/<version>.ts` exporting a `PackMigration`, added to `src/migrations/index.ts`; sets `migrations` if unset. Version defaults to the manifest's |

Only `add feature`, `add service` and `add step` update `abuddy.json` entries and run `generate-entries`; `add migration` only sets `migrations`, and the rest just write files.

**`add feature`.** The name is the feature id: a lowercase letter, then letters and digits (`notes`, `calendarEvents`), because it becomes an identifier in generated code. `--designation`, if given, must equal the name. It creates:

- `src/features/<name>/settings.ts`
- `src/features/<name>/be/system.ts` (its entry declared with `satisfies SystemEntry`), `be/types.ts`, `be/repository/index.ts`
- `src/features/<name>/fe/plugin.ts`, `fe/state.ts`, `fe/canvas/list.vue`, `fe/settings.vue`
- `tests/unit/<name>-system.spec.ts` (and `tests/setup.ts` with its devDependencies if the pack has none)

and adds a `features[]` entry with `settings`, `system.entry`, `plugin` (`entry`, `label`, `icon`), empty `services`, and `repositories` `<name>Queries` and `<name>Commands` pointing at `be/repository/index.ts`.

### Code generation

#### `abuddy generate`

Resolve pack dependencies and write their EARS types to `.abuddy/generated/types.ts`, for cross-pack type interop.

#### `abuddy generate-entries`

Read `abuddy.json` and generate all files in `src/__generated__/`. Uses input hashing to skip when the manifest and template haven't changed. Pass `--force` to regenerate unconditionally.

#### `abuddy fetch-deps`

Resolve every dependency and cache its snapshot, build code and backend runtime in `.abuddy/deps/<id>/`. Resolution order:

1. `file:` path: read directly, never cached, no fallback
2. The workspace: in each directory above the pack, nearest first, `packages/<id>` then `<id>`. A pack anywhere inside an AgentBuddy checkout builds against that checkout's packages
3. The app configured for `abuddy test` (`ABUDDY_APP=beta`, `ABUDDY_ROOT`, or the saved choice)
4. Installed AgentBuddy apps' built-in packs (production, beta, development, test data dirs)
5. GitHub releases, for `github:owner/repo` values (the `<id>-<version>.tgz` asset and its `.sha256`)

Sources 2–5 must satisfy the declared range. `abuddy build` resolves the same way but uses the `.abuddy/deps` cache, while it satisfies the range, before going to GitHub. See [Manifest Reference — Dependencies](manifest.md#dependencies) for the value formats.

### Building

#### `abuddy build [--skip-generate] [--skip-fe] [--release]`

External packs build into `dist/` in the bundle layout:

```
dist/
  runtime/index.cjs          backend: systems, services, steps, boot hooks, migrations
  runtime/fe.js, fe.css      frontend
  runtime/seeds/             compiled seeds
  build/steps.build.mjs      step build facets, for dependents' flow validation (with steps.build)
  build/seed-runtime.mjs     entity types, repositories and seed hooks, for dependents' unit tests
  build/seed-compilers.mjs   seed format compiler modules (with seedFormats[].compiler)
  types/pack-types.d.ts      facade types for dependents
  types/snapshot.json        types, facade types, flow helpers, manifest, SDK version
  defs/monaco/<name>-defs.d.ts  editor definitions per dsl entry with a monaco target
```

Steps:

1. Validates `abuddy.json` and fails on an invalid manifest
2. Clears `dist/`
3. Runs `generate` + `generate-entries` (skip with `--skip-generate`)
4. Checks each feature's `settings` file exists and sets only `plugins.<id>` and `plugins._meta.visibility.<id>`
5. Resolves every dependency (fails if one can't be), and warns when `src/__generated__` holds a dependency's types from a different version than the one the build resolved
6. Compiles `boot.seed` into `runtime/seeds/`, validating flows against the dependencies' step build code
7. Bundles the facade types and **gates** them: `types/pack-types.d.ts` must type-check on its own and import only `@abuddy/*` packages, `@abuddy/sdk`'s peer dependencies and Node built-ins, with declarations; otherwise dependents would read the types as `any`
8. Writes `types/snapshot.json`, and notes entity types with no `entityShapes` entry
9. Bundles `steps.build`, the seed runtime and any seed compilers into `build/`. The seed runtime is then loaded in a fresh Node process with only `@abuddy/sdk`, as a dependent's tests load it; it fails if repositories or seed hooks need native modules or `@abuddy/sdk`'s optional peers
10. Bundles the backend runtime into `runtime/index.cjs`
11. Bundles each `dsl` entry with a `monaco` target into `defs/monaco/<name>-defs.d.ts`, wrapped as `declare module "@app/defs/<name>"`, inlining the pack's own modules, `@abuddy/*` and the entry's `inline` packages
12. Bundles the FE entry into `runtime/fe.js` (and `fe.css`) with Vite, unless `--skip-fe`. The entry is `src/pack-entry-fe.ts` (or `.js`) if present, else `src/__generated__/pack-entry-fe.ts`

Bundle and gate failures are all reported, and the command exits with code 1. `--release` minifies and drops source maps.

#### `abuddy pack [--out <dir>]`

Stage the built `dist/` into a verified bundle (`bundle.json` lists a sha256 per file) and write `<id>-<version>.tgz` and `<id>-<version>.tgz.sha256` to `--out` (default: the pack root). Run `abuddy build` first (`--release` for publishable output). Refuses built-in packs and invalid manifests.

#### `abuddy dev`

A dev server for the dev app (`npm start` in an AgentBuddy checkout). It builds, installs the pack into the development data dir, then:

- serves the FE entry from a Vite dev server (port 5199, or the next free one) with HMR, recording its port in `pack-dev-servers/<id>.json` in the development data dir so the app's `pack://` requests go to it. The marker sits outside the installed pack, which stays exactly the verified bundle, and is removed when `abuddy dev` exits
- on `abuddy.json` changes, regenerates `src/__generated__/`
- on `.ts` changes under `src/`, rebuilds, reinstalls and asks the running dev app to reload the pack's backend

Without an FE entry it rebuilds, reinstalls and reloads on any change instead.

### Validation

#### `abuddy validate`

Checks:
- Manifest structure validation
- Each `features[]` entry against the pack: its `settings`, `system.entry` and `plugin.entry` files exist, and its `designation`, if set, equals the feature id
- Dependency resolution (a warning when one can't be resolved)

Exits with code 1 on errors.

#### `abuddy doctor`

Health checks with pass/warn/fail output:
- `abuddy.json` exists and parses
- `id` and `hostVersion` are set
- `src/__generated__/` exists (warn)
- Each feature's `system.entry` and `plugin.entry` exist
- Each `steps.definitions[].path` exists

#### `abuddy info`

Print a summary of the current pack: id, version, host version, feature count, step count, pack service count, action/prompt/flow seed file counts, dependency count, whether `dist/` exists, and the pack root.

### Testing

#### `abuddy init-tests`

Scaffold Playwright E2E tests in the pack root: `playwright.config.ts` (tests in `tests/e2e`), `tests/e2e/smoke.spec.ts` (using the first feature with a plugin), `.gitignore` entries for `tests/screenshots/` and `tests/results/`, and `@abuddy/testing` and `@playwright/test` devDependencies. Existing files are kept.

#### `abuddy test [--app-root <path> | --app beta] [playwright args...]`

Run the pack's Playwright tests in AgentBuddy. Other arguments go to `playwright test`. The app is, in order:

1. `--app-root <path>`: a local AgentBuddy checkout (installed and built)
2. `--app beta` or `ABUDDY_APP=beta`: the newest AgentBuddy Beta build satisfying the pack's `hostVersion`, downloaded and cached
3. `ABUDDY_ROOT`
4. The choice saved on first run. An interactive terminal asks and saves it; CI (or no TTY) fails instead

The fixture builds the pack with the same CLI and installs it into a fresh data dir for each worker.

### Distribution

#### `abuddy release [patch|minor|major] [--beta] [--dry-run] [--local] [--skip-tests] [--skip-e2e]`

Cut a release (default `patch`):

1. Preflight: valid manifest with `hostVersion`, dependencies resolve, a clean git tree on the default branch, not behind `origin`, and the tag not already on `origin`
2. Bump `abuddy.json` and `package.json`. `--beta` follows the app's cycle: `1.2.3` → `1.2.4-beta.0` → `1.2.4-beta.1` → `1.2.4`
3. `abuddy build --release`, `tsc --noEmit`, the `test` script (skip with `--skip-tests`), and `abuddy test` when `playwright.config.ts` exists (skip with `--skip-e2e`)
4. Commit, pack into `.abuddy/release/`, tag `v<version>` and push

The scaffolded `.github/workflows/release.yml` publishes the GitHub release from the tag. `--local` publishes from this machine instead; it needs `GITHUB_TOKEN` or `GH_TOKEN` and refuses when the workflow exists. `--dry-run` edits no files, runs no git operations and publishes nothing: it builds and verifies the next version's bundle under `.abuddy/release/`.

#### `abuddy release publish [--dir <dir>] [--dry-run]`

Verify the bundle in `<dir>` (default `.abuddy/release`) and create the GitHub release `v<version>` (a prerelease for prerelease versions), uploading `<id>-<version>.tgz`, `.sha256` and `.bundle.json`. The release workflow runs it. Needs `GITHUB_TOKEN` (or `GH_TOKEN`), and `GITHUB_REPOSITORY` or a GitHub `origin` remote.

#### `abuddy install <source> [-d|--dev] [-b|--beta]`

Install a pack into the app's data dir (`<userDataDir>/packs/<id>`). `<source>` is one of:

| Source | Example |
|---|---|
| Local directory (a built pack or bundle) | `../my-pack` |
| Local archive (`.tgz`, `.tar.gz`, `.zip`) | `./my-pack-0.1.0.tgz` |
| URL to a `.tgz`, `.tar.gz` or `.zip` | `https://example.com/my-pack-0.1.0.tgz` |
| GitHub release: `owner/repo`, or `owner/repo@tag` (default: latest) | `user/my-pack@v0.1.0` |

```bash
abuddy install ./my-pack-0.1.0.tgz
abuddy install ../my-pack
abuddy install user/my-pack
```

A GitHub release needs a `.tgz` asset; its `.sha256` asset is checked when the release has one. The bundle is verified before it's placed, and `hostVersion` is checked against the version the app recorded in that data dir. A source directory must be built: one with neither a `bundle.json` nor a `dist/runtime/index.cjs` beside `dist/types/snapshot.json` is refused, with a note to run `abuddy build` first. Restart the app after installing.

#### `abuddy uninstall <id> [-d|--dev] [-b|--beta]`

Remove an installed pack by ID. Restart the app after uninstalling.

#### `abuddy list [-d|--dev] [-b|--beta]`

Show installed packs.

`install`, `uninstall` and `list` target the production app's data by default; `-d` targets the development data dir and `-b` AgentBuddy Beta's.

### App

#### `abuddy open [-b]`

Open the installed AgentBuddy app, or bring it to the front if it's running. Pass `-b` for AgentBuddy Beta. macOS only.

### Database

`abuddy db` reads and changes the app's database (EARS on LMDB) from the command line: to look at data, repair it when the app can't start, or move it between machines.

```bash
abuddy db query "return qx(EARS.Entity.Note).count()"
abuddy db inspect Flow-123 --depth 2
abuddy db export --out ./export
abuddy db import ./agentbuddy-backup-2026-09-17 --force
abuddy db reset          # lists what it would delete
```

**Which data.** Every command targets the production app's data dir by default; `-d` targets the development app's, `-b` AgentBuddy Beta's, and `--data-dir <path>` any data dir, such as a copy of the user's. Each command prints the data dir it opens (on stderr, so results on stdout stay clean).

**While the app runs.** The commands open the database files themselves (offline); the app keeps the whole database in memory and is its only writer. So a command that changes data (`exec`, `repl --write`, `import`, `reset`, `clear-settings`) refuses while an AgentBuddy app runs on the data dir: its instance lock is held by a live process, or its API answers on the port it published. Quit the app first. Reading commands work, with a warning that they miss what the app hasn't written yet.

**Versions.** The CLI reads and writes the data of the AgentBuddy version it was built with: data another major or minor version migrated (`0.3.x` data and a `0.4` CLI, say) is refused, naming both versions. Reading commands take `--ignore-version` to read it anyway. The `abuddy` the app installs always matches the app.

**Installed packs.** Entity types, relation kinds and where each type is stored come from the packs installed in the data dir (the built-in packs the app published to `host-packs/`, and the enabled packs in `packs/`); no pack code runs. A data dir the app has never started on has none, and is refused.

#### `abuddy db query <code> | --file <path> [-o pretty|json|csv] [--out <file>] [--ignore-version]`

Run query code with the Database console's read helpers: `qx`, `EARS`, `getAttr`, `getAttrs`, `getAll`, `getRoles`, `getAllEntities`, `getEntitiesOfType`, `findRelations`, `getRelationStats`, `getSchemaStats`, `queryEntitiesByAttribute`, `queryEntitiesByRelationTo`, `queryEntitiesInRelationTo`. The code is a function body, as in the console: `return` the result. `EARS.Entity` holds the installed packs' entity types.

```bash
abuddy db query "return qx(EARS.Entity.Settings).pickAll()" -o json --out settings.json
abuddy db query --file ./report.js -o csv
```

#### `abuddy db exec <code> | --file <path> [-o pretty|json|csv] [--out <file>]`

Run transaction code with the console's read and write helpers (`tx`, `destroyEntity`, `prepareEntity`, `createEntityWithDefaults`, `updateEntity`, `createRelation`, `removeRelation`, `removeRelationById`, `grantRole`, `revokeRole`). The changes are written when the code returns; a write that fails to reach the files fails the command.

```bash
abuddy db exec "tx('Note-123').put('title', 'Renamed')"
```

#### `abuddy db repl [--write] [--ignore-version]`

Run console code a line at a time and print each result: query code, or with `--write` transaction code, whose changes are written on exit. `.exit` or Ctrl+D quits.

#### `abuddy db inspect [<entity-id> | --type <Entity>] [--depth <n>] [--incoming] [--outgoing] [--ignore-version]`

Print an entity, its roles and its relations grouped by kind, following them `--depth` levels (default 1); `--incoming` or `--outgoing` shows one direction. `--type` prints the first five entities of a type. With neither, it prints entities and relations per entity type.

#### `abuddy db export --out <dir> [--type <Entity>...] [--format json|csv] [--ignore-version]`

Write each entity type's entities, with every attribute, to `<dir>/<Entity>.json` (or `.csv`), and a summary (data dir, data version, counts) to `<dir>/export.json`. Without `--type`, every type with entities. Roles are in each entity's `role` attribute, and relations are the `Relation` entities (their `relationDetails`).

#### `abuddy db import <backup-dir> [--force]`

Replace the database, and the media folder when the backup has one, with a backup made in the Database settings' Backup & Restore. The backup is checked first: it has `metadata.json`, lists only databases the app has (the primary one among them), each is there and opens, and its data is this AgentBuddy version's. Without `--force` it lists the backup, its contents and what it would replace, and changes nothing. The app migrates the data on its next start if the backup is from an earlier patch version.

#### `abuddy db reset [--force]`

Delete all of the app's data, as Reset Database in the Database settings does: both database partitions (the data and the run history) and the stored API keys. The app creates its default data (settings, seeded flows, the packs' seeds) on its next start and shows onboarding. Without `--force` it lists the entities per type and the number of stored keys it would delete.

#### `abuddy db clear-settings [--force]`

Destroy every Settings row (the user's changes to the default settings); the app recreates the defaults on its next start. Without `--force` it lists each row and the settings it stores.

In the AgentBuddy repo, `npm run db:query`, `db:exec`, `db:repl`, `db:inspect`, `db:export`, `db:import`, `db:reset` and `db:clear-settings` run these commands on the development app's data (`-d`): `npm run db:query -- "return qx().count()"`.

### Cleanup

#### `abuddy clean`

Remove build artifacts: `dist/`, `.abuddy/`, `src/__generated__/`.
