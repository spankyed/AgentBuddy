import { createClaudeWorkflowActivity } from '#features/code/be/services/claude-code/workflow-activity.ts'
import type { StreamLine } from '#features/code/be/services/claude-code/types.ts'
const event = (subtype: string, fields: Record<string, unknown> = {}) => ({ type: 'system', subtype, task_id: 'task', tool_use_id: 'tool', ...fields }) as StreamLine
const start = () => event('task_started', { task_type: 'local_workflow', workflow_name: 'Fixture' })

describe('process-owned Workflow activity', () => {
  it('replays latest state to late root registration and keeps terminal status monotonic', () => {
    const activity = createClaudeWorkflowActivity(), receive = vi.fn()
    activity.observe(start())
    activity.observe(event('task_progress', { workflow_progress: [{ type: 'workflow_phase', title: 'Review' }], usage: { duration_ms: 25 } }))
    activity.register('tool', receive)
    expect(receive).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'running', phase: 'Review', durationMs: 25 }))
    activity.observe(event('task_notification', { status: 'completed', summary: 'Done' }))
    activity.observe(start()); activity.observe(event('task_progress', { workflow_progress: [{ type: 'workflow_phase', title: 'stale' }] }))
    expect(receive).toHaveBeenCalledTimes(2)
    expect(activity.get('tool')).toMatchObject({ status: 'completed', phase: 'Review', summary: 'Done' })
    const copy = activity.get('tool')!; copy.name = 'external mutation'
    expect(activity.get('tool')?.name).toBe('Fixture')
    expect(activity.takeErrors()).toBe(false)
  })
  it('keeps roots isolated and refuses identity reassignment', () => {
    const activity = createClaudeWorkflowActivity(), receive = vi.fn()
    activity.register('other', receive); activity.observe(start())
    expect(receive).not.toHaveBeenCalled()
    expect(() => activity.observe(event('task_progress', { tool_use_id: 'other' }))).toThrow('another tool')
    expect(() => activity.observe(event('task_started', { task_type: 'local_workflow', tool_use_id: 'other' }))).toThrow('tool identity')
    expect(() => activity.observe(event('task_started', { task_type: 'local_workflow', task_id: 'replacement' }))).toThrow('task identity')
  })
  it.each(['failed', 'stopped'])('accounts %s once without restarting terminal tasks', status => {
    const activity = createClaudeWorkflowActivity(); activity.observe(start()); activity.observe(event('task_notification', { status }))
    expect(activity.takeErrors()).toBe(true); expect(activity.takeErrors()).toBe(false)
    activity.observe(event('task_notification', { status })); expect(activity.takeErrors()).toBe(false)
  })
  it('reports lost connection without inventing native stopped/completed and closes bindings once', () => {
    const activity = createClaudeWorkflowActivity(), receive = vi.fn()
    activity.register('tool', receive); activity.observe(start()); activity.close(); activity.close()
    expect(receive).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'unavailable' }))
    expect(receive).toHaveBeenCalledTimes(2)
    activity.observe(event('task_notification', { status: 'completed' })); activity.register('tool', receive)
    expect(receive).toHaveBeenCalledTimes(2); expect(activity.get('tool')).toBeUndefined()
  })
  it('ignores other task kinds and unknown or malformed updates', () => {
    const activity = createClaudeWorkflowActivity()
    activity.observe(event('task_started', { task_type: 'local_agent' }))
    activity.observe(event('task_notification', { status: 'failed' })); expect(activity.get('tool')).toBeUndefined()
    activity.observe(start()); activity.observe(event('task_notification', { status: 'unexpected' }))
    activity.observe(event('task_progress', { workflow_progress: [null, 42, {}], usage: { duration_ms: NaN } }))
    expect(activity.get('tool')).toMatchObject({ status: 'running' }); expect(activity.get('tool')?.durationMs).toBeUndefined()
  })
})
