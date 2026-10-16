import { z } from 'zod'
import { execOnce } from './runner.ts'
import { ClaudeSkillStateSchema } from './host-controls.ts'
import { query } from './query.ts'
import type { QueryOptions } from './types.ts'
import type { ClaudeSkillsDialog } from './host-controls.ts'

export interface ClaudeSkillsOptions extends Pick<QueryOptions, 'env' | 'cliPath' | 'signal'> {
  cwd: string
}

/** Native discovery includes directory Skills, legacy commands, effective states and locks. */
/** Starts/closes a native process and can run configured session lifecycle hooks. */
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

const SkillEditSchema = z.object({
  name: z.string().min(1).max(500), state: ClaudeSkillStateSchema,
  handles: z.object({ unqualified_name: z.string().max(500).optional(), aliases: z.array(z.string().max(500)).max(20).optional(), bare_name_reserved: z.boolean().optional() }).optional(),
}).strict()
export interface ClaudeSkillEdit {
  name: string
  state: string
  handles?: { unqualified_name?: string; aliases?: string[]; bare_name_reserved?: boolean }
}

/** The native extension-facing writer owns lock checks and local override persistence. */
export async function editSkillOverride(edit: ClaudeSkillEdit, options: ClaudeSkillsOptions): Promise<{ changed: boolean }> {
  const valid = SkillEditSchema.parse(edit)
  const input = JSON.stringify(valid) + '\n'
  if (Buffer.byteLength(input) > 4096) throw new Error('Skill edit exceeds native stdin limit')
  const { cwd, env, cliPath, signal } = options
  const result = await execOnce(['edit-skill-overrides', '--json'], { cwd, env, cliPath, signal, input, timeoutMs: 15000 })
  const response = z.object({ ok: z.literal(true), changed: z.boolean(), written: SkillEditSchema }).parse(JSON.parse(result.stdout))
  if (response.written.name !== valid.name || response.written.state !== valid.state) throw new Error('Native Skill edit acknowledgement does not match the request')
  return { changed: response.changed }
}
