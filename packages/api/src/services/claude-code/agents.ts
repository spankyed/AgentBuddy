/**
 * `claude agents` — list configured agent definitions.
 *
 * Custom agents are defined via settings / `--agents` JSON / `.claude/agents`
 * directories. This namespace just exposes what the CLI already knows about.
 */

import { run, type SubcommandOptions } from './subcommand'

export interface AgentInfo {
  name: string
  description?: string
  source?: string
  [key: string]: unknown
}

/** List configured agents. Returns raw stdout (CLI has no --json). */
export async function list(
  opts: { settingSources?: string } & SubcommandOptions = {},
): Promise<string> {
  const args = ['agents']
  if (opts.settingSources) args.push('--setting-sources', opts.settingSources)
  return run(args, opts)
}
