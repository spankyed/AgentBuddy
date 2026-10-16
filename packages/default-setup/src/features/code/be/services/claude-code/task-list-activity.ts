import { z } from 'zod'
import type { StreamLine } from './types.ts'
import { ClaudeProtocolError } from './errors.ts'

const id = z.string().min(1).max(256)
const status = z.enum(['pending', 'in_progress', 'completed'])
const summary = z.object({ id, subject: z.string().max(16384) }).passthrough()
const task = summary.extend({ status, description: z.string().max(65536).optional(), owner: z.string().max(1024).optional(), blocks: z.array(id).max(4096).optional(), blockedBy: z.array(id).max(4096).optional() })
export interface ClaudeTaskObservation {
  id: string
  subject: string
  status?: 'pending' | 'in_progress' | 'completed'
  description?: string
  owner?: string
  blocks?: string[]
  blockedBy?: string[]
  needsRefresh?: boolean
}
const LIMIT = 4096
const names = new Set(['TaskCreate', 'TaskGet', 'TaskList', 'TaskUpdate'])

/** One native process/list scope. Only correlated parent tool metadata changes this observation cache. */
export function createClaudeTaskListActivity() {
  const pending = new Map<string, { name: string; taskId?: string }>()
  let tasks = new Map<string, ClaudeTaskObservation>(), sessionId: string | undefined, closed = false
  const copy = (value: ClaudeTaskObservation): ClaudeTaskObservation => ({ id: value.id, subject: value.subject,
    ...(value.status ? { status: value.status } : {}), ...(value.description !== undefined ? { description: value.description } : {}),
    ...(value.owner !== undefined ? { owner: value.owner } : {}), ...(value.blocks ? { blocks: [...value.blocks] } : {}),
    ...(value.blockedBy ? { blockedBy: [...value.blockedBy] } : {}), ...(value.needsRefresh ? { needsRefresh: true } : {}) })
  const store = (value: ClaudeTaskObservation) => {
    if (!tasks.has(value.id) && tasks.size >= LIMIT) throw new ClaudeProtocolError('native task observation limit exceeded')
    tasks.set(value.id, copy(value))
  }
  return {
    observe(event: StreamLine) {
      if (closed) return
      const line = event as Record<string, unknown>
      if (line.isReplay === true || line.historical === true || line.parent_tool_use_id != null) return
      if (line.type === 'system' && line.subtype === 'init' && typeof line.session_id === 'string') {
        if (sessionId && sessionId !== line.session_id) { tasks.clear(); pending.clear() }
        sessionId = line.session_id
      }
      if (line.type === 'result') { pending.clear(); return }
      const message = line.message as { content?: unknown } | undefined
      if (!Array.isArray(message?.content)) return
      if (line.type === 'assistant') {
        for (const block of message.content) {
          if (block?.type !== 'tool_use' || !names.has(block.name) || !id.safeParse(block.id).success) continue
          const taskId = id.safeParse(block.input?.taskId)
          const next = { name: block.name as string, taskId: taskId.success ? taskId.data : undefined }
          const previous = pending.get(block.id)
          if (previous && (previous.name !== next.name || previous.taskId !== next.taskId)) throw new ClaudeProtocolError('native task tool changed identity')
          if (!previous && pending.size >= LIMIT) throw new ClaudeProtocolError('native task pending tool limit exceeded')
          pending.set(block.id, next)
        }
        return
      }
      if (line.type !== 'user') return
      const results = message.content.filter(block => block?.type === 'tool_result')
      const request = results.length === 1 ? pending.get(results[0].tool_use_id) : undefined
      for (const result of results) pending.delete(result.tool_use_id)
      if (!request || results[0].is_error === true || line.tool_use_result === undefined) return
      const payload = line.tool_use_result
      if (request.name === 'TaskCreate') {
        const parsed = z.object({ task: summary }).safeParse(payload)
        if (parsed.success) store({ id: parsed.data.task.id, subject: parsed.data.task.subject })
      } else if (request.name === 'TaskGet') {
        const parsed = z.object({ task: task.nullable() }).safeParse(payload)
        if (!parsed.success || !request.taskId) return
        if (parsed.data.task === null) tasks.delete(request.taskId)
        else if (parsed.data.task.id === request.taskId) store(parsed.data.task)
      } else if (request.name === 'TaskList') {
        const parsed = z.object({ tasks: z.array(task).max(LIMIT) }).safeParse(payload)
        if (!parsed.success || new Set(parsed.data.tasks.map(value => value.id)).size !== parsed.data.tasks.length) return
        tasks = new Map(parsed.data.tasks.map(value => [value.id, copy(value)]))
      } else {
        const parsed = z.object({ success: z.literal(true), taskId: id, updatedFields: z.array(z.string()).max(100), statusChange: z.object({ from: status, to: z.enum(['pending', 'in_progress', 'completed', 'deleted']) }).optional() }).safeParse(payload)
        if (!parsed.success || parsed.data.taskId !== request.taskId) return
        if (parsed.data.updatedFields.includes('deleted') && parsed.data.statusChange?.to === 'deleted') {
          tasks.delete(parsed.data.taskId)
          return
        }
        if (parsed.data.statusChange?.to === 'deleted') return
        const previous = tasks.get(parsed.data.taskId)
        if (!previous) return
        const next = { ...previous }
        if (parsed.data.updatedFields.includes('status') && parsed.data.statusChange) next.status = parsed.data.statusChange.to
        if (parsed.data.updatedFields.some(field => field !== 'status')) next.needsRefresh = true
        store(next)
      }
    },
    list(): ClaudeTaskObservation[] {
      return [...tasks.values()].map(copy)
    },
    close() { closed = true; tasks.clear(); pending.clear() },
  }
}
