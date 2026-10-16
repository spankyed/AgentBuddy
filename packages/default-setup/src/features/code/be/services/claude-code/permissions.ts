import { query } from './query.ts'
import type { QueryOptions } from './types.ts'
import type { ClaudePermissionRules } from './host-controls.ts'

export interface ClaudePermissionRulesOptions extends Pick<QueryOptions, 'env' | 'cliPath' | 'signal'> {
  cwd: string
}

/** Keep native rule strings and source/editability metadata; no configuration reconstruction. */
export async function getPermissionRules(options: ClaudePermissionRulesOptions): Promise<ClaudePermissionRules> {
  const allowed = new Set(['cwd', 'env', 'cliPath', 'signal'])
  const unsupported = Object.keys(options).filter(key => !allowed.has(key))
  if (unsupported.length) throw new Error(`unsupported permission catalog options: ${unsupported.join(', ')}`)
  const handle = await query({ ...options, keepStdinOpen: true, noSessionPersistence: true })
  try { return await handle.getPermissionRules() } finally { await handle.close() }
}
