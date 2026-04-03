# Production Build (macOS Apple Silicon)

## Prerequisites

- Node >= 23.0.0
- Xcode Command Line Tools (for native module compilation)

## Build

```bash
npm run build-prod
```

This runs `build/build.sh` which executes 6 steps:

1. **Clean** — removes `dist/` and `packages/*/dist/`
2. **Install** — `npm install`
3. **Compile DSL** — `npm run compile` (skip with `SKIP_COMPILE=1`)
4. **Build packages** — API (tsc + tsup), main/preload (Vite), renderer (vue-tsc + Vite)
5. **Build native helpers** — macOS speech recognition binary
6. **Package** — electron-builder → `.app`, `.dmg`, `.zip` in `dist/`

## Run

```bash
npm run prod-app
```

Launches `dist/mac-arm64/AgentBuddy.app` with console logging to `build/scripts/logs/`.

## Output

- `dist/mac-arm64/AgentBuddy.app` — app bundle
- `dist/AgentBuddy-*.dmg` — installer
- `dist/AgentBuddy-*.zip` — archive

## Notes

- ASAR is disabled — API server needs direct filesystem access to `node_modules`
- Native modules (lmdb, node-pty) are rebuilt by electron-builder for Electron's Node
- Code signing requires a valid "Developer ID Application" certificate for distribution
