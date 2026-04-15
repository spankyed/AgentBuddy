/**
 * Claude Code CLI wrapper — public entry point.
 *
 * This module is a hand-rolled subprocess wrapper around the `claude` binary.
 * It keeps Claude Code the driver of the actual conversation (TOS-safe) while
 * exposing a clean, typed Node API to the rest of AgentBuddy.
 *
 * Shape:
 *   import { claudeCode } from '@/services/claude-code'
 *
 *   // Streaming conversation
 *   const conv = await claudeCode.query({ cwd, prompt: 'hi' })
 *   for await (const ev of conv.events) console.log(ev.type)
 *   const result = await conv.result
 *
 *   // Subcommand namespaces
 *   await claudeCode.system.version()
 *   await claudeCode.auth.status()
 *   await claudeCode.mcp.list()
 *   await claudeCode.sessions.list({ cwd })
 *
 * `createClaudeCode(ctx)` lets you bind a cwd / env / cliPath once and reuse
 * it across calls. `claudeCode` is a default instance bound to no cwd —
 * callers must pass cwd explicitly to `query()` and to subcommands that
 * need one.
 */

import { query as queryRaw, type QueryHandle } from './query'
import { execOnce, spawnStream } from './runner'
import type { QueryOptions } from './types'

import * as sessions from './sessions'
import * as mcp from './mcp'
import * as plugins from './plugins'
import * as skills from './skills'
import * as tasks from './tasks'
import * as agents from './agents'
import * as memory from './memory'
import * as config from './config'
import * as auth from './auth'
import * as system from './system'

// ─── Re-exports ──────────────────────────────────────────────────────────────

export * from './types'
export * from './errors'
export type { AuthStatus } from './auth'
export type { McpServerInfo } from './mcp'
export type { PluginInfo, MarketplaceInfo } from './plugins'
export type { SkillInfo } from './skills'
export type { TaskInfo, TaskCreateOptions, TaskUpdateOptions } from './tasks'
export type { AgentInfo } from './agents'
export type { MemoryFile } from './memory'
export type { ConfigSources, ConfigInitOptions } from './config'
export type { SessionInfo, SessionListOptions, SessionTranscriptEntry, SessionViewOptions } from './sessions'
export { decodeNdjson, encodeNdjsonLine } from './ndjson'
export { argsFromOptions } from './args'
export { execOnce, spawnStream } from './runner'
export { query } from './query'
export type { QueryHandle }
export { sessions, mcp, plugins, skills, tasks, agents, memory, config, auth, system }

// ─── Instance factory ────────────────────────────────────────────────────────

export interface ClaudeCodeContext {
  /** Default working directory for `query()` and subcommands. */
  cwd?: string
  /** Default process environment (defaults to `process.env`). */
  env?: NodeJS.ProcessEnv
  /** Override the resolved CLI path (skips path resolution). */
  cliPath?: string
}

export interface ClaudeCode {
  query(opts: QueryOptions): Promise<QueryHandle>
  sessions: typeof sessions
  mcp: typeof mcp
  plugins: typeof plugins
  skills: typeof skills
  tasks: typeof tasks
  agents: typeof agents
  memory: typeof memory
  config: typeof config
  auth: typeof auth
  system: typeof system
  /** Low-level escape hatch — run any argv you like against the binary. */
  exec: typeof execOnce
  /** Low-level escape hatch — start a long-lived streaming child. */
  spawn: typeof spawnStream
}

/**
 * Bind a default context (cwd / env / cliPath) and return a `ClaudeCode`
 * instance. Per-call options on `query()` override the context.
 */
export function createClaudeCode(ctx: ClaudeCodeContext = {}): ClaudeCode {
  return {
    query: opts => queryRaw({
      cwd: ctx.cwd,
      env: ctx.env,
      cliPath: ctx.cliPath,
      ...opts,
    }),
    sessions,
    mcp,
    plugins,
    skills,
    tasks,
    agents,
    memory,
    config,
    auth,
    system,
    exec: execOnce,
    spawn: spawnStream,
  }
}

/**
 * Default singleton. No cwd is bound — callers must provide one when calling
 * `query()` or any subcommand that needs a working directory.
 */
export const claudeCode: ClaudeCode = createClaudeCode()
