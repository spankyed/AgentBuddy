/**
 * Pure translation from `QueryOptions` to the argv the CLI expects.
 *
 * Kept side-effect-free and dependency-free so unit tests can exhaustively
 * table-drive every flag without spawning anything. Every option in
 * `QueryOptions` has exactly one case here — when adding a new option, add
 * its mapping in this file and the matching test.
 */

import type { QueryOptions } from './types'

/**
 * Build the argv vector for `claude` given a `QueryOptions` bag.
 *
 * Always emits `--print --input-format stream-json --output-format stream-json`
 * so the wrapper can drive the conversation over NDJSON regardless of whether
 * the caller wanted a one-shot or a streaming exchange.
 */
export function argsFromOptions(opts: QueryOptions): string[] {
  const args: string[] = [
    '--print',
    '--input-format', 'stream-json',
    '--output-format', 'stream-json',
    '--verbose', // required alongside stream-json per CLI argument validator
  ]

  // ─── Model / behaviour ────────────────────────────────────────────────────
  if (opts.model) args.push('--model', opts.model)
  if (opts.fallbackModel) args.push('--fallback-model', opts.fallbackModel)
  if (opts.effort) args.push('--effort', opts.effort)
  if (opts.thinking) args.push('--thinking', opts.thinking)
  if (opts.maxThinkingTokens !== undefined) args.push('--max-thinking-tokens', String(opts.maxThinkingTokens))
  if (opts.maxTurns !== undefined) args.push('--max-turns', String(opts.maxTurns))
  if (opts.maxBudgetUsd !== undefined) args.push('--max-budget-usd', String(opts.maxBudgetUsd))
  if (opts.agent) args.push('--agent', opts.agent)
  if (opts.agents) args.push('--agents', JSON.stringify(opts.agents))
  if (opts.betas?.length) args.push('--betas', ...opts.betas)

  // ─── Permissions ──────────────────────────────────────────────────────────
  if (opts.permissionMode) args.push('--permission-mode', opts.permissionMode)
  if (opts.dangerouslySkipPermissions) args.push('--dangerously-skip-permissions')
  if (opts.allowedTools?.length) args.push('--allowed-tools', ...opts.allowedTools)
  if (opts.disallowedTools?.length) args.push('--disallowed-tools', ...opts.disallowedTools)
  if (opts.tools !== undefined) {
    if (opts.tools === 'default') args.push('--tools', 'default')
    else if (opts.tools.length === 0) args.push('--tools', '')
    else args.push('--tools', ...opts.tools)
  }

  // ─── System prompt ────────────────────────────────────────────────────────
  if (opts.systemPrompt) args.push('--system-prompt', opts.systemPrompt)
  if (opts.appendSystemPrompt) args.push('--append-system-prompt', opts.appendSystemPrompt)
  if (opts.systemPromptFile) args.push('--system-prompt-file', opts.systemPromptFile)
  if (opts.appendSystemPromptFile) args.push('--append-system-prompt-file', opts.appendSystemPromptFile)

  // ─── MCP / plugins / dirs ─────────────────────────────────────────────────
  if (opts.mcpConfig?.length) args.push('--mcp-config', ...opts.mcpConfig)
  if (opts.strictMcpConfig) args.push('--strict-mcp-config')
  if (opts.pluginDir?.length) {
    for (const dir of opts.pluginDir) args.push('--plugin-dir', dir)
  }
  if (opts.addDir?.length) args.push('--add-dir', ...opts.addDir)

  // ─── Settings ─────────────────────────────────────────────────────────────
  if (opts.settings) args.push('--settings', opts.settings)
  if (opts.settingSources?.length) args.push('--setting-sources', opts.settingSources.join(','))

  // ─── Structured output ────────────────────────────────────────────────────
  if (opts.jsonSchema !== undefined) args.push('--json-schema', JSON.stringify(opts.jsonSchema))

  // ─── Session control ──────────────────────────────────────────────────────
  if (opts.continue) args.push('--continue')
  if (opts.resume !== undefined) {
    if (opts.resume === true) args.push('--resume')
    else args.push('--resume', opts.resume)
  }
  if (opts.forkSession) args.push('--fork-session')
  if (opts.sessionId) args.push('--session-id', opts.sessionId)
  if (opts.noSessionPersistence) args.push('--no-session-persistence')

  // ─── Streaming knobs ──────────────────────────────────────────────────────
  if (opts.includePartialMessages) args.push('--include-partial-messages')
  if (opts.includeHookEvents) args.push('--include-hook-events')
  if (opts.replayUserMessages) args.push('--replay-user-messages')

  return args
}
