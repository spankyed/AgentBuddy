import { query } from './query.ts'
import { ClaudeUsageOptionsSchema, type ClaudeUsage, type ClaudeUsageOptions } from './host-controls.ts'
import type { QueryOptions } from './types.ts'
export interface ClaudeUsageReadOptions extends Pick<QueryOptions, 'env' | 'cliPath' | 'signal'>, ClaudeUsageOptions {
  cwd: string
}
/** Fresh native process: configured lifecycle hooks and native account reads may run. */
export async function getUsage(options: ClaudeUsageReadOptions): Promise<ClaudeUsage> {
  const allowed = new Set(['cwd', 'env', 'cliPath', 'signal', 'includeBehaviors'])
  const unsupported = Object.keys(options).filter(key => !allowed.has(key))
  if (unsupported.length) throw new Error(`unsupported usage options: ${unsupported.join(', ')}`)
  const readOptions = ClaudeUsageOptionsSchema.parse({ includeBehaviors: options.includeBehaviors })
  const { cwd, env, cliPath, signal } = options
  const handle = await query({ cwd, env, cliPath, signal, keepStdinOpen: true, noSessionPersistence: true })
  try { return await handle.getUsage(readOptions) } finally { await handle.close() }
}
