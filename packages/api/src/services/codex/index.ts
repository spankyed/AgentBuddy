import { Codex } from '@openai/codex-sdk'
import type { ThreadEvent } from '@openai/codex-sdk'
import type { CodexQueryOptions, CodexHandle } from './types'
import { storeHandle, getHandle, clearHandle } from './handle-store'
import { createLogger } from '@/core/helpers/debug/logger'

const logger = createLogger('codex-service')

export type { CodexQueryOptions, CodexHandle }
export { storeHandle, getHandle, clearHandle }

async function query(opts: CodexQueryOptions): Promise<CodexHandle> {
  const { prompt, cwd, threadId, model, sandboxMode, approvalPolicy, additionalDirectories, reasoningEffort } = opts

  const codex = new Codex()
  const threadOptions = {
    ...(model && { model }),
    ...(sandboxMode && { sandboxMode }),
    ...(approvalPolicy && { approvalPolicy }),
    ...(additionalDirectories?.length && { additionalDirectories }),
    ...(cwd && { workingDirectory: cwd }),
    ...(reasoningEffort && { modelReasoningEffort: reasoningEffort }),
  }

  const thread = threadId
    ? codex.resumeThread(threadId, threadOptions)
    : codex.startThread(threadOptions)

  const abortController = new AbortController()
  const { events: rawEvents } = await thread.runStreamed(prompt, { signal: abortController.signal })

  let resolveThreadId: (id: string) => void
  let rejectThreadId: (err: unknown) => void
  const threadIdPromise = new Promise<string>((resolve, reject) => {
    resolveThreadId = resolve
    rejectThreadId = reject
  })

  async function* wrapEvents(): AsyncGenerator<ThreadEvent> {
    try {
      for await (const event of rawEvents) {
        if (event.type === 'thread.started') resolveThreadId(event.thread_id)
        yield event
      }
    } catch (err) {
      logger.error('Codex stream error', { error: err })
      rejectThreadId(err)
      throw err
    }
  }

  return { events: wrapEvents(), threadId: threadIdPromise, abort: () => abortController.abort() }
}

export const codexService = { query, storeHandle, getHandle, clearHandle }
