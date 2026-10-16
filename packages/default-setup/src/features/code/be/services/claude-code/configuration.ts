import { query } from './query.ts'
import type { QueryOptions } from './types.ts'
import type { ClaudeConfigurationSummary } from './configuration-summary.ts'
export interface ClaudeConfigurationReadOptions extends Pick<QueryOptions, 'env' | 'cliPath' | 'signal'> { cwd: string }
/** Fresh process: configured session lifecycle hooks can run even without a model turn. */
export async function getConfigurationSummary(options: ClaudeConfigurationReadOptions): Promise<ClaudeConfigurationSummary> {
  const allowed = new Set(['cwd', 'env', 'cliPath', 'signal'])
  const unsupported = Object.keys(options).filter(key => !allowed.has(key))
  if (unsupported.length) throw new Error(`unsupported configuration summary options: ${unsupported.join(', ')}`)
  const handle = await query({ ...options, keepStdinOpen: true, noSessionPersistence: true })
  try { return await handle.getConfigurationSummary() } finally { await handle.close() }
}
