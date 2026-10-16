import { query } from './query.ts'
import type { QueryOptions } from './types.ts'
import type { ClaudeMemoryDialog } from './host-controls.ts'

export interface ClaudeMemoryOptions extends Pick<QueryOptions, 'env' | 'cliPath' | 'signal'> {
  cwd: string
}

/** Read the native instruction/memory catalog without sending a model turn. */
export async function getMemoryDialog(options: ClaudeMemoryOptions): Promise<ClaudeMemoryDialog> {
  const allowed = new Set(['cwd', 'env', 'cliPath', 'signal'])
  const unsupported = Object.keys(options).filter(key => !allowed.has(key))
  if (unsupported.length) throw new Error(`unsupported memory discovery options: ${unsupported.join(', ')}`)
  const handle = await query({ ...options, keepStdinOpen: true, noSessionPersistence: true })
  try { return await handle.getMemoryDialog() } finally { await handle.close() }
}
