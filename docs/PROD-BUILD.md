# Production Build (macOS Apple Silicon)

## Prerequisites

- Node >= 23.0.0
- Xcode Command Line Tools (for native module compilation)

## Build

```bash
npm run build-prod
```

This runs `build/build.sh` which executes 7 steps:

1. **Clean** — removes `dist/` and `packages/*/dist/`
2. **Install** — `npm install`
3. **Compile DSL** — `npm run compile` (skip with `SKIP_COMPILE=1`)
4. **Build packages** — API (tsc + tsup), main/preload (Vite), renderer (vue-tsc + Vite)
5. **Build native helpers** — macOS speech recognition binary
6. **Package** — electron-builder → `.app`, `.dmg`, `.zip` in `dist/`
7. **Verify signing** — validates code signature and notarization (skipped for unsigned builds)

## Run

```bash
npm run prod-app
```

Launches `dist/mac-arm64/AgentBuddy.app` with console logging to `build/scripts/logs/`.

## Output

- `dist/mac-arm64/AgentBuddy.app` — app bundle
- `dist/AgentBuddy-*.dmg` — installer
- `dist/AgentBuddy-*.zip` — archive

## Signed Builds

To build with code signing and notarization, set Apple credentials as env vars or use:

```bash
npm run build-prod:signed
```

This sources `.env.signing` (gitignored) and runs the build. See `.env.signing.example` for the template and [RELEASE-PROCESS.md](./RELEASE-PROCESS.md) for full details.

## Notes

- ASAR is disabled — API server needs direct filesystem access to `node_modules`
- Native modules (lmdb, node-pty) are rebuilt by electron-builder for Electron's Node
- Signing + notarization activate automatically when `APPLE_TEAM_ID` env var is set
- Without signing credentials, builds are unsigned (fine for local development)
