import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mockService, startApp, type TestApp } from '@apack/testing/harness'
import type { Services } from '#generated/services.ts'
import threadSettings from '#features/threads/settings.ts'
import { actionLabel, writeDefaultFlows } from '../../_support/flows.ts'
import { phaseTipPromptLabel } from '../../../src/content/actions/claude-code/chat.ts'

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

  describe('Claude Code user messages, run on the brain', () => {
    let app: TestApp
    beforeEach(async () => {
      writeDefaultFlows()
      // The chat action would drive the CLI: mocked, so it never starts
      mockService<Services, 'cli'>('cli', { claudeCode: {} } as never)
      mockService<Services, 'chat'>('chat', { updateMessageState: vi.fn(), sendBlockMessage: vi.fn() })
      mockService<Services, 'threads'>('threads', { updateChatState: vi.fn() })
      app = await startApp({ systems: ['brain'] })
    })

    it('routes by mode name', async () => {
      const run = await app.runFlow('Claude Code', { event: 'user.message', data: { mode: 'Claude Code', threadId: 'Thread-1', text: 'hi' } })
      expect(run.steps.map(actionLabel)).toContain('Claude Code Chat')
    })

    it("doesn't route another mode, or the mode's id", async () => {
      for (const mode of ['Codex', 'claude-code']) {
        const run = await app.runFlow('Claude Code', { event: 'user.message', data: { mode, threadId: 'Thread-1', text: 'hi' } })
        expect(run.steps.map(actionLabel)).not.toContain('Claude Code Chat')
      }
    })
  })

  it('uses phase names for Claude Code phase tips', () => {
    expect(phaseTipPromptLabel('Plan')).toBe('Plan Phase Tips System')
    expect(phaseTipPromptLabel('Edit')).toBe('Edit Phase Tips System')
    expect(phaseTipPromptLabel('plan')).toBeUndefined()
  })
})
