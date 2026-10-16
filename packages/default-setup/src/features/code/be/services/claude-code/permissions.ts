import { z } from 'zod'
import { execOnce } from './runner.ts'
import { query } from './query.ts'
import type { QueryOptions } from './types.ts'
import type { ClaudePermissionRules } from './host-controls.ts'

export interface ClaudePermissionRulesOptions extends Pick<QueryOptions, 'env' | 'cliPath' | 'signal'> {
  cwd: string
}

/** Keep native rule strings and source/editability metadata; no configuration reconstruction. */
/** Starts/closes a native process and can run configured session lifecycle hooks. */
export async function getPermissionRules(options: ClaudePermissionRulesOptions): Promise<ClaudePermissionRules> {
  const allowed = new Set(['cwd', 'env', 'cliPath', 'signal'])
  const unsupported = Object.keys(options).filter(key => !allowed.has(key))
  if (unsupported.length) throw new Error(`unsupported permission catalog options: ${unsupported.join(', ')}`)
  const handle = await query({ ...options, keepStdinOpen: true, noSessionPersistence: true })
  try { return await handle.getPermissionRules() } finally { await handle.close() }
}

const PermissionBehaviorSchema = z.enum(['allow', 'deny', 'ask'])
const PermissionSourceSchema = z.enum(['userSettings', 'projectSettings', 'localSettings'])
const PermissionRuleSchema = z.string().min(1).max(10000)
const PermissionEditSchema = z.discriminatedUnion('op', [
  z.object({ op: z.literal('add'), rules: z.array(PermissionRuleSchema).min(1).max(100), behavior: PermissionBehaviorSchema, destination: PermissionSourceSchema }).strict(),
  z.object({ op: z.literal('remove'), rule: PermissionRuleSchema, behavior: PermissionBehaviorSchema, source: PermissionSourceSchema }).strict(),
])
export type ClaudePermissionEdit = z.infer<typeof PermissionEditSchema>
export interface ClaudePermissionEditResult { stored: string[]; warnings: string[] }

/** Native persistence owns canonical rule spellings, source guards and validation. */
export async function editPermissionRules(edit: ClaudePermissionEdit, options: ClaudePermissionRulesOptions): Promise<ClaudePermissionEditResult> {
  const input = JSON.stringify(PermissionEditSchema.parse(edit)) + '\n'
  if (Buffer.byteLength(input) > 2 * 1024 * 1024) throw new Error('Permission edit exceeds native stdin limit')
  const { cwd, env, cliPath, signal } = options
  const result = await execOnce(['edit-permission-rules', '--json'], { cwd, env, cliPath, signal, input, timeoutMs: 15000 })
  const response = z.object({ ok: z.literal(true), stored: z.array(z.string()), warnings: z.array(z.string()) }).parse(JSON.parse(result.stdout))
  return { stored: response.stored, warnings: response.warnings }
}
