/**
 * Shared helpers for subcommand namespaces.
 *
 * Every `mcp.list()` / `auth.status()` / `plugins.install()` etc. ultimately
 * becomes an `execOnce` call. Rather than each namespace reinventing error
 * handling and JSON parsing, they all go through these two helpers:
 *
 *   - `run(args, opts)`      → one-shot, returns trimmed stdout
 *   - `runJson<T>(args, opts)` → one-shot, `JSON.parse` the stdout
 *
 * Callers are free to fall through to `execOnce` directly for bespoke cases
 * (long-lived children, custom stdin, etc.).
 */

import { execOnce, type ExecOnceOptions } from './runner'
import { ClaudeProtocolError } from './errors'

export interface SubcommandOptions extends ExecOnceOptions {
  /** Prepend these args before everything else (e.g. `['--debug']`). */
  prefix?: readonly string[]
}

/** Run a subcommand, return trimmed stdout. */
export async function run(
  args: readonly string[],
  opts: SubcommandOptions = {},
): Promise<string> {
  const full = opts.prefix ? [...opts.prefix, ...args] : args
  const { stdout } = await execOnce(full, opts)
  return stdout.trim()
}

/** Run a subcommand and `JSON.parse` its stdout. Throws on parse failure. */
export async function runJson<T = unknown>(
  args: readonly string[],
  opts: SubcommandOptions = {},
): Promise<T> {
  const raw = await run(args, opts)
  try {
    return JSON.parse(raw) as T
  } catch (err) {
    throw new ClaudeProtocolError(
      `expected JSON from \`claude ${args.join(' ')}\``,
      raw,
      err,
    )
  }
}

/** Convert a `--scope <scope>` option into argv. */
export function scopeArg(scope?: 'user' | 'project' | 'local'): string[] {
  return scope ? ['--scope', scope] : []
}
