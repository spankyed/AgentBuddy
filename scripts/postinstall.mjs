import { execSync } from 'child_process'
import { chmodSync } from 'fs'

// Rebuild node-pty for the current platform
execSync('npm rebuild node-pty', { cwd: 'packages/api', stdio: 'inherit' })

// Make spawn-helper executable (macOS only, no-op elsewhere)
try { chmodSync('node_modules/node-pty/prebuilds/darwin-arm64/spawn-helper', 0o755) } catch {}
