/**
 * System-level commands: version, doctor, update.
 *
 * These have no subcommand namespace in the CLI — they're top-level — but we
 * group them under `system` so the facade stays tidy.
 */

import { run, type SubcommandOptions } from './subcommand'

/** Return the CLI version string (e.g. `claude 0.9.3 (macos, arm64)`). */
export async function version(opts?: SubcommandOptions): Promise<string> {
  return run(['--version'], opts)
}

/** Run `claude doctor` — best-effort health check. Returns raw stdout. */
export async function doctor(opts?: SubcommandOptions): Promise<string> {
  return run(['doctor'], opts)
}

/** Check for + install updates. Returns raw stdout. */
export async function update(opts?: SubcommandOptions): Promise<string> {
  return run(['update'], opts)
}

/** Set up a long-lived auth token (interactive). Returns raw stdout. */
export async function setupToken(opts?: SubcommandOptions): Promise<string> {
  return run(['setup-token'], opts)
}
