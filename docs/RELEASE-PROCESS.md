# Release Process

## Quick Start

```bash
npm run release
```

This launches an interactive CLI that walks you through the entire release:

1. Checks for a clean git working tree
2. Prompts for bump type (patch / minor / major)
3. Runs type checks and tests
4. Bumps the version in `package.json`
5. Generates a changelog entry from commit history
6. Asks for confirmation, then commits, tags, and pushes

Pushing the tag triggers a GitHub Actions workflow that builds, signs, notarizes, and publishes the release automatically.

## Commands

| Command | Description |
|---------|-------------|
| `npm run release` | Interactive release (prompts for bump type) |
| `npm run release:minor` | Skip prompt, bump minor version |
| `npm run release:major` | Skip prompt, bump major version |
| `npm run release -- --dry-run` | Preview what would happen |
| `npm run release -- --help` | Show usage |

## What Happens After Pushing

1. GitHub Actions workflow (`.github/workflows/build-mac.yml`) triggers on the `v*` tag
2. CI builds the app on a macOS Apple Silicon runner
3. If signing secrets are configured, the app is code-signed and notarized
4. A GitHub Release is published automatically with:
   - Signed `.dmg` installer
   - Signed `.zip` archive
   - Auto-generated release notes from commit history
5. Users download from the [Releases page](https://github.com/spankyed/AgentBuddy/releases)

## Versioning

Uses [semver](https://semver.org/). The version lives in the root `package.json` and is read by electron-builder for artifact naming.

- **patch** (0.0.1 → 0.0.2) — bug fixes, small changes
- **minor** (0.0.1 → 0.1.0) — new features, backward-compatible
- **major** (0.0.1 → 1.0.0) — breaking changes

## Changelog

A `CHANGELOG.md` file is generated/updated automatically by the release script. Entries are grouped by conventional commit type:

- `feat:` → Features
- `fix:` → Fixes
- `refactor:` → Refactors
- Everything else → Other

## Code Signing & Notarization

Signing is optional and controlled entirely by environment variables. Without them, builds are unsigned (fine for local dev).

### Required Environment Variables

| Variable | Purpose |
|----------|---------|
| `APPLE_TEAM_ID` | Apple Developer Team ID (enables signing + notarization) |
| `APPLE_API_KEY_ID` | App Store Connect API Key ID |
| `APPLE_API_ISSUER` | App Store Connect API Issuer UUID |
| `APPLE_API_KEY` | Path to `.p8` private key file |

### CI-Only (certificate from file)

| Variable | Purpose |
|----------|---------|
| `CSC_LINK` | Base64-encoded `.p12` certificate |
| `CSC_KEY_PASSWORD` | Password for the `.p12` file |

### Local Signed Builds

Create a `.env.signing` file (gitignored) with your credentials, then:

```bash
npm run build-prod:signed
```

This sources `.env.signing` and runs the full production build with signing enabled.

See `.env.signing.example` for the template.

### Verifying a Signed Build

```bash
npm run verify-signing
```

This checks code signature, notarization staple, Gatekeeper assessment, and native module signatures.

## CI Workflow

The workflow at `.github/workflows/build-mac.yml`:

- **Triggers**: tag push (`v*`) or manual dispatch
- **Runner**: `macos-14` (Apple Silicon)
- **Validates**: tag version matches `package.json`
- **Builds**: full 7-step production pipeline
- **Signs + notarizes**: when secrets are configured
- **Publishes**: GitHub Release with artifacts and auto-generated notes
- **Artifacts**: also uploaded as workflow artifacts (downloadable from Actions tab)

### GitHub Secrets to Configure

| Secret | Value |
|--------|-------|
| `MAC_CERTIFICATE_P12_BASE64` | `base64 -i certificate.p12 \| pbcopy` |
| `MAC_CERTIFICATE_PASSWORD` | Password used when exporting the .p12 |
| `APPLE_TEAM_ID` | 10-character team ID |
| `APPLE_API_KEY_ID` | Key ID from App Store Connect |
| `APPLE_API_ISSUER` | Issuer ID from App Store Connect |
| `APPLE_API_KEY` | Contents of the .p8 private key file |

## Manual Workflow Dispatch

You can trigger a build manually from the Actions tab without pushing a tag. This is useful for testing the CI pipeline. An optional version input lets you override the package.json version.

## Typical Release Flow

```
1. Finish work on master
2. npm run release
3. Select bump type → typecheck → tests → confirm
4. Tag pushed → CI builds → release published
5. Users download from GitHub Releases
```
