/**
 * Approval gate for tool execution.
 *
 * Provides a factory that creates an `ApproveFn` wired to the chat UI's
 * approval block system. When a tool needs approval, it sends a block
 * message to the chat thread and awaits the user's decision.
 *
 * The service layer stays UI-agnostic — the `ApproveFn` is injected by
 * the action/flow layer that owns the chat thread.
 */

import type { ApproveFn } from './types'

interface ChatService {
  sendBlockMessage(opts: {
    threadId: string
    text: string
    blocks: Array<{
      type: string
      props: Record<string, unknown>
    }>
    forkable?: boolean
  }): { messageId: string; response: Promise<unknown> }
}

export interface ChatApproverOptions {
  /** Chat service for sending approval blocks. */
  chat: ChatService
  /** Thread ID to send approval blocks to. */
  threadId: string
  /** Called when the tool is waiting for approval (e.g. to pause stream indicators). */
  onPause?: () => void
  /** Called when approval is received (e.g. to resume stream indicators). */
  onResume?: () => void
}

/**
 * Create an `ApproveFn` that sends approval blocks to the chat UI.
 *
 * Usage:
 * ```ts
 * const approve = createChatApprover({ chat: services.chat, threadId })
 * const tools = codingAgentTools({ cwd: '/project', approve })
 * ```
 */
export function createChatApprover(opts: ChatApproverOptions): ApproveFn {
  return async (description: string, detail?: string) => {
    opts.onPause?.()

    try {
      const { response } = opts.chat.sendBlockMessage({
        threadId: opts.threadId,
        text: description,
        blocks: [{
          type: 'approval',
          props: {
            content: detail ?? description,
            options: [
              { label: 'Allow', variant: 'primary', flags: { decision: 'approved' } },
              { label: 'Deny', variant: 'danger', flags: { decision: 'denied' } },
            ],
          },
        }],
        forkable: false,
      })

      const result = await response as Record<string, unknown> | null
      const flags = result?.flags as Record<string, unknown> | undefined
      return (flags?.decision as 'approved' | 'denied') ?? 'denied'
    } finally {
      opts.onResume?.()
    }
  }
}
