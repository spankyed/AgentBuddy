/**
 * Native MCP CLI operations. list/get return human output, not server configuration records.
 * They can start approved servers for health checks. Use QueryHandle.getMcpStatus for live status.
 */
import { run, scopeArg, type SubcommandOptions } from './subcommand.ts'

type Scope = 'user' | 'project' | 'local'

/** Keep native notices, connection/pending states and details without parsing display text. */
export async function list(opts?: SubcommandOptions): Promise<string> {
  return run(['mcp', 'list'], opts)
}

/** Native detail output includes source/approval state; health checking may start the server. */
export async function get(name: string, opts?: SubcommandOptions): Promise<string> {
  return run(['mcp', 'get', name], opts)
}

/** Remove an MCP server through its native source-scoped writer. */
export async function remove(name: string, opts: { scope?: Scope } & SubcommandOptions = {}): Promise<string> {
  return run(['mcp', 'remove', name, ...scopeArg(opts.scope)], opts)
}
