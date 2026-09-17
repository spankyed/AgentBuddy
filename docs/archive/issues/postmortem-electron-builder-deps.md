# Post-Mortem: Production App Crash — Missing @ai-sdk Dependencies

**Date:** 2026-04-03
**Severity:** Critical — app unusable, crashes on startup
**Affected:** v0.0.1 release (pulled), all production builds prior to fix

## Incident

The packaged macOS app crashed immediately on startup with:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@ai-sdk/provider-utils'
imported from .../app/node_modules/@ai-sdk/google/dist/index.mjs
```

The API server could not start because `@ai-sdk/google` (in root `node_modules/`) tried to import `@ai-sdk/provider-utils`, which was missing from the packaged app's root `node_modules/`.

## Root Cause

**electron-builder's dependency pruning + npm workspace hoisting.**

electron-builder does not blindly copy `node_modules/`. It walks the dependency tree starting from root `package.json` to decide which packages to include. Our root `package.json` only declared:

```json
"dependencies": {
  "@app/main": "*"
}
```

The API workspace (`@app/api`) — which depends on `@ai-sdk/google`, `@ai-sdk/anthropic`, `@ai-sdk/openai`, and their transitive deps — was **not** a declared root dependency. electron-builder never walked its dependency tree, so it pruned the `@ai-sdk` transitive deps from root `node_modules/`.

Meanwhile, npm's workspace hoisting put `@ai-sdk/google` in root `node_modules/` (because no other workspace had a conflicting version). electron-builder included `google` (it was physically in root `node_modules/`) but not its transitive dependency `@ai-sdk/provider-utils`.

### Why this worked in development

In development, Node.js resolves the full monorepo dependency tree. `@ai-sdk/google` at root can find `@ai-sdk/provider-utils` at root because both are installed there by npm. The packaged app has a pruned subset of `node_modules/`, breaking the resolution chain.

### Why this was hard to diagnose

1. **Two versions of `@ai-sdk/provider-utils`** existed in the dev tree: `v3.0.9` at root (for `google@2.0.14`) and `v2.2.8` in `packages/api/node_modules/` (for `anthropic`/`openai`). Simply copying `google` next to the wrong version caused a different error (`SyntaxError: does not provide an export named 'convertToBase64'`).

2. **`--install-strategy=nested` didn't help** because npm still hoists packages when there's no version conflict, even with this flag.

3. **The `files` glob `node_modules/**/*` in `electron-builder.mjs` was misleading** — it suggests all of `node_modules/` is included, but electron-builder overrides this with its own dependency walk.

## Fix

Added `@app/api` to root `package.json` dependencies:

```json
"dependencies": {
  "@app/main": "*",
  "@app/api": "*"
}
```

This tells electron-builder to walk `@app/api`'s full dependency tree, so all `@ai-sdk/*` packages (and any other API deps) are included in the packaged root `node_modules/`.

**Commit:** `fix: include @app/api in root deps so electron-builder bundles its dependencies`

## What was tried before the fix

| Attempt | Result |
|---------|--------|
| `npm install --workspace=packages/api --install-strategy=nested` | npm still hoists `@ai-sdk/google` to root |
| Clean all `node_modules/` + `--install-strategy=nested` | Same — npm hoists regardless |
| Copy `@ai-sdk/google` from root into `packages/api/node_modules/` | Version mismatch with local `provider-utils@2.2.8` |
| Post-build hack: copy missing `@ai-sdk/*` from dev root into packaged root | Worked but fragile — papers over the real problem |

## Lessons

1. **electron-builder walks root `package.json` dependencies, not the `files` glob, to decide which `node_modules` packages to include.** Any workspace whose runtime deps need to be in the packaged app must be declared in root `dependencies`.

2. **Build validation catches this class of issue.** The build script now checks that critical transitive deps exist in the packaged app before completing:
   ```bash
   for dep in "@ai-sdk/google" "@ai-sdk/provider-utils" "@ai-sdk/provider"; do
     if [ ! -d "$APP_PATH/app/node_modules/$dep" ] && \
        [ ! -d "$APP_PATH/app/packages/api/node_modules/$dep" ]; then
       echo "❌ Build validation failed: $dep missing from packaged app"
       exit 1
     fi
   done
   ```

3. **Always test production builds end-to-end.** `npm start` (dev mode) exercises a completely different module resolution path than the packaged Electron app.
