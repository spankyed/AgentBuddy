# NODE_ENV=production Breaks Dev Builds

## Symptom

`npm run start` / `npm run build:be` fails with missing type declaration errors:

```
error TS7016: Could not find a declaration file for module 'fs-extra'.
error TS7016: Could not find a declaration file for module 'ws'.
```

## Cause

`NODE_ENV=production` is set in your shell. This makes `npm install` skip all `devDependencies` (including `@types/*`, `typescript`, `tsup`, `tsc-alias`).

Common triggers:
- Running a **prod build** (`npm run build-prod`) sets `NODE_ENV=production` and it persists in the shell session
- The terminal service previously leaked `NODE_ENV=production` into spawned shells (fixed in `a390ad40`)

## Fix

```bash
# Check current value
echo $NODE_ENV

# Option 1: Override for the current command
NODE_ENV=development npm install

# Option 2: Unset for the session
unset NODE_ENV
npm install

# Option 3: Open a fresh terminal
```

Then rebuild:
```bash
npm run build:be
```

## Prevention

- `build.sh` uses `NODE_ENV=development npm install` to force devDependencies during prod builds
- `build.sh` runs `unset NODE_ENV` after install and at end of script
- A `preinstall` warning in `package.json` alerts if `NODE_ENV=production` would skip devDependencies
- The terminal service strips `NODE_ENV` from spawned shell environments

After running prod builds manually, run `unset NODE_ENV` or open a new terminal before resuming dev work.

## Why the prod build installs devDependencies

The prod build needs devDependencies (`typescript`, `@types/*`, `tsup`, `tsc-alias`, `vite`, etc.) to **compile** source code into JS. The build pipeline is:

1. `npm install` — installs everything (including devDeps needed to compile)
2. `tsc` + `tsup` — compiles TS → JS (needs devDeps)
3. `vite build` — bundles main/preload/renderer (needs devDeps)
4. `electron-builder` — packages only the compiled output + production `node_modules`

DevDependencies are needed during steps 1-3 but are **not shipped** in the final app. `electron-builder`'s `files` config controls what gets packaged, and it already excludes `@types`, `.bin`, and other dev artifacts. So devDeps exist on disk during the build but never end up in the DMG.
