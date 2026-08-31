/**
 * `claude config` — read/write the CLI's settings.json / .claude.json.
 *
 * We do not touch AgentBuddy's own settings from here — this is strictly
 * about what the installed Claude Code binary considers its config.
 */

import { run, runJson, scopeArg, type SubcommandOptions } from './subcommand'

type Scope = 'user' | 'project' | 'local'

export interface ConfigInitOptions extends SubcommandOptions {
  dir?: string
  scope?: Scope
  arch?: 'auto' | 'arm64' | 'x86_64' | 'macos-universal'
  sso?: boolean
  console?: boolean
  offline?: boolean
}

export async function init(opts: ConfigInitOptions = {}): Promise<string> {
  const args = ['config', 'init']
  if (opts.dir) args.push('--dir', opts.dir)
  if (opts.scope) args.push('--scope', opts.scope)
  if (opts.arch) args.push('--arch', opts.arch)
  if (opts.sso) args.push('--sso')
  if (opts.console) args.push('--console')
  if (opts.offline) args.push('--offline')
  return run(args, opts)
}

/** Read a single config key. Returns raw stdout (usually the value). */
export async function get(key: string, opts?: SubcommandOptions): Promise<string> {
  return run(['config', 'get', key], opts)
}

export async function set(
  key: string,
  value: string,
  opts: { scope?: Scope; dir?: string } & SubcommandOptions = {},
): Promise<string> {
  const args = ['config', 'set', key, value, ...scopeArg(opts.scope)]
  if (opts.dir) args.push('--dir', opts.dir)
  return run(args, opts)
}

export async function unset(
  key: string,
  opts: { scope?: Scope; dir?: string } & SubcommandOptions = {},
): Promise<string> {
  const args = ['config', 'unset', key, ...scopeArg(opts.scope)]
  if (opts.dir) args.push('--dir', opts.dir)
  return run(args, opts)
}

export async function reset(
  opts: { scope?: Scope } & SubcommandOptions = {},
): Promise<string> {
  return run(['config', 'reset', ...scopeArg(opts.scope)], opts)
}

export interface ConfigSources {
  sources: Array<{ scope: string; path: string; settings: Record<string, unknown> }>
  [key: string]: unknown
}

export async function sources(opts?: SubcommandOptions): Promise<ConfigSources> {
  return runJson<ConfigSources>(['config', 'sources', '--json'], opts)
}
