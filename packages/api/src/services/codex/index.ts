/**
 * Codex service — public entry point.
 *
 * Wraps the CodexAppServer (persistent `codex app-server` subprocess) and
 * exposes thread/turn lifecycle, approval responses, consumer registration,
 * and handle management to compiled actions via `services.codex`.
 */

import { CodexAppServer } from './app-server'
import { storeHandle, getHandle, clearHandle } from './handle-store'
import * as codexSessions from './sessions'
import type {
  ServerStatus,
  ThreadStartParams,
  ThreadReadParams,
  ThreadForkParams,
  ThreadRollbackParams,
  TurnStartParams,
  ApprovalDecision,
  ConsumerHandlers,
  CodexTurnHandle,
} from './types'

export type { ServerStatus, ThreadStartParams, ThreadReadParams, ThreadForkParams, ThreadRollbackParams, TurnStartParams, ApprovalDecision, ConsumerHandlers, CodexTurnHandle }
export { storeHandle, getHandle, clearHandle }

const server = new CodexAppServer()

export const codexService = {
  // Lifecycle
  start: () => server.start(),
  stop: () => server.stop(),
  restart: () => server.restart(),
  get status(): ServerStatus { return server.status },

  // Thread management
  startThread: (params: ThreadStartParams) => server.startThread(params),
  resumeThread: (threadId: string, params?: Partial<ThreadStartParams>) => server.resumeThread(threadId, params),
  readThread: (threadId: string, params?: ThreadReadParams) => server.readThread(threadId, params),
  forkThread: (params: ThreadForkParams) => server.forkThread(params),
  rollbackThread: (params: ThreadRollbackParams) => server.rollbackThread(params),
  compactThread: (threadId: string) => server.compactThread(threadId),

  // Turn management
  startTurn: (params: TurnStartParams) => server.startTurn(params),
  interruptTurn: (threadId: string, turnId: string) => server.interruptTurn(threadId, turnId),

  // Approval response
  respondToApproval: (requestId: number, decision: ApprovalDecision) => server.respondToApproval(requestId, decision),

  // Consumer registration
  registerConsumer: (codexThreadId: string, handlers: ConsumerHandlers) => server.registerConsumer(codexThreadId, handlers),
  unregisterConsumer: (codexThreadId: string) => server.unregisterConsumer(codexThreadId),

  // Handle store
  storeHandle,
  getHandle,
  clearHandle,

  // Session listing (reads ~/.codex/sessions/ JSONL files)
  listAllSessions: codexSessions.listAll,
  viewSessionByFile: codexSessions.viewByFile,
}
