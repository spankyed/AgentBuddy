import { z } from 'zod'
import { execOnce } from './runner.ts'
import { query } from './query.ts'
import type { QueryOptions } from './types.ts'
import type { ClaudeMemoryDialog } from './host-controls.ts'

export interface ClaudeMemoryOptions extends Pick<QueryOptions, 'env' | 'cliPath' | 'signal'> {
  cwd: string
}

/** Read the native instruction/memory catalog without sending a model turn. */
/** Starts/closes a native process and can run configured session lifecycle hooks. */
export async function getMemoryDialog(options: ClaudeMemoryOptions): Promise<ClaudeMemoryDialog> {
  const allowed = new Set(['cwd', 'env', 'cliPath', 'signal'])
  const unsupported = Object.keys(options).filter(key => !allowed.has(key))
  if (unsupported.length) throw new Error(`unsupported memory discovery options: ${unsupported.join(', ')}`)
  const handle = await query({ ...options, keepStdinOpen: true, noSessionPersistence: true })
  try { return await handle.getMemoryDialog() } finally { await handle.close() }
}

/** The native writer owns user-scope persistence; the returned dialog owns effective availability. */
export async function setAutoMemory(enabled: boolean, options: ClaudeMemoryOptions): Promise<void> {
  const valid = z.boolean().parse(enabled)
  const { cwd, env, cliPath, signal } = options
  const result = await execOnce(['edit-memory-settings', '--json'], {
    cwd, env, cliPath, signal, input: JSON.stringify({ autoMemoryEnabled: valid }) + '\n', timeoutMs: 15000,
  })
  const response = z.object({ ok: z.literal(true), written: z.object({ autoMemoryEnabled: z.boolean() }).passthrough() }).parse(JSON.parse(result.stdout))
  if (response.written.autoMemoryEnabled !== valid) throw new Error('Native auto-memory acknowledgement does not match the request')
}
