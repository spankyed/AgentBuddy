Act as a senior DevOps engineer to fix a broken production Electron app build.

## Problem

The packaged macOS app crashes on startup because `@ai-sdk/provider-utils` is missing from the resolution chain. The production log confirms:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find package '@ai-sdk/provider-utils'
imported from .../app/node_modules/@ai-sdk/google/dist/index.mjs
```

## Root Cause

npm workspace hoisting puts `@ai-sdk/google` in root `node_modules/` but its transitive dependency `@ai-sdk/provider-utils` only exists in `packages/api/node_modules/`. In the packaged app, `@ai-sdk/google` can't resolve `@ai-sdk/provider-utils` because it's not in the resolution chain from root.

Verified in the current installed app at `/Applications/AgentBuddy.app/Contents/Resources/app/`:
- `node_modules/@ai-sdk/` contains: `anthropic`, `google`, `openai`
- `packages/api/node_modules/@ai-sdk/` contains: `anthropic`, `openai`, `provider`, `provider-utils`, `react`, `ui-utils`
- `node_modules/@ai-sdk/provider-utils` does NOT exist
- `node_modules/@ai-sdk/google/node_modules/` does NOT exist

## What was already tried

A line was added to `build/build.sh` after the regular `npm install`:
```bash
npm install --workspace=packages/api --install-strategy=nested --silent
```

This was intended to force all API deps into `packages/api/node_modules/` so the packaged app bundles them correctly via the `packages/api/node_modules/**/*` rule in `electron-builder.mjs`. However, the installed app was built before this change, and it has not yet been verified whether this fix actually works.

## Your task

1. Verify whether the `build.sh` fix actually resolves the issue by:
   - Running `npm run build-prod`
   - Checking that `@ai-sdk/google` AND `@ai-sdk/provider-utils` both exist in the packaged app's `packages/api/node_modules/@ai-sdk/`
   - Running `npm run prod-app` and confirming the app gets past the splash screen

2. If the fix doesn't work (i.e. `@ai-sdk/google` is still only in root `node_modules/` in the packaged output), investigate why and find a solution that ensures all `@ai-sdk/*` packages the API server needs are resolvable at runtime in the packaged app.

## Key files

- `build/build.sh` — production build script
- `electron-builder.mjs` — electron-builder config (see `files` array, especially `packages/api/node_modules/**/*`)
- `packages/api/package.json` — API workspace dependencies (already lists `@ai-sdk/google`, `@ai-sdk/anthropic`, `@ai-sdk/openai`)
- Root `package.json` — workspace config

## Key commands

- `npm run build-prod` — full production build
- `npm run prod-app` — launch the built app with logging
- Production log: `~/Library/Application Support/abuddy/agentbuddy.log`
