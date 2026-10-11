# Local preview builds

Build the upcoming app version with production behavior and its own data:

```sh
npm run build:preview -- --version 0.4.0
```

This produces an unsigned, unpacked **apack Preview** in `dist/preview`. On Apple Silicon the app is
`dist/preview/mac-arm64/apack Preview.app`. Nothing is published, installed, or copied from another app.
Release versions in `package.json` and `package-lock.json` stay unchanged.

The default version is `0.4.0-preview.1`. To distinguish a later build, pass `--version 0.4.0-preview.2`.
Preview migrations use the target release (`0.4.0`), just as beta migrations do; future migrations stay pending.

Preview's identity is `dev.apack.preview`, its URL scheme is `apack-preview`, and its persistent data directory
is `apack-preview` (on macOS, `~/Library/Application Support/apack-preview`). It can run alongside production
and beta. Import a backup through Settings to test the upgrade using a separate copy of your data. A test can
override `APACK_USER_DATA_DIR` to keep all its data temporary.

Open the bundle directly or use `apack open --app preview` after Launch Services has registered it.
If you install its bundled CLI using Settings, the command is `apack-preview`. Its data commands default to
preview data; explicit target flags override that default. A standalone npm CLI still defaults to production.

Each packaging run gets a fresh staging directory under `.temp/app-builds`. The four app bundlers write
there, leaving development's workspace `dist` directories alone. A single `build-manifest.json` records
version and channel; main and API read that same file at runtime, and electron-builder uses it for app identity
and package version. After all bundlers succeed, a hash receipt records their outputs. Packaging verifies the
staging files and the actual packaged files against that receipt before signing. Incomplete, changed, or mixed
artifacts are refused during packaging, with no runtime version comparisons.

Production and beta use the same staging mechanism through the release workflow. Release versions still
come from `package.json`; preview overrides are refused outside the preview channel.
