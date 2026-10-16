import { ClaudeProtocolError } from './errors.ts'
import type { StreamLine } from './types.ts'

export interface ClaudeWorkflowTask {
  taskId: string
  toolUseId: string
  name: string
  status: 'running' | 'completed' | 'failed' | 'stopped' | 'unavailable'
  phase?: string
  summary?: string
  durationMs?: number
}
export interface ClaudeWorkflowActivity {
  observe(event: StreamLine): void
  register(toolUseId: string, receive: (task: ClaudeWorkflowTask) => void): void
  get(toolUseId: string): ClaudeWorkflowTask | undefined
  takeErrors(): boolean
  close(): void
}

const LIMIT = 4096
const text = (value: unknown): string | undefined => typeof value === 'string' && value.length > 0 ? value.slice(0, 1000) : undefined

/** Process-owned local Workflow identities; launch replies do not complete these tasks. */
export function createClaudeWorkflowActivity(): ClaudeWorkflowActivity {
  const tasks = new Map<string, ClaudeWorkflowTask>()
  const roots = new Map<string, string>()
  const listeners = new Map<string, (task: ClaudeWorkflowTask) => void>()
  let closed = false
  let hadErrors = false
  function publish(task: ClaudeWorkflowTask): void { listeners.get(task.toolUseId)?.({ ...task }) }
  return {
    observe(event) {
      if (closed || event.type !== 'system') return
      const line = event as Record<string, unknown>
      if (!['task_started', 'task_progress', 'task_notification'].includes(String(line.subtype))) return
      if (typeof line.task_id !== 'string' || !line.task_id) return
      const id = line.task_id
      let task = tasks.get(id)
      if (line.subtype === 'task_started') {
        if (line.task_type !== 'local_workflow' || typeof line.tool_use_id !== 'string' || !line.tool_use_id) return
        if (task) {
          if (task.toolUseId !== line.tool_use_id) throw new ClaudeProtocolError('Workflow task changed its tool identity')
          return
        }
        if (roots.has(line.tool_use_id)) throw new ClaudeProtocolError('Workflow tool changed its task identity')
        if (tasks.size >= LIMIT) throw new ClaudeProtocolError('Workflow task identity limit exceeded')
        task = { taskId: id, toolUseId: line.tool_use_id, name: text(line.workflow_name) ?? text(line.description) ?? 'Workflow', status: 'running' }
        tasks.set(id, task); roots.set(task.toolUseId, id); publish(task)
        return
      }
      if (!task) return
      if (typeof line.tool_use_id === 'string' && line.tool_use_id !== task.toolUseId) throw new ClaudeProtocolError('Workflow task update belongs to another tool')
      if (task.status !== 'running') return
      const before = JSON.stringify(task)
      if (line.subtype === 'task_notification') {
        if (!['completed', 'failed', 'stopped'].includes(String(line.status))) return
        task.status = line.status as 'completed' | 'failed' | 'stopped'
        hadErrors ||= task.status !== 'completed'
      }
      if (Array.isArray(line.workflow_progress)) {
        for (let index = line.workflow_progress.length - 1; index >= 0; index--) {
          const phase = line.workflow_progress[index]
          if (phase?.type === 'workflow_phase' && typeof phase.title === 'string') { task.phase = text(phase.title); break }
        }
      }
      const summary = text(line.summary)
      if (summary) task.summary = summary
      const duration = (line.usage as { duration_ms?: unknown } | undefined)?.duration_ms
      if (typeof duration === 'number' && Number.isFinite(duration) && duration >= 0) task.durationMs = duration
      if (JSON.stringify(task) !== before) publish(task)
    },
    register(toolUseId, receive) {
      if (closed || listeners.has(toolUseId)) return
      if (listeners.size >= LIMIT) throw new ClaudeProtocolError('Workflow activity binding limit exceeded')
      listeners.set(toolUseId, receive)
      const id = roots.get(toolUseId), task = id ? tasks.get(id) : undefined
      if (task) receive({ ...task })
    },
    get(toolUseId) { const id = roots.get(toolUseId), task = id ? tasks.get(id) : undefined; return task ? { ...task } : undefined },
    takeErrors() { const value = hadErrors; hadErrors = false; return value },
    close() {
      if (closed) return
      closed = true
      for (const task of tasks.values()) if (task.status === 'running') { task.status = 'unavailable'; publish(task) }
      listeners.clear(); roots.clear(); tasks.clear()
    },
  }
}
