import { query } from './query.ts'
import type { QueryOptions } from './types.ts'
import type { ClaudeHooksListing } from './host-controls.ts'

export interface ClaudeHooksOptions extends Pick<QueryOptions, 'env' | 'cliPath' | 'signal'> { cwd: string }

/** Read the native catalog under its selected project/settings scope; never reconstruct settings files. */
export async function getHooksListing(options: ClaudeHooksOptions): Promise<ClaudeHooksListing> {
  const allowed = new Set(['cwd', 'env', 'cliPath', 'signal'])
  const unsupported = Object.keys(options).filter(key => !allowed.has(key))
  if (unsupported.length) throw new Error(`unsupported hook catalog options: ${unsupported.join(', ')}`)
  const handle = await query({ ...options, keepStdinOpen: true, noSessionPersistence: true })
  try { return await handle.getHooksListing() } finally { await handle.close() }
}
