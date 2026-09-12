/**
 * `claude plugin` — install/uninstall/enable/disable/update plugins and
 * manage plugin marketplaces.
 *
 * The CLI accepts both `plugin` and `plugins`; we use `plugin` internally.
 */

import { run, runJson, scopeArg, type SubcommandOptions } from './subcommand'

type Scope = 'user' | 'project' | 'local'

export interface PluginInfo {
  name: string
  enabled?: boolean
  source?: string
  version?: string
  path?: string
  [key: string]: unknown
}

/** List installed (or available) plugins. */
export async function list(
  opts: { available?: boolean } & SubcommandOptions = {},
): Promise<PluginInfo[]> {
  const args = ['plugin', 'list', '--json']
  if (opts.available) args.push('--available')
  return runJson<PluginInfo[]>(args, opts)
}

/** Validate a plugin directory or manifest. */
export async function validate(path: string, opts?: SubcommandOptions): Promise<string> {
  return run(['plugin', 'validate', path], opts)
}

export async function install(
  plugin: string,
  opts: { scope?: Scope } & SubcommandOptions = {},
): Promise<string> {
  return run(['plugin', 'install', plugin, ...scopeArg(opts.scope)], opts)
}

export async function uninstall(
  plugin: string,
  opts: { scope?: Scope; keepData?: boolean } & SubcommandOptions = {},
): Promise<string> {
  const args = ['plugin', 'uninstall', plugin, ...scopeArg(opts.scope)]
  if (opts.keepData) args.push('--keep-data')
  return run(args, opts)
}

export async function enable(
  plugin: string,
  opts: { scope?: Scope } & SubcommandOptions = {},
): Promise<string> {
  return run(['plugin', 'enable', plugin, ...scopeArg(opts.scope)], opts)
}

export async function disable(
  plugin: string | null,
  opts: { scope?: Scope; all?: boolean } & SubcommandOptions = {},
): Promise<string> {
  const args = ['plugin', 'disable']
  if (plugin) args.push(plugin)
  if (opts.all) args.push('--all')
  args.push(...scopeArg(opts.scope))
  return run(args, opts)
}

export async function upgrade(
  plugin: string,
  opts: { scope?: Scope } & SubcommandOptions = {},
): Promise<string> {
  return run(['plugin', 'update', plugin, ...scopeArg(opts.scope)], opts)
}

// ─── Marketplace ─────────────────────────────────────────────────────────────

export interface MarketplaceInfo {
  name: string
  source?: string
  [key: string]: unknown
}

export const marketplace = {
  async add(
    source: string,
    opts: { sparse?: string[]; scope?: Scope } & SubcommandOptions = {},
  ): Promise<string> {
    const args = ['plugin', 'marketplace', 'add', source, ...scopeArg(opts.scope)]
    if (opts.sparse?.length) args.push('--sparse', ...opts.sparse)
    return run(args, opts)
  },

  async list(opts?: SubcommandOptions): Promise<MarketplaceInfo[]> {
    return runJson<MarketplaceInfo[]>(['plugin', 'marketplace', 'list', '--json'], opts)
  },

  async remove(name: string, opts?: SubcommandOptions): Promise<string> {
    return run(['plugin', 'marketplace', 'remove', name], opts)
  },

  async update(name?: string, opts?: SubcommandOptions): Promise<string> {
    const args = ['plugin', 'marketplace', 'update']
    if (name) args.push(name)
    return run(args, opts)
  },
}
