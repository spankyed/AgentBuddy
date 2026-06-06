import type { ThreadsSettings } from '@app/api'

type ChatState = string
type ChatStateOverride = { id: string; expiresAt: number }

export function getThreadStateConfig(
  threadId: string,
  chatStates: Record<string, ChatState>,
  chatStateOverrides: Record<string, ChatStateOverride>,
  settings: ThreadsSettings | null,
) {
  const override = chatStateOverrides[threadId]
  const activeStateId = (override && override.expiresAt > Date.now())
    ? override.id
    : (chatStates[threadId] || 'idle')
  return settings?.chatStates?.find(c => c.id === activeStateId)
}

export function getThreadDotColor(
  threadId: string,
  chatStates: Record<string, ChatState>,
  chatStateOverrides: Record<string, ChatStateOverride>,
  settings: ThreadsSettings | null,
): string | undefined {
  return getThreadStateConfig(threadId, chatStates, chatStateOverrides, settings)?.color
}

export function isThreadBusy(
  threadId: string,
  chatStates: Record<string, ChatState>,
  chatStateOverrides: Record<string, ChatStateOverride>,
  settings: ThreadsSettings | null,
): boolean {
  return getThreadStateConfig(threadId, chatStates, chatStateOverrides, settings)?.busy ?? false
}
