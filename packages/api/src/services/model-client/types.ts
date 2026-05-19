/**
 * Type definitions for the model-client service.
 *
 * Maps OpenAI Responses API concepts to a typed service interface,
 * built on top of the Vercel AI SDK.
 */

import type { CoreMessage, FinishReason, LanguageModelUsage, ToolSet } from 'ai'

// ─── Configuration ───────────────────────────────────────────────────────────

/** Model + provider configuration for API calls. */
export interface ModelClientConfig {
  /** Provider name (e.g. 'openai'). */
  provider: string
  /** Model ID (e.g. 'gpt-4o', 'o3'). */
  model: string
  /** Explicit API key (overrides settings/env). */
  apiKey?: string
  /** Custom base URL for the API. */
  baseURL?: string
}

/** Configuration for a conversation (persists across turns). */
export interface ConversationConfig extends ModelClientConfig {
  /** System instructions for the model. */
  instructions?: string
  /** Reasoning configuration for reasoning models. */
  reasoning?: ReasoningConfig
  /** Tools available to the model across all turns. */
  tools?: ToolSet
  /** Whether to store the conversation for analytics. */
  store?: boolean
  /** Arbitrary metadata attached to requests. */
  metadata?: Record<string, string>
  /** Maximum agentic tool-use steps per turn. */
  maxSteps?: number
}

/** Reasoning configuration for reasoning models (o3, etc). */
export interface ReasoningConfig {
  effort: 'low' | 'medium' | 'high'
  summary?: 'auto' | 'concise' | 'detailed'
}

// ─── Turn execution ──────────────────────────────────────────────────────────

/** Parameters for a single turn. */
export interface TurnParams {
  /** User input — string prompt or structured messages. */
  input: string | CoreMessage[]
  /** Per-turn tool overrides (merged with conversation tools). */
  tools?: ToolSet
  /** Per-turn instruction overrides. */
  instructions?: string
  /** Per-turn reasoning overrides. */
  reasoning?: ReasoningConfig
  /** Max agentic steps for this turn (overrides conversation config). */
  maxSteps?: number
  /** AbortSignal for cancellation. */
  signal?: AbortSignal
}

/** Result of a completed turn. */
export interface TurnResult {
  /** The response ID from the Responses API. */
  responseId: string | undefined
  /** Final generated text. */
  text: string
  /** Reasoning text (if reasoning model). */
  reasoning: string | undefined
  /** Tool calls made during the turn. */
  toolCalls: unknown[]
  /** Tool results returned during the turn. */
  toolResults: unknown[]
  /** Token usage for this turn. */
  usage: LanguageModelUsage
  /** Number of agentic steps taken. */
  steps: number
  /** Why the turn finished. */
  finishReason: FinishReason
}

// ─── Streaming events ────────────────────────────────────────────────────────

export type StreamEvent =
  | { type: 'text-delta'; textDelta: string }
  | { type: 'reasoning'; textDelta: string }
  | { type: 'tool-call-start'; toolCallId: string; toolName: string }
  | { type: 'tool-call-delta'; toolCallId: string; toolName: string; argsTextDelta: string }
  | { type: 'tool-call'; toolCallId: string; toolName: string; args: unknown }
  | { type: 'tool-result'; toolCallId: string; toolName: string; result: unknown }
  | { type: 'step-complete'; usage: LanguageModelUsage; finishReason: FinishReason; isContinued: boolean }
  | { type: 'turn-complete'; usage: LanguageModelUsage; finishReason: FinishReason; responseId: string | undefined }
  | { type: 'error'; error: unknown }

// ─── Conversation state ──────────────────────────────────────────────────────

export interface ConversationState {
  /** Previous response ID for threading. */
  previousResponseId: string | null
  /** Number of turns completed. */
  turnCount: number
  /** Cumulative token usage across all turns. */
  cumulativeUsage: LanguageModelUsage
}

// ─── Compaction ──────────────────────────────────────────────────────────────

export interface CompactParams {
  /** The response ID to compact up to. */
  previousResponseId: string
  /** Model to use for compaction (defaults to conversation model). */
  model?: string
}

export interface CompactResult {
  /** New response ID after compaction. */
  newResponseId: string
  /** Summary text (if returned). */
  summary?: string
}

// ─── Tool types ──────────────────────────────────────────────────────────────

/**
 * Approval callback for tools that modify state.
 * Returns 'approved' to proceed or 'denied' to skip execution.
 */
export type ApproveFn = (description: string, detail?: string) => Promise<'approved' | 'denied'>

/** Callback to request freeform or multiple-choice input from the user mid-turn. */
export type RequestInputFn = (questions: UserInputQuestion[]) => Promise<Record<string, string>>

export interface UserInputQuestion {
  id: string
  header: string
  question: string
  options?: Array<{ label: string; description: string }>
}

export interface PlanStep {
  step: string
  status: 'pending' | 'in_progress' | 'completed'
}

export interface GoalState {
  objective: string
  status: 'active' | 'paused' | 'complete'
  tokenBudget?: number
  tokensUsed?: number
}

/** Common options for tool factory functions. */
export interface ToolOptions {
  /** Working directory — all paths resolved relative to this. */
  cwd: string
  /** Optional approval callback for user confirmation before execution. */
  approve?: ApproveFn
  /** Called when the model updates its plan. */
  onPlanUpdate?: (plan: PlanStep[], explanation?: string) => void
  /** Called when the model creates or updates a goal. */
  onGoalUpdate?: (goal: GoalState) => void
  /** Returns the current goal state (for get_goal). */
  getGoal?: () => GoalState | null
  /** Callback to request user input mid-turn. */
  requestInput?: RequestInputFn
}
