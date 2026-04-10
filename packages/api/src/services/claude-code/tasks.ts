/**
 * `claude task` — create/list/get/update scheduled or ad-hoc tasks.
 *
 * This is a CLI-owned ticketing system, not AgentBuddy's own task store.
 * Use it to schedule work on the CLI side (e.g. `--later` agentic runs).
 */

import { run, runJson, type SubcommandOptions } from './subcommand'

export interface TaskInfo {
  id: string
  subject?: string
  description?: string
  status?: 'pending' | 'in_progress' | 'completed' | 'failed' | string
  owner?: string
  list?: string
  [key: string]: unknown
}

export interface TaskCreateOptions extends SubcommandOptions {
  description?: string
  list?: string
}

export async function create(
  subject: string,
  opts: TaskCreateOptions = {},
): Promise<string> {
  const args = ['task', 'create', subject]
  if (opts.description) args.push('--description', opts.description)
  if (opts.list) args.push('--list', opts.list)
  return run(args, opts)
}

export async function list(
  opts: { list?: string; pending?: boolean } & SubcommandOptions = {},
): Promise<TaskInfo[]> {
  const args = ['task', 'list', '--json']
  if (opts.list) args.push('--list', opts.list)
  if (opts.pending) args.push('--pending')
  return runJson<TaskInfo[]>(args, opts)
}

export async function get(
  id: string,
  opts: { list?: string } & SubcommandOptions = {},
): Promise<TaskInfo> {
  const args = ['task', 'get', id]
  if (opts.list) args.push('--list', opts.list)
  const raw = await run(args, opts)
  try { return JSON.parse(raw) as TaskInfo } catch { return { id, raw } as unknown as TaskInfo }
}

export interface TaskUpdateOptions extends SubcommandOptions {
  list?: string
  status?: TaskInfo['status']
  subject?: string
  description?: string
  owner?: string
  clearOwner?: boolean
}

export async function update(id: string, opts: TaskUpdateOptions = {}): Promise<string> {
  const args = ['task', 'update', id]
  if (opts.list) args.push('--list', opts.list)
  if (opts.status) args.push('--status', opts.status)
  if (opts.subject) args.push('--subject', opts.subject)
  if (opts.description) args.push('--description', opts.description)
  if (opts.owner) args.push('--owner', opts.owner)
  if (opts.clearOwner) args.push('--clear-owner')
  return run(args, opts)
}

/** Print the directory where tasks are stored. */
export async function dir(
  opts: { list?: string } & SubcommandOptions = {},
): Promise<string> {
  const args = ['task', 'dir']
  if (opts.list) args.push('--list', opts.list)
  return run(args, opts)
}
