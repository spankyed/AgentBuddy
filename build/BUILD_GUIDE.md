# AgentBuddy Build Guide

## Quick Start

Build the app with one command:

```bash
./build.sh
```

This handles everything automatically including native module compilation.

## Build System Overview

### Key Improvements

1. **Automatic Native Module Rebuilding**: Using `@electron/rebuild` with electron-builder hooks
2. **Simplified Scripts**: One-command builds with automatic dependency handling
3. **Better Error Handling**: Clear error messages and verification steps
4. **Correct Node.js Version**: API server uses Electron's Node.js in production

### Available Build Commands

```bash
# Main build script
./build.sh              # Complete build with native modules

# Using npm scripts
npm run package         # Build and package for macOS
npm run package:mac     # Package for macOS only
npm run package:all     # Package for all platforms

# Manual rebuild of native modules (if needed)
npm run rebuild

# Development
npm start              # Start in development mode
```

### How It Works

1. **TypeScript/Vite Compilation**: Builds all packages
2. **API Dependencies**: Installs in `packages/api/node_modules` (not hoisted)
3. **Native Module Rebuild**: Automatically rebuilds for Electron v37.2.4
4. **Packaging**: Creates DMG, ZIP, and app bundle

### Native Modules

The app uses these native modules:
- `lmbd` - database / persistence
- `node-pty` - Terminal emulation
- `usearch` - Vector search
- `onnxruntime-node` - Machine learning runtime

These are automatically rebuilt for Electron during the build process.

### Build Configuration Files

- `electron-builder.mjs` - Electron-builder config with automatic native module rebuilding
- `build.sh` - Main build script
- `package.json` - Contains npm scripts for building

### Troubleshooting

#### Native Module Errors

If you see `NODE_MODULE_VERSION` mismatch errors:

```bash
# Clean and rebuild
rm -rf packages/api/node_modules
cd packages/api
npm install --no-workspaces
npx @electron/rebuild --force --module-dir . --electron-version 37.2.4
```

#### Build Failures

1. Clean everything:
```bash
rm -rf dist/ node_modules/ packages/*/node_modules packages/*/dist
npm install
```

2. Run the build:
```bash
./build.sh
```

#### Testing the Build

```bash
./run_with_logs.sh
```

This will run the packaged app and save logs to `logs/` directory.

### Platform-Specific Builds

While the default build targets macOS ARM64, you can build for other platforms:

```bash
# Windows
npx electron-builder build --config electron-builder.mjs --win

# Linux
npx electron-builder build --config electron-builder.mjs --linux

# Universal macOS (Intel + ARM)
npx electron-builder build --config electron-builder.mjs --mac --universal
```

### CI/CD Integration

For CI/CD pipelines, use:

```bash
# Install dependencies
npm ci

# Build and package
npm run package:all
```

The build artifacts will be in the `dist/` directory.

### Development Workflow

1. Make changes to code
2. Run `npm start` for development mode with hot reload
3. Test thoroughly
4. Run `./build.sh` to create production build
5. Test production build with `./run_with_logs.sh`

### Advanced Configuration

#### Custom Electron Version

Edit `package.json` to change Electron version:
```json
"devDependencies": {
  "electron": "37.2.4"
}
```

Then rebuild:
```bash
npm install
npm run rebuild
```


### Support

For issues with:
- Native modules: Check Electron version compatibility
- Build process: Check error logs in console output
- Runtime errors: Check logs in `logs/` directory