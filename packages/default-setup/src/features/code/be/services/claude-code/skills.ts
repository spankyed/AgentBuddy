import { query } from './query.ts'
import type { QueryOptions } from './types.ts'
import type { ClaudeSkillsDialog } from './host-controls.ts'

export interface ClaudeSkillsOptions extends Pick<QueryOptions, 'env' | 'cliPath' | 'signal'> {
  cwd: string
}

/** Native discovery includes directory Skills, legacy commands, effective states and locks. */
export async function getSkillsDialog(options: ClaudeSkillsOptions): Promise<ClaudeSkillsDialog> {
  const allowed = new Set(['cwd', 'env', 'cliPath', 'signal'])
  const unsupported = Object.keys(options).filter(key => !allowed.has(key))
  if (unsupported.length) throw new Error(`unsupported Skill discovery options: ${unsupported.join(', ')}`)
  const handle = await query({ ...options, keepStdinOpen: true, noSessionPersistence: true })
  try {
    return await handle.getSkillsDialog()
  } finally {
    await handle.close()
  }
}
