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

After running prod builds, run `unset NODE_ENV` or open a new terminal before resuming dev work.
