# AgentBuddy Build Instructions

## Prerequisites
- Node.js v22 or higher
- npm v10 or higher
- macOS (for Mac builds)
- Xcode Command Line Tools (for native module compilation)

## Quick Start

### Development Build
```bash
npm install
npm run dev
```

### Production Build
```bash
./build-production.sh
```

## Build Scripts

### 1. `build-production.sh` - Recommended for local production builds
- Cleans previous builds
- Installs all dependencies
- Builds all packages
- **Correctly rebuilds native modules for Electron**
- Packages the application

### 2. `ci-build.sh` - For CI/CD pipelines
- Designed for automated builds
- Uses `npm ci` for reproducible installs
- Includes platform detection
- Suitable for GitHub Actions, CircleCI, etc.

### 3. `build.sh` - Legacy build script
- Original build script
- Still functional but less robust

## Testing the Build

After building, test the application:
```bash
./run_with_logs.sh
```

This will:
- Run the packaged application
- Save logs to `logs/` directory
- Display real-time output

## Native Module Compilation

The application uses native Node.js modules that must be compiled for Electron's Node.js version:
- **better-sqlite3** - SQLite database
- **node-pty** - Terminal emulation
- **usearch** - Vector search
- **onnxruntime-node** - Machine learning runtime

### Key Points:
1. **MODULE_VERSION Compatibility**: Electron uses Node.js v22.17.1 (MODULE_VERSION 127)
2. **Workspace Hoisting**: API dependencies must be installed with `--no-workspaces` flag
3. **Rebuild Tool**: Use `@electron/rebuild` to compile for correct Electron version

## Troubleshooting

### MODULE_VERSION Errors
If you see errors like:
```
NODE_MODULE_VERSION 136. This version of Node.js requires NODE_MODULE_VERSION 127
```

**Solution**: Run `./build-production.sh` to rebuild native modules correctly.

### API Server Not Starting
Check that:
1. Native modules are compiled for Electron
2. `packages/api/node_modules` exists
3. No modules are hoisted to root

### Build Failures
1. Clean everything: `rm -rf node_modules packages/*/node_modules dist`
2. Run `./build-production.sh`

## Installation

After successful build:

### From DMG (Recommended)
1. Open `dist/root-*.dmg`
2. Drag app to Applications folder
3. Run from Applications

### Direct from dist/
```bash
./run_with_logs.sh
```
This runs the app directly from `dist/mac-arm64/root.app`

## Project Structure
```
AgentBuddy/
├── packages/
│   ├── api/           # Backend API server
│   │   └── node_modules/  # Must contain native modules
│   ├── main/          # Electron main process
│   ├── preload/       # Preload scripts
│   └── renderer/      # Frontend UI
├── dist/              # Build output
│   └── mac-arm64/     # Mac build
│       └── root.app/  # Packaged application
└── logs/              # Application logs
```

## Configuration

### electron-builder.mjs
Key settings:
- `npmRebuild: false` - Prevents double rebuilding
- `asar: false` - API server needs file access
- Includes `packages/api/node_modules/**/*`

## Release Process

1. Update version in `package.json`
2. Run `./build-production.sh`
3. Test with `./run_with_logs.sh`
4. Create GitHub release with:
   - `dist/root-*.dmg`
   - `dist/root-*.zip`