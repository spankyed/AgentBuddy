import codexFlow from '../../src/features/code/flows/codex-flow'

describe('codex flow routing', () => {
  const tracks = codexFlow['Codex'] as any[]

  it('pauses without requiring a mode payload', () => {
    const pauseTrack = tracks.find(track => track.event === 'user.thread.pause') as any
    const step = pauseTrack.exits[0][0]

    expect(step.action).toBe('CDX: Pause Turn')
    expect(step.map.threadId).toBe('$.event.data.payload.threadId')
  })

  it('unqueues without requiring a mode payload', () => {
    const unqueueTrack = tracks.find(track => track.event === 'user.thread.unqueue') as any
    const step = unqueueTrack.exits[0][0]

    expect(step.action).toBe('CDX: Unqueue Message')
    expect(step.map.messageId).toBe('$.event.data.payload.messageId')
  })

  it('routes Codex revert variants', () => {
    const revertTrack = tracks.find(track => track.event === 'thread.revert') as any
    // First level is a gate branch: $.event.data.payload.agents.codex == true
    const gate = revertTrack.exits[0][0]
    expect(gate.type).toBe('switch')
    expect(gate.conditions[0].if).toBe("$.event.data.payload.agents.codex == true")

    // Inside the gate: pause step + kind router
    const gateSteps = gate.conditions[0].steps
    const pauseStep = gateSteps[0]
    const router = gateSteps[1]

    expect(pauseStep.action).toBe('CDX: Pause Turn')
    expect(router.conditions.map((condition: any) => condition.if)).toEqual([
      "$.event.data.payload.kind == 'revert'",
      "$.event.data.payload.kind == 'summarize'",
      "$.event.data.payload.kind == 'rewind'",
    ])
    expect(router.conditions[0].steps[0].action).toBe('CDX: Handle Revert')
    expect(router.conditions[1].steps[0].action).toBe('CDX: Handle Summarize')
    expect(router.conditions[2].steps[0].action).toBe('CDX: Handle Rewind Unsupported')
  })

  it('routes Codex forks', () => {
    const forkTrack = tracks.find(track => track.event === 'thread.fork') as any
    const step = forkTrack.exits[0][0]

    expect(step.action).toBe('CDX: Handle Fork')
    expect(step.map.newThreadId).toBe('$.event.data.payload.newThreadId')
    expect(step.map.sourceUserMessagesAfterFork).toBe('$.event.data.payload.sourceUserMessagesAfterFork')
  })
})
