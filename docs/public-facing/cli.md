# CLI Reference

The `abuddy` CLI manages the full pack lifecycle: scaffolding, code generation, building, validation, distribution, and installation.

## Installing

- From the app (macOS): **AgentBuddy → Install 'abuddy' command in PATH**. It links `/usr/local/bin/abuddy` (`abuddy-beta` for AgentBuddy Beta) to the CLI bundled with the app, which runs on the app's own Node runtime.
- `npm i -g @abuddy/cli`
- Homebrew: `build/homebrew/abuddy.rb`

Packs pin `@abuddy/cli` in `devDependencies`. Any `abuddy` run inside a pack hands off to that pinned version.

## Commands

### Scaffolding

#### `abuddy init [name]`

Create a new pack from scratch.

```bash
abuddy init my-pack
```

Creates a complete project directory with `abuddy.json`, `package.json`, `tsconfig.json`, source directories, a default feature, and generated files. Runs `generate` and `generate-entries` automatically.

#### `abuddy add <entity> <name> [options]`

Add an entity to an existing pack. Run from inside a pack directory.

| Entity | Command | What it creates |
|---|---|---|
| Feature | `abuddy add feature <name> [--label <Label>] [--icon <Icon>] [--designation <role>]` | Full feature: system, plugin, settings, repository, canvas |
| Step | `abuddy add step <type> [--trigger]` | Step definition: index, fe, types, form |
| Artifact | `abuddy add artifact <type> [--icon <Icon>]` | Artifact viewer component |
| Block | `abuddy add block <type> [--input]` | Display or input block component |
| Action | `abuddy add action <name> [--category <cat>]` | Action seed file |
| Prompt | `abuddy add prompt <name>` | Prompt seed file |
| Flow | `abuddy add flow <name>` | Flow seed file |
| Service | `abuddy add service <name> [--feature <feature>]` | Pack-level or feature service |
| Migration | `abuddy add migration [--version <ver>]` | Version-targeted migration file |

Each generator creates template files, updates `abuddy.json`, and runs `generate-entries` to regenerate `__generated__/`.

### Code generation

#### `abuddy generate`

Resolve pack dependencies, merge their type manifests, and write aggregated EARS types to `.abuddy/generated/`. This enables cross-pack type interop.

#### `abuddy generate-entries`

Read `abuddy.json` and generate all files in `src/__generated__/`. Uses input hashing to skip when the manifest and template haven't changed. Pass `--force` to regenerate unconditionally.

#### `abuddy fetch-deps`

Fetch dependency snapshots from upstream and cache them in `.abuddy/deps/`. Resolution order: `file:` path (always fresh, never cached) → workspace siblings → GitHub releases → registry (future). See [Manifest Reference — Dependencies](manifest.md#dependencies) for the supported formats.

### Building

#### `abuddy build [--skip-generate]`

Full build pipeline:

1. Runs `generate` + `generate-entries` (skip with `--skip-generate`)
2. Compiles seeds (actions, prompts, flows) to JSON in `dist/`
3. Merges feature settings into a default settings object
4. Writes `dist/snapshot.json` (types, manifest, SDK version)
5. Bundles `src/__generated__/pack-entry-fe.ts` into `dist/fe.js` via Vite (with Vue SFC support)

#### `abuddy pack`

Bundle `dist/` into a distributable `.tgz` archive. Requires a successful `build` first.

```bash
abuddy pack
# Creates my-pack-0.1.0.tgz
```

#### `abuddy dev`

Watch mode. Runs an initial build, then watches `src/` and `abuddy.json` for changes with a 300ms debounce.

### Validation

#### `abuddy validate`

Checks:
- Manifest structure validation
- Feature file existence (system, plugin entries)
- Dependency resolution

Exits with code 1 on errors.

#### `abuddy doctor`

Health checks with pass/warn/fail output:
- Manifest exists and parses
- Required fields present
- Generated files exist
- Feature files present
- Step definitions present
- Dependencies declared

#### `abuddy info`

Print a summary of the current pack: name, version, host version, feature count, step count, service count, seed counts, dependency count, and build status.

### Distribution

#### `abuddy install <source>`

Install a pack from a local directory, `.zip`, `.tgz`, URL, or GitHub slug.

```bash
abuddy install ./my-pack-0.1.0.tgz
abuddy install ../my-pack
abuddy install github:user/my-pack
```

Restart the app after installing.

#### `abuddy uninstall <id>`

Remove an installed pack by ID. Restart the app after uninstalling.

#### `abuddy list`

Show all installed packs.

### App

#### `abuddy open [-b]`

Open the installed AgentBuddy app, or bring it to the front if it's running. Pass `-b` for AgentBuddy Beta. macOS only.

### Cleanup

#### `abuddy clean`

Remove build artifacts: `dist/`, `.abuddy/`, `src/__generated__/`.
