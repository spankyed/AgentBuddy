import { z } from 'zod'
import { execOnce } from './runner.ts'
import { ClaudeExitError, ClaudeProtocolError } from './errors.ts'
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

const HookConfigSchema = z.object({ type: z.string().min(1) }).passthrough()
const HookTargetSchema = z.object({ event: z.string().min(1), matcher: z.string().optional(), hook: HookConfigSchema }).strict()
const editFields = { source: z.enum(['userSettings', 'projectSettings', 'localSettings']), event: z.string().min(1), matcher: z.string().optional() }
const HookEditSchema = z.discriminatedUnion('op', [
  z.object({ ...editFields, op: z.literal('add'), hook: HookConfigSchema }).strict(),
  z.object({ ...editFields, op: z.literal('replace'), hook: HookConfigSchema, target: HookTargetSchema }).strict(),
  z.object({ ...editFields, op: z.literal('remove'), target: HookTargetSchema }).strict(),
])
export type ClaudeHookEdit = z.infer<typeof HookEditSchema>
const HookEditResultSchema = z.discriminatedUnion('ok', [
  z.object({ ok: z.literal(true) }).passthrough(),
  z.object({ ok: z.literal(false), code: z.string(), error: z.string(), refusal: z.record(z.unknown()).optional() }).passthrough(),
])
export type ClaudeHookEditResult = z.infer<typeof HookEditResultSchema>

/** Native writer owns hook validation, target identity, masked headers, policy and file scope. */
export async function editHook(edit: ClaudeHookEdit, options: ClaudeHooksOptions): Promise<ClaudeHookEditResult> {
  HookEditSchema.parse(edit)
  // Serialize the original object: validation must not strip keys before the native validator sees them.
  const input = JSON.stringify(edit) + '\n'
  if (input.length > 524288) throw new Error('Hook edit exceeds native stdin limit')
  const { cwd, env, cliPath, signal } = options
  try {
    const result = await execOnce(['edit-hook', '--json'], { cwd, env, cliPath, signal, input, timeoutMs: 15000 })
    const response = HookEditResultSchema.parse(JSON.parse(result.stdout))
    if (!response.ok) throw new ClaudeProtocolError('Native hook edit returned a refusal with a successful exit')
    return response
  } catch (error) {
    if (!(error instanceof ClaudeExitError) || error.exitCode !== 1 || !error.stdout.trim()) throw error
    let response: ClaudeHookEditResult
    try { response = HookEditResultSchema.parse(JSON.parse(error.stdout)) } catch { throw error }
    if (response.ok) throw error
    return response
  }
}
