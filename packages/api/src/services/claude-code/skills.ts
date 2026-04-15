/**
 * `claude skill` — install/uninstall/enable/disable skills + validate + publish.
 */

import { run, runJson, scopeArg, type SubcommandOptions } from './subcommand'

type Scope = 'user' | 'project' | 'local' | 'builtin'

export interface SkillInfo {
  name: string
  enabled?: boolean
  scope?: Scope
  path?: string
  description?: string
  [key: string]: unknown
}

export async function list(
  opts: { available?: boolean; scope?: Scope } & SubcommandOptions = {},
): Promise<SkillInfo[]> {
  const args = ['skill', 'list', '--json']
  if (opts.available) args.push('--available')
  if (opts.scope) args.push('--scope', opts.scope)
  return runJson<SkillInfo[]>(args, opts)
}

export async function validate(path: string, opts?: SubcommandOptions): Promise<string> {
  return run(['skill', 'validate', path], opts)
}

export async function install(
  path: string,
  opts: { scope?: Exclude<Scope, 'builtin'> } & SubcommandOptions = {},
): Promise<string> {
  return run(['skill', 'install', path, ...scopeArg(opts.scope)], opts)
}

export async function uninstall(
  skill: string,
  opts: { scope?: Exclude<Scope, 'builtin'> } & SubcommandOptions = {},
): Promise<string> {
  return run(['skill', 'uninstall', skill, ...scopeArg(opts.scope)], opts)
}

export async function publish(path: string, opts?: SubcommandOptions): Promise<string> {
  return run(['skill', 'publish', path], opts)
}

export async function upgrade(
  skill: string,
  opts: { scope?: Exclude<Scope, 'builtin'> } & SubcommandOptions = {},
): Promise<string> {
  return run(['skill', 'update', skill, ...scopeArg(opts.scope)], opts)
}

export async function enable(
  skill: string,
  opts: { scope?: Exclude<Scope, 'builtin'> } & SubcommandOptions = {},
): Promise<string> {
  return run(['skill', 'enable', skill, ...scopeArg(opts.scope)], opts)
}

export async function disable(
  skill: string,
  opts: { scope?: Exclude<Scope, 'builtin'> } & SubcommandOptions = {},
): Promise<string> {
  return run(['skill', 'disable', skill, ...scopeArg(opts.scope)], opts)
}
