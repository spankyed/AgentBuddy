import threadSettings from '../../src/features/threads/settings'
import claudeCodeFlow from '../../src/seeds/flows/claude-code-flow'
import { phaseTipPromptLabel } from '../../src/seeds/actions/claude-code/chat'

const chat = threadSettings.plugins.threads.chat

describe('mode name routing', () => {
  it('uses display names for default mode and phase settings', () => {
    expect(chat.defaultMode).toBe('Claude Code')
    expect(chat.defaultPhase).toBe('Plan')
  })

  it('uses Default as the Codex default phase display name', () => {
    const codexMode = chat.modes.find(mode => mode.id === 'codex')
    const defaultPhase = codexMode?.phases?.find(phase => phase.id === 'default')

    expect(defaultPhase?.name).toBe('Default')
  })

  it('routes Claude Code user messages by mode name', () => {
    const userMessageTrack = claudeCodeFlow['Claude Code'].find((track: any) => track.event === 'user.message') as any
    const condition = userMessageTrack.exits[0][0].conditions[0].if

    expect(condition).toBe("$.event.data.payload.mode == 'Claude Code'")
  })

  it('uses phase names for Claude Code phase tips', () => {
    expect(phaseTipPromptLabel('Plan')).toBe('Plan Phase Tips System')
    expect(phaseTipPromptLabel('Edit')).toBe('Edit Phase Tips System')
    expect(phaseTipPromptLabel('plan')).toBeUndefined()
  })
})
