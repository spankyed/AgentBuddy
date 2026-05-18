/**
 * Type definitions for the Codex app-server integration.
 *
 * The app-server uses JSON-RPC 2.0 (jsonrpc field omitted on wire)
 * over JSONL on stdin/stdout. Three message types on the wire:
 * 1. Responses to our requests (id, result/error, no method)
 * 2. Server-initiated requests (id AND method) — approval requests
 * 3. Notifications (method, no id) — streaming events
 */

// ─── Service status ─────────────────────────────────────────────────────────

export type ServerStatus = 'stopped' | 'starting' | 'ready' | 'error'

// ─── Approval ───────────────────────────────────────────────────────────────

export type ApprovalDecision = 'accept' | 'acceptForSession' | 'decline' | 'cancel'

// ─── Thread/Turn params ─────────────────────────────────────────────────────

export interface ThreadStartParams {
  cwd?: string
  model?: string
  sandbox?: 'readOnly' | 'workspaceWrite' | 'dangerFullAccess'
  approvalsReviewer?: 'user' | 'auto_review'
}

export interface TurnStartParams {
  threadId: string
  input: Array<{ type: 'text'; text: string }>
  cwd?: string
  collaborationMode?: {
    name: string
    settings?: { developerInstructions?: string | null }
  }
  approvalsReviewer?: 'user' | 'auto_review'
  model?: string
}

// ─── Consumer handlers (per-thread notification routing) ────────────────────

export interface ConsumerHandlers {
  /** Called for streaming notifications (item/started, item/completed, item/agentMessage/delta, turn/completed, etc.) */
  onNotification(method: string, params: any): void
  /** Called for server-initiated approval requests. Response sent separately via respondToApproval. */
  onApproval(method: string, requestId: number, params: any): void
}

// ─── Turn handle (stored per app thread for pause/abort) ────────────────────

export interface CodexTurnHandle {
  /** Codex app-server thread ID */
  codexThreadId: string
  /** Active turn ID */
  turnId: string
  /** Interrupt the running turn */
  abort(): Promise<void>
}
