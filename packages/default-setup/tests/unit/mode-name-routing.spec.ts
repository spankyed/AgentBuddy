import settings from '../../src/default-settings'
import claudeCodeFlow from '../../src/flows/claude-code-flow'
import hermesFlow from '../../src/flows/hermes-flow'
import { phaseTipPromptLabel } from '../../src/actions/claude-code/chat'

describe('mode name routing', () => {
  it('uses display names for default mode and phase settings', () => {
    expect(settings.plugins.threads.chat.defaultMode).toBe('Claude Code')
    expect(settings.plugins.threads.chat.defaultPhase).toBe('Plan')
  })

  it('routes Claude Code user messages by mode name', () => {
    const userMessageTrack = claudeCodeFlow['Claude Code'].find((track: any) => track.event === 'user.message') as any
    const condition = userMessageTrack.exits[0][0].conditions[0].if

    expect(condition).toBe("$.event.data.payload.mode == 'Claude Code'")
  })

  it('routes Hermes user messages by mode name', () => {
    const userMessageTrack = hermesFlow['Hermes Agent'].find((track: any) => track.event === 'user.message') as any
    const condition = userMessageTrack.exits[0][0].conditions[0].if

    expect(condition).toBe("$.event.data.payload.mode == 'Hermes'")
  })

  it('uses phase names for Claude Code phase tips', () => {
    expect(phaseTipPromptLabel('Plan')).toBe('Plan Phase Tips System')
    expect(phaseTipPromptLabel('Edit')).toBe('Edit Phase Tips System')
    expect(phaseTipPromptLabel('plan')).toBeUndefined()
  })
})
