import { BaseEntity } from "@/core/ears";
import type { Simplify } from "@/core/shared/type-helpers";
import type { EARS } from "@/types";
import type { PermissionMode } from "@/services/claude-code/types";
import type { AgentSettings, CommandItem, KeyboardShortcut, ThreadsSettings, ThreadTagOption } from './settings';

// Block-based interaction system (composable architecture)
export type BlockType = 'prompt' | 'note' | 'markdown' | 'file-picker' | 'choice' | 'text' | 'approval' | 'actions' | 'link' | 'button-group' | 'tool-activity' | 'thinking' | 'question' | 'project-select' | 'toggles' | 'tool-input' | 'context-usage' | 'session-list';

export interface BlockConfig {
  type: BlockType;
  props: Record<string, any>;
}

// Tool-activity block — collapsible group of Claude Code tool calls within one turn.
// Replaces the prior per-tool `> 🔧 name` blockquote spam with a single compact
// group that shows a live status label while streaming and freezes to a summary
// line once the turn ends. See design doc in `.claude/plans/` for full rationale.
export interface ToolActivityEntry {
  /** Stable id. Usually the CLI's `tool_use_id`. */
  id: string;
  /** Tool name as reported by the CLI: Read, Write, Edit, Glob, Grep, Bash, … */
  tool: string;
  /** One-line human summary of the input (e.g. a truncated file path). */
  summary: string;
  /** Row status drives the per-row icon and label. */
  status: 'running' | 'ok' | 'denied' | 'error';
  /** Wall-clock duration once the tool has reported progress/completion. */
  durationMs?: number;
  /** One-line output summary if the tool reported one (e.g. "3 matches"). */
  outputSummary?: string;
  /** Optional full details revealed when the row is expanded. */
  details?: { input?: unknown; output?: string; error?: string };
}

export interface ToolActivityBlockProps {
  /** Tool entries in arrival order. Append-only during the turn. */
  entries: ToolActivityEntry[];
  /** Live status label shown when collapsed (e.g. "Reading 3 files…"). */
  label: string;
  /** Group state — drives spinner visibility and label tense. */
  state: 'streaming' | 'done' | 'error';
  /** Initial open/closed state. User toggles win after first interaction. */
  defaultOpen?: boolean;
  /** Optional pointer to a promoted artifact (Phase C). */
  artifactRef?: { artifactId: string; label: string };
}

// Thinking block — collapsible display of extended thinking content from Claude.
export interface ThinkingBlockProps {
  /** Accumulated thinking text. */
  content: string;
  /** Collapsed header label (e.g. "Thinking…" or "Thought for 3s"). */
  label: string;
  /** Block state — drives spinner visibility. */
  state: 'streaming' | 'done';
  /** Initial open/closed state. Collapsed by default. */
  defaultOpen?: boolean;
}

// Link block types
export interface LinkEvent {
  target: 'application' | 'external' | string; // 'application', 'external', or plugin name
  data: any;
}

export type LinkIcon =
  | 'external-link'
  | 'file-text'
  | 'message-square'
  | 'settings'
  | 'link';

export interface LinkConfig {
  label: string;
  event: LinkEvent;
  icon?: LinkIcon; // Optional lucide icon name
}

// Button-group block types
export interface ButtonConfig {
  id: string;
  label: string;
  state: string;
  // Option 1: Manual states (backend controlled via UPDATE_MESSAGE_STATE)
  states?: Record<string, {
    label: string;
    variant?: 'primary' | 'secondary' | 'success' | 'danger';
    disabled?: boolean;
  }>;
  // Option 2: Auto-toggling between on/off (frontend controlled, optimistic UI)
  toggleStates?: {
    on: {
      label: string;
      variant?: 'primary' | 'secondary' | 'success' | 'danger';
      disabled?: boolean;
    };
    off: {
      label: string;
      variant?: 'primary' | 'secondary' | 'success' | 'danger';
      disabled?: boolean;
    };
  };
}

export interface ButtonGroupResponse {
  buttonId: string;
  state: string;
}

export interface FileReference {
  name: string;
  path: string;
  typeLabel: string;
  isImage: boolean;
  previewUrl?: string;
}

export interface ImageReference {
  url: string;
  name: string;
}

export type ContextReferenceType = 'thread' | 'document' | 'note' | 'task' | 'tasklist' | 'folder';

export interface ContextReference {
  refType: ContextReferenceType;
  refId: string;
  shortCode: string;
  label: string;
}

export interface MessageReferences {
  images?: ImageReference[];
  files?: FileReference[];
  context?: ContextReference[];
}

/**
 * Shapes a block can emit back to the backend when the user interacts
 * with it. Non-discriminated on purpose — text and choice blocks emit
 * raw primitives on submit (TextInput.vue:207, ChoiceInput.vue:225),
 * while approval and cancel blocks emit tagged objects
 * (InteractionContainer.vue:156-167). Wrapping the primitives into
 * `{ type: 'text', value: string }` etc. would be a wire-shape break,
 * so we encode the reality instead: a union of every observed shape
 * with no synthetic discriminator.
 *
 * Consumers MUST narrow before using the value. The canonical parse
 * helpers are the authoritative places to do that:
 *
 *   - `parseApprovalDecision` at
 *       packages/default-setup/src/actions/claude-code/_helpers/approval-response.ts
 *     — narrows to `{ allow, reason? }` for approval blocks
 *
 *   - `parseStepResponse` at
 *       packages/default-setup/src/actions/onboarding/_helpers/parse-step-response.ts
 *     — narrows per onboarding step with a `cancelled` flag
 *
 * When adding a new block type, extend this union first, then add a
 * matching parser in `_helpers/` and a unit test that pins the new
 * shape (see claude-code-approval-response.spec.ts and
 * onboarding-step-response.spec.ts for the pattern).
 *
 * Legacy data: messages persisted before this type was introduced may
 * carry the stale `{ value: 'yes' }` shape, but no frontend has ever
 * emitted it — the `?? response` fallback in the old handler was dead
 * code. Still, `blockResponse?: unknown` at the storage boundary is
 * more defensive than assuming the union is exhaustive; however the
 * EVENT-level and FIELD-level types use the union because every
 * non-legacy emit matches one of its arms.
 */
export type BlockResponse =
  /** Approval buttons: InteractionContainer `handleApprove`/`handleDeny`. */
  | { approved: boolean; reason?: string }
  /** Cancel path: InteractionContainer `handleCancel`. */
  | { cancelled: true }
  /** Text input (single or multiline) and single-select choice emit a raw string. */
  | string
  /** Multi-select choice emits a raw string array (of choice ids). */
  | string[];

export interface MessageEntity extends BaseEntity {
  entityType: EARS.Entity.Message;
  text: string;
  sender: 'user' | 'assistant' | 'system' | 'marker';
  timestamp: number;
  // Block-based interaction system
  responseTimestamp?: number; // Timestamp when the message was responded to
  blocks?: BlockConfig[];
  /**
   * Response data for block-based interactions. See the `BlockResponse`
   * union above for the full set of observed shapes. Always narrow
   * before use via a parse helper — the raw field is stored as the
   * exact value the frontend emitted, which may be a primitive
   * (string / string[]) or a tagged object.
   */
  blockResponse?: BlockResponse;
  forkable?: boolean;
  references?: MessageReferences;
  isCommand?: boolean;
  command?: string;
  /** Ephemeral UI state (e.g. 'queued' while waiting behind an active turn). */
  status?: 'queued' | 'cancelled' | null;
  /** Free-form per-message metadata. Feature-namespaced (e.g. `{ cliUuid: '...' }`). */
  context?: Record<string, unknown>;
  /** When true, collapse to a compact aside after the user responds. */
  autoHide?: boolean;
  /** When true, the collapsed aside aligns to the user (right) side. */
  asUser?: boolean;
  /** Backend-computed summary text shown when collapsed (e.g. "✓ Approved"). */
  asideText?: string;
  /** Caller-supplied context label for the collapsed aside (overrides auto-derived context). */
  asideContext?: string;
  /** When true, message is hidden because a marker message compacted it. */
  compacted?: boolean;
}

/**
 * Free-form per-thread scratchpad for features that need to persist small
 * amounts of state alongside a thread. Keys are namespaced by feature name
 * (e.g. `claudeCode`) so multiple features don't collide. Anything goes
 * under a feature key — this is intentionally untyped at the container
 * level so new contributors don't need to edit this file.
 */
export interface ThreadContext {
  claudeCode?: {
    sessionId?: string;
    lastTurnAt?: number;
    cwd?: string;
    // Persistent session data (single source of truth — artifact is derived)
    model?: string;
    startedAt?: number;
    turns?: number;
    totalCostUsd?: number;
    chatState?: string;
    toolCallCount?: number;
    permissionMode?: string;
    useWorktree?: boolean;
    sessionError?: string;
    [key: string]: unknown;
  };
  [featureKey: string]: unknown;
}

export interface ThreadEntity extends BaseEntity {
  entityType: EARS.Entity.Thread;
  topic: string;
  instructions: string;
  sideTopics?: string[];
  timestamp: number;
  lastMessageTimestamp?: number;
  lastVisitedTimestamp?: number;
  shortCode?: string;
  status: string; // Dynamic statuses from settings
  tags?: string[]; // Tag names from settings
  forcedMode?: string; // Forced mode name for this thread
  pinned?: boolean; // Thread tab should stay pinned in the UI
  archived?: boolean; // Thread is archived and hidden from lists
  chatState?: string; // Chat state indicator (idle, working, paused, error, success)
  context?: ThreadContext; // Free-form per-feature state (e.g. claudeCode.sessionId)
}

export interface ArtifactEntity extends BaseEntity {
  entityType: EARS.Entity.Artifact;
  title?: string;
  // biome-ignore lint/suspicious/noExplicitAny: Content can be various types
  content: string | any;
  artifactType: ArtifactType;
}

export const ThreadRelations = ['parent_of', 'blocks', 'blocked_by', 'duplicates'] as const;
export type ThreadLinkRelation = typeof ThreadRelations[number];

export type ThreadLinkItem = Pick<ThreadEntity, 'id' | 'shortCode' | 'status' | 'timestamp' | 'topic'> & {
  relation: ThreadLinkRelation
};

export type ThreadEditFields = Simplify<
  Pick<ThreadEntity, 'topic' | 'instructions'>
  & { status?: ThreadEntity['status'] }
  & { tags?: string[] }  // Just tag names
  & { context?: ThreadContext }  // Free-form per-feature state (see ThreadContext)
  & ThreadLinkedFields
>;
export type ThreadLinkedFields = {
  linkedThreads?: ThreadLinkItem[];
}

export type ThreadCreateData = Simplify<
  ThreadEditFields
  & {
    role?: EARS.RoleKind;  // Optional role to grant (e.g., for special threads like birth)
    forcedMode?: string;  // Optional forced mode name for special threads
    pinned?: boolean;  // Pin the thread tab in the UI
  }
>;
export type ThreadViewData = Simplify<
  ThreadCreateData
  & {
    id: ThreadEntity['id'];
    shortCode: ThreadEntity['shortCode'];
    status: ThreadEntity['status'];
    timestamp: ThreadEntity['timestamp'];
    archived?: ThreadEntity['archived'];
    lastMessageTimestamp?: ThreadEntity['lastMessageTimestamp'];
    messages?: ThreadExtendedData['messages'];
  }
>;

export type ThreadExtended = Simplify<ThreadEntity & ThreadExtendedData & { parentId?: string }>;
export type ThreadExtendedData = ThreadLinkedFields & {
  messages?: Partial<MessageEntity>[];
  tags?: string[];  // Tag names from thread entity
  // Core fields included so SET_VIEW_DATA can populate the view even when
  // the thread isn't in the frontend's context.threads list.
  topic?: string;
  instructions?: string;
  status?: string;
  pinned?: boolean;
  archived?: boolean;
  shortCode?: string;
  timestamp?: number;
  lastMessageTimestamp?: number;
}

export type ThreadTypeShortCode = `T-${number}`;

export type ThreadConnectedData = {
  threads: ThreadExtended[];
  availableTags: ThreadTagOption[];  // Tags from settings
  settings?: ThreadsSettings | null; // Full thread settings
  chatStates?: Record<string, string>;
}

// ---- Chat/Agent types (merged from agent system) ----

export type AgentThreadData = {
  id?: ThreadEntity['id'];
  shortCode?: ThreadEntity['shortCode'];
  topic: ThreadEntity['topic'];
  instructions: ThreadEntity['instructions'];
  status: ThreadEntity['status'];
  timestamp: ThreadEntity['timestamp'];
  messages: ThreadExtendedData['messages'];
  artifacts: ArtifactEntity[];
  forcedMode?: ThreadEntity['forcedMode'];
  pinned?: boolean;
  chatState?: string;
  context?: ThreadContext;
}

export type RecentThreadRefreshData = {
  recentThreads: Partial<ThreadEntity>[];
};

export type AgentConnectedData = {
  currentThread: AgentThreadData | null;
  threads: Partial<ThreadEntity>[];
  recentThreads: Partial<ThreadEntity>[];
  tabs: Tab[];
  settings?: AgentSettings;
  hasRequiredApiKeys: boolean;
  commands?: CommandItem[];
};


export interface Tab {
  id: string;
  label: string;
  artifacts: ArtifactItem[];
  selectedArtifactId?: string;
  pinned?: boolean;
  groupId?: string;
}

export type ArtifactType =
  | 'text'
  | 'code'
  | 'review'
  | 'image'
  | 'slack'
  | 'todo'
  | 'project'
  | 'json'
  | 'graph'
  | 'table'
  | 'markdown'
  // Claude Code artifacts (see packages/default-setup/src/actions/claude-code/ROADMAP.md)
  | 'claude-session'
  | 'codex-session'
  | 'diff'
  | 'plan'
  | 'note';

// ─── Claude Code artifact content shapes ─────────────────────────────────────
// Documentation types — `ArtifactEntity.content` is `any` at the storage
// layer, these shapes just describe the expected payload for each artifact
// so renderers can be written against a known structure.

export interface ClaudeSessionArtifactContent {
  /** Claude CLI session id (empty string until the first system/init event). */
  sessionId: string;
  /** Model name reported by the CLI ("claude-sonnet-4-6" etc.). */
  model: string;
  /** Working directory the CLI is running in. */
  cwd: string;
  /** Epoch ms when the session artifact was created. */
  startedAt: number;
  /** Epoch ms of the most recent turn. */
  lastTurnAt: number;
  /** Number of turns executed in this session. */
  turns: number;
  /** Running cost total in USD across all turns. */
  totalCostUsd: number;
  /** High-level chat state. Drives the status indicator and pause button. */
  chatState: 'idle' | 'working' | 'paused';
  /** Total tool calls across all turns in this session. */
  toolCallCount: number;
  /** The most recent tool the agent used (for the sidebar summary line). */
  lastTool?: { name: string; summary: string; at: number };
  /** Last 3 tools executed (rolling window, most recent last). */
  recentTools?: Array<{ name: string; summary: string; at: number }>;
  /**
   * Permission policy for the next turn. Mutated by the user via the
   * session artifact's segmented control in the right panel and read by
   * `chat.ts` at action entry. The three useful values are:
   *   - `'default'` — CLI emits `can_use_tool` per Edit/Write/Bash (Ask mode)
   *   - `'acceptEdits'` — CLI auto-approves Edit/Write (Auto mode); Bash still prompts
   *   - `'plan'` — read-only; CLI produces a plan, makes no file changes
   * Other `PermissionMode` variants are allowed by the type but not
   * surfaced in the UI. Optional for backwards compat with artifacts
   * persisted before this field existed; readers coalesce to `'default'`.
   */
  permissionMode?: PermissionMode;
  /** Threshold percentages that have already fired an alert (avoids re-alerting). */
  alertedThresholds?: number[];
  /** Full context usage breakdown from CLI `/context` query (populated after each turn). */
  contextUsage?: {
    model: string;
    totalTokens: number;
    maxTokens: number;
    percentage: number;
    categories: Array<{ name: string; tokens: number; percentage: number }>;
    memoryFiles?: Array<{ type: string; path: string; tokens: number }>;
    skills?: Array<{ name: string; source: string; tokens: number }>;
  };
}

export interface DiffArtifactContent {
  files: Array<{
    path: string;
    /** Unified diff text for this file. */
    patch: string;
    added: number;
    removed: number;
    changeType: 'added' | 'modified' | 'deleted' | 'renamed';
  }>;
  /** Aggregate summary e.g. "12 files, +420 -87". */
  summary: string;
}

export interface PlanArtifactContent {
  /** Raw markdown notes body. Phase D-min uses this as the only content field. */
  notes: string;
  /** Overall plan status. Approve/Reject buttons mutate this. */
  status: 'draft' | 'approved' | 'in-progress' | 'completed' | 'rejected';
  /** Structured steps. Phase D-min leaves this empty; full Phase D will parse from notes. */
  steps: Array<{
    id: string;
    title: string;
    description?: string;
    status: 'pending' | 'in-progress' | 'done' | 'skipped';
  }>;
}

export interface ArtifactItem {
  id: string;
  type: ArtifactType;
  title: string;
  content: any;
  /** Optional Tailwind color token (e.g. 'blue', 'purple') for the pill background. */
  color?: string;
  metadata?: {
    createdAt: number;
    updatedAt?: number;
    [key: string]: any;
  };
}
