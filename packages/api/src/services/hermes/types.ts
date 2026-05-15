/**
 * Type definitions for the Hermes Agent bridge protocol.
 *
 * The bridge communicates over stdin/stdout using line-delimited JSON (JSONL).
 * Each request has an `id` for correlation; streaming responses share the same
 * `id` as the originating request.
 */

// ─── Bridge Protocol ────────────────────────────────────────────────────────

export interface BridgeRequest {
  id: string
  method: string
  params?: Record<string, unknown>
}

export interface BridgeResponse {
  id?: string
  type: 'result' | 'error' | 'ready' | 'token' | 'tool_call' | 'tool_start' | 'tool_complete' | 'reasoning' | 'stream_start' | 'stream_error' | 'done'
  data: Record<string, unknown>
}

// ─── Hermes Data Types ──────────────────────────────────────────────────────

export interface HermesSession {
  id: string
  model: string
  workspace: string
  message_count: number
  updated_at: number
  title: string
}

export interface HermesMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp?: number
  tool_calls?: HermesToolCall[]
}

export interface HermesToolCall {
  toolCallId: string
  name: string
  args: Record<string, unknown>
  result?: string
}

export interface HermesModel {
  name: string
  provider: string
  model: string
}

export interface HermesSkill {
  name: string
  category: string
  path: string
  content: string
}

export interface HermesTool {
  name: string
  enabled: boolean
  description: string
}

export type HermesMemoryFiles = Record<string, string>

// ─── Stream Events ──────────────────────────────────────────────────────────

export interface HermesTokenEvent {
  text: string
  streamId: string
}

export interface HermesToolStartEvent {
  toolCallId: string
  name: string
  args: Record<string, unknown>
  streamId: string
}

export interface HermesToolCompleteEvent {
  toolCallId: string
  name: string
  result: string | null
  streamId: string
}

export interface HermesStreamDoneEvent {
  streamId: string
  finalResponse: string
  completed: boolean
  sessionId: string
}

export interface HermesStreamErrorEvent {
  streamId: string
  message: string
}

// ─── Service Config ─────────────────────────────────────────────────────────

export interface HermesConfig {
  /** Path to hermes-agent directory (auto-discovered if not set). */
  agentDir?: string
  /** Python executable path (auto-discovered if not set). */
  pythonPath?: string
  /** HERMES_HOME directory (defaults to ~/.hermes). */
  hermesHome?: string
  /** Default model for new sessions. */
  defaultModel?: string
  /** Default workspace directory. */
  defaultWorkspace?: string
  /** Auto-start bridge on app launch. */
  autoStart?: boolean
}

// ─── Bridge Status ──────────────────────────────────────────────────────────

export type BridgeStatus = 'stopped' | 'starting' | 'ready' | 'error'

export interface BridgeInfo {
  status: BridgeStatus
  agentDir: string | null
  pid: number | null
  error?: string
}
