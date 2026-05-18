import type { ThreadEvent } from '@openai/codex-sdk'

export interface CodexQueryOptions {
  prompt: string
  cwd?: string
  threadId?: string
  model?: string
  sandboxMode?: 'read-only' | 'workspace-write' | 'danger-full-access'
  approvalPolicy?: 'never' | 'on-request' | 'on-failure' | 'untrusted'
  additionalDirectories?: string[]
  reasoningEffort?: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'
}

export interface CodexHandle {
  events: AsyncGenerator<ThreadEvent>
  threadId: Promise<string>
  abort(): void
}
