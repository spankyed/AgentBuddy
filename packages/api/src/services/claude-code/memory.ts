/**
 * `claude memory` — list/add/remove memory files (CLAUDE.md fragments).
 */

import { run, runJson, type SubcommandOptions } from './subcommand'

type Scope = 'user' | 'project' | 'local'

export interface MemoryFile {
  name: string
  scope?: Scope
  path?: string
  size?: number
  [key: string]: unknown
}

export async function list(
  opts: { scope?: Scope; dir?: string } & SubcommandOptions = {},
): Promise<MemoryFile[]> {
  const args = ['memory', 'list', '--json']
  if (opts.scope) args.push('--scope', opts.scope)
  if (opts.dir) args.push('--dir', opts.dir)
  return runJson<MemoryFile[]>(args, opts)
}

export async function add(
  name: string,
  opts: { scope?: Scope; dir?: string } & SubcommandOptions = {},
): Promise<string> {
  const args = ['memory', 'add', name]
  if (opts.scope) args.push('--scope', opts.scope)
  if (opts.dir) args.push('--dir', opts.dir)
  return run(args, opts)
}

export async function remove(
  name: string,
  opts: { scope?: Scope; dir?: string } & SubcommandOptions = {},
): Promise<string> {
  const args = ['memory', 'remove', name]
  if (opts.scope) args.push('--scope', opts.scope)
  if (opts.dir) args.push('--dir', opts.dir)
  return run(args, opts)
}
