/**
 * `claude mcp` — Model Context Protocol server management.
 *
 * Covers the full subcommand surface: list/get/add-json/add-from-claude-desktop
 * /remove/reset-project-choices. Does NOT wrap `claude mcp serve` — that's a
 * long-lived stdio process better driven via `runner.spawnStream` directly.
 */

import { run, runJson, scopeArg, type SubcommandOptions } from './subcommand'

type Scope = 'user' | 'project' | 'local'

export interface McpServerInfo {
  name: string
  type?: 'stdio' | 'sse' | 'http' | 'websocket'
  command?: string
  args?: string[]
  url?: string
  scope?: Scope
  [key: string]: unknown
}

export async function list(opts?: SubcommandOptions): Promise<McpServerInfo[]> {
  // The CLI prints a human-readable list. We return raw stdout split by line
  // because `mcp list` has no `--json` flag. Callers wanting structured data
  // should use `get(name)` per-server after listing.
  const out = await run(['mcp', 'list'], opts)
  return parseMcpListPlain(out)
}

export async function get(name: string, opts?: SubcommandOptions): Promise<McpServerInfo> {
  const raw = await run(['mcp', 'get', name], opts)
  return { name, raw: raw } as unknown as McpServerInfo
}

export interface McpAddJsonOptions extends SubcommandOptions {
  scope?: Scope
  clientSecret?: string
}

/** Add an MCP server from a JSON config string. */
export async function addJson(
  name: string,
  config: string | object,
  opts: McpAddJsonOptions = {},
): Promise<string> {
  const json = typeof config === 'string' ? config : JSON.stringify(config)
  const args = ['mcp', 'add-json', name, json, ...scopeArg(opts.scope)]
  if (opts.clientSecret) args.push('--client-secret', opts.clientSecret)
  return run(args, opts)
}

/** Import all MCP servers from Claude Desktop's config. */
export async function addFromClaudeDesktop(
  opts: { scope?: Scope } & SubcommandOptions = {},
): Promise<string> {
  return run(['mcp', 'add-from-claude-desktop', ...scopeArg(opts.scope)], opts)
}

/** Remove an MCP server. */
export async function remove(
  name: string,
  opts: { scope?: Scope } & SubcommandOptions = {},
): Promise<string> {
  return run(['mcp', 'remove', name, ...scopeArg(opts.scope)], opts)
}

/** Reset project-level MCP approval choices (.mcp.json). */
export async function resetProjectChoices(opts?: SubcommandOptions): Promise<string> {
  return run(['mcp', 'reset-project-choices'], opts)
}

// ─── Fallback parser for `mcp list` plain output ─────────────────────────────
// The CLI does not expose `--json` for `mcp list`. Output looks roughly like:
//   filesystem: stdio /usr/local/bin/mcp-fs
//   github:     sse   https://mcp.github.com
// We parse defensively — unknown lines become `{name, raw: line}`.

function parseMcpListPlain(output: string): McpServerInfo[] {
  const out: McpServerInfo[] = []
  for (const line of output.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const match = trimmed.match(/^([^\s:]+):\s*(\S+)\s*(.*)$/)
    if (match) {
      const [, name, type, rest] = match
      const info: McpServerInfo = { name }
      if (type === 'stdio' || type === 'sse' || type === 'http' || type === 'websocket') {
        info.type = type
      }
      if (rest) info.command = rest.trim()
      out.push(info)
    } else {
      out.push({ name: trimmed })
    }
  }
  return out
}

// Re-export runJson for callers wanting to hit `mcp get <name> --json` if
// that flag ever gets added. Not used today.
export { runJson as _runJson }
