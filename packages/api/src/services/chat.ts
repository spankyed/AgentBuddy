import { EARS } from '@/core/types';
import { repository } from '@/repository';
import type { BlockConfig, BlockResponse, LinkConfig, MessageEntity, ButtonConfig, ThreadCreateData, MessageReferences } from '@/systems/threads/types';
import { sendToPlugin } from './event-emitter';
import * as media from './media';
import { libraryService } from './library';
import * as symlink from '@/systems/library/repository/symlink';
import * as threadsService from './threads';

/**
 * Block-based interaction helpers for creating composable messages
 *
 * These helpers make it easy to create messages using reusable blocks that can be
 * mixed and matched to create complex interactions.
 */

interface BlockMessageBase {
  threadId: EARS.EntityId;
  text: string;
  blocks: BlockConfig[];
  forkable?: boolean;
}

export type AutoHideOptions =
  | { autoHide: true; asUser: boolean; asideContext?: string }
  | { autoHide?: false; asUser?: undefined; asideContext?: undefined };

type BlockMessageOptions = BlockMessageBase & AutoHideOptions;

/**
 * Create a message with custom blocks (pure function)
 * Returns message data without side effects
 */
export function createBlockMessage(options: BlockMessageOptions): {
  messageId: EARS.EntityId;
  threadId: EARS.EntityId;
  message: MessageEntity;
} {
  const { threadId, text, blocks, forkable, autoHide, asUser, asideContext } = options;

  const result = repository.chatCommands.addMessage({
    threadId,
    text,
    sender: 'assistant',
    blocks,
    forkable,
    autoHide,
    asUser,
    asideContext,
  });

  // Construct message entity for return
  const message: MessageEntity = {
    id: result.id,
    entityType: EARS.Entity.Message,
    text: result.text,
    sender: result.sender as 'user' | 'assistant' | 'system',
    timestamp: result.timestamp,
    blocks,
    createdAt: result.timestamp,
    updatedAt: result.timestamp,
    ...(forkable === false && { forkable }),
    ...(autoHide && { autoHide }),
    ...(asUser != null && { asUser }),
    ...(asideContext && { asideContext }),
  };

  return { messageId: result.id, threadId, message };
}

/**
 * Send a message with custom blocks and emit MESSAGE_ADDED event
 * Use this for flow actions that need automatic frontend updates
 */
export function sendBlockMessage(options: BlockMessageOptions): { messageId: EARS.EntityId } {
  const result = createBlockMessage(options);

  // Emit granular event - only new message data (not entire thread)
  sendToPlugin('threads', {
    type: 'MESSAGE_ADDED',
    threadId: result.threadId,
    message: result.message
  });

  return { messageId: result.messageId };
}

/**
 * Send a system message (non-interactive aside) and emit MESSAGE_ADDED event
 */
export function sendSystemMessage(options: {
  threadId: EARS.EntityId;
  text: string;
}): { messageId: EARS.EntityId } {
  const { threadId, text } = options;

  const result = repository.chatCommands.addMessage({
    threadId,
    text,
    sender: 'system',
  });

  const message: MessageEntity = {
    id: result.id,
    entityType: EARS.Entity.Message,
    text: result.text,
    sender: 'system',
    timestamp: result.timestamp,
    createdAt: result.timestamp,
    updatedAt: result.timestamp,
  };

  sendToPlugin('threads', {
    type: 'MESSAGE_ADDED',
    threadId,
    message,
  });

  return { messageId: result.id };
}

/**
 * Create a file picker interaction using blocks
 */
export function sendFilePickerBlock(options: {
  threadId: EARS.EntityId;
  text: string;
  prompt: string;
  fileType?: 'file' | 'directory' | 'both';
  allowMultiple?: boolean;
  displayText?: string;
  forkable?: boolean;
} & AutoHideOptions): { messageId: EARS.EntityId } {
  const { threadId, text, prompt, fileType = 'both', allowMultiple = false, displayText, forkable, autoHide, asUser, asideContext } = options;

  const blocks: BlockConfig[] = [
    {
      type: 'prompt',
      props: { content: prompt }
    },
    {
      type: 'file-picker',
      props: { fileType, allowMultiple, displayText }
    }
  ];

  return sendBlockMessage({ threadId, text, blocks, forkable, autoHide, asUser, asideContext } as BlockMessageOptions);
}

/**
 * Create a choice interaction using blocks
 */
export function sendChoiceBlock(options: {
  threadId: EARS.EntityId;
  text: string;
  prompt: string;
  choices: Array<{ id: string; label: string; description?: string }>;
  multiSelect?: boolean;
  allowCustom?: boolean;
  compact?: boolean;
  displayText?: string;
  skipOption?: { id: string; label: string };
  forkable?: boolean;
} & AutoHideOptions): { messageId: EARS.EntityId } {
  const { threadId, text, prompt, choices, multiSelect = false, allowCustom = false, compact, displayText, skipOption, forkable, autoHide, asUser, asideContext } = options;

  const blocks: BlockConfig[] = [
    {
      type: 'prompt',
      props: { content: prompt }
    },
    {
      type: 'choice',
      props: { choices, multiSelect, allowCustom, compact, displayText, skipOption }
    }
  ];

  return sendBlockMessage({ threadId, text, blocks, forkable, autoHide, asUser, asideContext } as BlockMessageOptions);
}

/**
 * Create a question interaction — single question or multi-question wizard.
 * Single question = array with one item. Multi = step wizard in the frontend.
 * Response shape: string (single) or Record<string, string> (multi).
 */
export function sendQuestionBlock(options: {
  threadId: EARS.EntityId;
  text: string;
  prompt: string;
  questions: Array<{
    question: string;
    header?: string;
    options: Array<{ id: string; label: string; description?: string }>;
    multiSelect?: boolean;
    allowCustom?: boolean;
  }>;
  forkable?: boolean;
} & AutoHideOptions): { messageId: EARS.EntityId } {
  const { threadId, text, questions, forkable, autoHide, asUser, asideContext } = options;

  const blocks: BlockConfig[] = [
    {
      type: 'question',
      props: { questions }
    }
  ];

  return sendBlockMessage({ threadId, text, blocks, forkable, autoHide, asUser, asideContext } as BlockMessageOptions);
}

/**
 * Create an approval interaction using blocks
 */
export function sendApprovalBlock(options: {
  threadId: EARS.EntityId;
  text: string;
  prompt: string;
  context?: string;
  requireReason?: boolean;
  allowReason?: boolean;
  forkable?: boolean;
} & AutoHideOptions): { messageId: EARS.EntityId } {
  const { threadId, text, prompt, context, requireReason = false, allowReason = true, forkable, autoHide, asUser, asideContext } = options;

  const blocks: BlockConfig[] = [
    {
      type: 'prompt',
      props: { content: prompt }
    }
  ];

  if (context) {
    blocks.push({
      type: 'note',
      props: { content: context, variant: 'info', label: 'Context' }
    });
  }

  blocks.push({
    type: 'approval',
    props: { requireReason, allowReason }
  });

  return sendBlockMessage({ threadId, text, blocks, forkable, autoHide, asUser, asideContext } as BlockMessageOptions);
}

/**
 * Create a text input interaction using blocks
 */
export function sendTextInputBlock(options: {
  threadId: EARS.EntityId;
  text: string;
  prompt: string;
  placeholder?: string;
  multiline?: boolean;
  required?: boolean;
  displayText?: string;
  suggestions?: string[];
  forkable?: boolean;
} & AutoHideOptions): { messageId: EARS.EntityId } {
  const { threadId, text, prompt, placeholder, multiline = false, required = false, displayText, suggestions, forkable, autoHide, asUser, asideContext } = options;

  const blocks: BlockConfig[] = [
    {
      type: 'prompt',
      props: { content: prompt }
    },
    {
      type: 'text',
      props: { placeholder, multiline, required, displayText, suggestions }
    }
  ];

  return sendBlockMessage({ threadId, text, blocks, forkable, autoHide, asUser, asideContext } as BlockMessageOptions);
}

/**
 * Create a link block with navigation actions
 */
export function sendLinkBlock(options: {
  threadId: EARS.EntityId;
  text: string;
  prompt?: string;
  links: LinkConfig[];
  forkable?: boolean;
}): { messageId: EARS.EntityId } {
  const { threadId, text, prompt, links, forkable } = options;

  const blocks: BlockConfig[] = [];

  if (prompt) {
    blocks.push({
      type: 'prompt',
      props: { content: prompt }
    });
  }

  blocks.push({
    type: 'link',
    props: { links }
  });

  return sendBlockMessage({ threadId, text, blocks, forkable });
}

/**
 * Create a button-group interaction using blocks
 *
 * Button groups support two modes (both backend-controlled):
 * 1. toggleStates - Auto-cycling on/off buttons (backend automatically flips state)
 * 2. states - Manual state transitions (flow/brain determines new state with custom logic)
 *
 * Both follow the same data flow: Frontend → Backend → Database → UPDATE_MESSAGE_STATE → Frontend
 *
 * @example
 * // Auto-toggling buttons (backend auto-cycles)
 * sendButtonGroupBlock({
 *   threadId,
 *   text: 'Quick toggles:',
 *   prompt: 'Configure settings',
 *   buttons: [{
 *     id: 'dark-mode',
 *     label: 'Dark Mode',
 *     state: 'off',
 *     toggleStates: {
 *       off: { label: 'Enable Dark Mode', variant: 'secondary' },
 *       on: { label: 'Disable Dark Mode', variant: 'success' }
 *     }
 *   }],
 *   keepInteractive: true
 * });
 * // Flow: User clicks → INTERACTIVE_MSG_RESPONSE → Backend auto-cycles on↔off
 * //       → Persists to DB → UPDATE_MESSAGE_STATE → Frontend updates
 *
 * @example
 * // Manual state buttons (flow/brain controlled)
 * const { messageId } = sendButtonGroupBlock({
 *   threadId,
 *   text: 'Advanced control:',
 *   buttons: [{
 *     id: 'build',
 *     label: 'Build',
 *     state: 'idle',
 *     states: {
 *       idle: { label: 'Start Build', variant: 'primary' },
 *       building: { label: 'Building...', variant: 'secondary', disabled: true },
 *       success: { label: 'Build Complete', variant: 'success' },
 *       error: { label: 'Build Failed', variant: 'danger' }
 *     }
 *   }]
 * });
 * // Flow: User clicks → INTERACTIVE_MSG_RESPONSE → Forwarded to brain/flow
 * //       → Flow determines new state → Calls updateMessageState with new blocks
 * //       → Backend sends UPDATE_MESSAGE_STATE → Frontend updates
 *
 * @example
 * // Mixed button group (both types)
 * sendButtonGroupBlock({
 *   threadId,
 *   text: 'Control panel:',
 *   buttons: [
 *     // Auto-toggle (backend handles)
 *     { id: 'debug', state: 'off', toggleStates: { ... } },
 *     // Manual control (flow handles)
 *     { id: 'deploy', state: 'idle', states: { idle: ..., deploying: ..., deployed: ... } }
 *   ],
 *   keepInteractive: true
 * });
 */
export function sendButtonGroupBlock(options: {
  threadId: EARS.EntityId;
  text: string;
  prompt?: string;
  buttons: ButtonConfig[];
  keepInteractive?: boolean;
  displayText?: string;
  forkable?: boolean;
} & AutoHideOptions): { messageId: EARS.EntityId } {
  const { threadId, text, prompt, buttons, keepInteractive = false, displayText, forkable, autoHide, asUser, asideContext } = options;

  const blocks: BlockConfig[] = [];

  if (prompt) {
    blocks.push({
      type: 'prompt',
      props: { content: prompt }
    });
  }

  blocks.push({
    type: 'button-group',
    props: { buttons, keepInteractive, displayText }
  });

  return sendBlockMessage({ threadId, text, blocks, forkable, autoHide, asUser, asideContext } as BlockMessageOptions);
}

/**
 * Update a message with block interaction response data
 */
export function updateMessageBlockResponse(
  messageId: EARS.EntityId,
  response: any
): void {
  repository.chatCommands.updateMessageBlockResponse({
    messageId,
    response
  });
}

/**
 * Update message state with any mutable fields
 * Main interface for ad hoc message state updates (text, blocks, blockResponse, responseTimestamp)
 * Automatically emits UPDATE_MESSAGE_STATE event to frontend
 *
 * @example
 * // Re-enable interactive blocks by clearing response
 * updateMessageState(messageId, {
 *   responseTimestamp: undefined,
 *   blockResponse: undefined
 * });
 *
 * @example
 * // Update message text
 * updateMessageState(messageId, {
 *   text: 'Updated message content'
 * });
 */
export function updateMessageState(
  messageId: EARS.EntityId,
  updates: Partial<Pick<MessageEntity, 'text' | 'blocks' | 'blockResponse' | 'responseTimestamp' | 'status' | 'context' | 'forkable' | 'compacted'>>
): void {
  let result;
  try {
    result = repository.chatCommands.updateMessageState({
      messageId,
      updates
    });
  } catch (err) {
    console.error(`[chat] updateMessageState failed for ${messageId}:`, (err as Error)?.message);
    return;
  }

  // Emit UPDATE_MESSAGE_STATE event to frontend with all updated fields
  sendToPlugin('threads', {
    type: 'UPDATE_MESSAGE_STATE',
    messageId: result.messageId,
    ...result.updates
  });
}

/**
 * Create a marker message that compacts eligible prior messages in a thread.
 * The repository determines which messages are eligible (excludes markers and already-compacted).
 */
export function createMarkerMessage(params: {
  threadId: EARS.EntityId;
  text: string;
}): { messageId: EARS.EntityId; compactedMessageIds: EARS.EntityId[] } {
  const result = repository.chatCommands.createMarkerMessage(params);

  // Notify frontend: add the marker message
  sendToPlugin('threads', {
    type: 'MESSAGE_ADDED',
    threadId: params.threadId,
    message: {
      id: result.id,
      text: result.text,
      sender: result.sender,
      timestamp: result.timestamp,
    } as MessageEntity,
  });

  // Notify frontend: mark each compacted message
  for (const id of result.compactedMessageIds) {
    sendToPlugin('threads', {
      type: 'UPDATE_MESSAGE_STATE',
      messageId: id,
      compacted: true,
    });
  }

  return { messageId: result.id, compactedMessageIds: result.compactedMessageIds };
}

/**
 * Add multiple messages to a thread without emitting per-message frontend events.
 * Caller is responsible for refreshing the frontend afterwards (e.g. via LOAD_CHAT_THREAD).
 */
export function addMessagesToThread(params: {
  threadId: EARS.EntityId;
  messages: Array<{
    text: string;
    sender: 'user' | 'assistant' | 'system' | 'marker';
    forkable?: boolean;
    context?: Record<string, unknown>;
  }>;
}): void {
  for (const msg of params.messages) {
    repository.chatCommands.addMessage({
      threadId: params.threadId,
      ...msg,
      skipRelink: true,
    });
  }
}

/**
 * Create a new thread and notify the frontend
 * Use this in flow actions that need automatic frontend updates
 *
 * @param options - Thread creation options
 * @returns Object with thread id, shortCode, timestamp, and status
 *
 * @example
 * const { id: threadId, shortCode, timestamp, status } = createThreadAndNotify({
 *   topic: 'Assistant Birth',
 *   instructions: 'Welcome!',
 *   role: EARS.RoleKind.Custom('assistant_birth'),
 *   forcedMode: 'birth'
 * });
 */
export function createThreadAndNotify(
  options: ThreadCreateData
): { id: EARS.EntityId; shortCode: string; timestamp: number; status: string } {
  const result = repository.threadCommands.create(options);

  // Notify threads plugin about new thread
  sendToPlugin('threads', {
    type: 'THREAD_CREATED',
    id: result.id,
    shortCode: result.shortCode,
    entityType: EARS.Entity.Thread,
    timestamp: result.timestamp,
    topic: options.topic,
    instructions: options.instructions,
    status: result.status,
    ...(options.pinned && { pinned: true }),
  });

  // Refresh recent threads list (thread creation affects ordering)
  sendRecentThreadsRefresh();

  return result;
}

/**
 * Open thread chat and refresh recent threads list
 *
 * Bundles:
 * - Mark thread as visited
 * - Load thread data for chat
 * - Refresh recent threads list
 */
export function openThreadChatAndRefreshRecent(threadId: EARS.EntityId, restore?: boolean) {
  if (!restore) {
    repository.threadCommands.markAsVisited(threadId);
  }

  const thread = repository.threadQueries.byId(threadId);
  if (thread?.chatState === 'success') {
    threadsService.updateChatState(threadId, 'idle');
  }

  const data = repository.chatQueries.threadData(threadId);
  if (!data) {
    throw new Error(`Thread ${threadId} not found`);
  }

  sendToPlugin('threads', {
    type: 'LOAD_CHAT_THREAD',
    data,
    ...(restore && { restore }),
  });

  if (!restore) {
    sendRecentThreadsRefresh();
  }
}

/**
 * Open thread tab and refresh recent threads list
 *
 * Bundles:
 * - Mark thread as visited
 * - Load thread tab data with artifacts
 * - Refresh recent threads list
 */
export function openThreadTabAndRefresh(threadId: EARS.EntityId) {
  // Mark thread as visited when opening tab
  repository.threadCommands.markAsVisited(threadId);

  // Query thread data and artifacts from repository
  const thread = repository.threadQueries.byId(threadId);
  const artifacts = repository.chatQueries.threadArtifacts(threadId);

  // Reset 'success' state when the user revisits the thread
  if (thread?.chatState === 'success') {
    threadsService.updateChatState(threadId, 'idle');
  }

  // Send thread tab data
  sendToPlugin('threads', {
    type: 'THREAD_TAB_REQUESTED',
    threadId,
    topic: thread?.topic || `Thread ${threadId}`,
    artifacts,
    ...(thread?.pinned && { pinned: true }),
  });

  // Send updated recent threads list
  sendRecentThreadsRefresh();
}

/**
 * Send recent threads refresh to frontend
 *
 * Use this helper after any operation that affects thread ordering:
 * - Thread creation
 * - Message creation (updates lastMessageTimestamp)
 * - Thread visits (updates lastVisitedTimestamp)
 */
export function sendRecentThreadsRefresh() {
  sendToPlugin('threads', {
    type: 'REFRESH_RECENT_THREADS',
    data: repository.chatQueries.refreshThreadsData()
  });
}

// ─── Reference resolution ─────────────────────────────────────────────────

/**
 * Resolve all message reference types (images, files, notes, threads,
 * library docs/folders) into prompt-ready content for the Claude Code CLI.
 *
 * Returns:
 * - `textPrefix`  — formatted text for non-image references, prepended to the user message
 * - `imageBlocks` — Anthropic image content blocks (base64-encoded), with text labels
 * - `addDirs`     — directories for `--add-dir` (attached file auto-reads)
 */
export async function resolveReferences(
  references: MessageReferences | undefined,
): Promise<{ textPrefix: string; imageBlocks: any[]; addDirs: string[] }> {
  if (!references) return { textPrefix: '', imageBlocks: [], addDirs: [] };

  const parts: string[] = [];
  const imageBlocks: any[] = [];
  const addDirs: string[] = [];

  // ─── Files ──────────────────────────────────────────────────────────
  if (references.files?.length) {
    for (const file of references.files) {
      parts.push(`[Attached file: ${file.path}]`);
      const lastSlash = file.path.lastIndexOf('/');
      if (lastSlash > 0) {
        const dir = file.path.slice(0, lastSlash);
        if (!addDirs.includes(dir)) addDirs.push(dir);
      }
    }
  }

  // ─── Context references (notes, threads, documents, folders) ───────
  if (references.context?.length) {
    for (const ref of references.context) {
      const resolved = await resolveContextRef(ref);
      if (resolved) parts.push(resolved);
    }
  }

  // ─── Images → labeled base64 content blocks ─────────────────────────
  if (references.images?.length) {
    for (const img of references.images) {
      const match = img.url.match(/^media:\/\/([^/]+)\/(.+)$/);
      if (!match) continue;
      const mediaRef = { entityId: match[1], filename: match[2], alt: img.name || '', originalUrl: img.url };
      const result = media.readMediaBuffer(mediaRef);
      if (!result) continue;
      const label = img.name || match[2];
      imageBlocks.push({ type: 'text', text: `[Image: ${label}]` });
      imageBlocks.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: result.mimeType,
          data: result.data.toString('base64'),
        },
      });
    }
  }

  return { textPrefix: parts.join('\n\n'), imageBlocks, addDirs };
}

// ─── Per-type context reference resolution ────────────────────────────────

async function resolveContextRef(
  ref: MessageReferences extends { context?: (infer R)[] } ? NonNullable<R> : never,
): Promise<string | undefined> {
  switch (ref.refType) {
    case 'note':
      return resolveNote(ref);
    case 'thread':
      return resolveThread(ref);
    case 'document':
      return resolveDocument(ref);
    case 'folder':
      return resolveFolder(ref);
    default:
      return undefined;
  }
}

function resolveNote(ref: { refId: string; label: string }): string {
  const note = repository.noteQueries.byIdDTO(ref.refId as EARS.EntityId);
  if (!note) return `[Note: ${ref.label} (not found)]`;
  return `--- Note: ${note.title} ---\n${note.content}\n---`;
}

function resolveThread(ref: { refId: string; label: string }): string {
  const thread = repository.threadQueries.byId(ref.refId as EARS.EntityId);
  if (!thread) return `[Thread: ${ref.label} (not found)]`;
  const sessionId = thread.context?.claudeCode?.sessionId;
  return `[Thread: ${thread.topic}${sessionId ? ` (session: ${sessionId})` : ''}]`;
}

async function resolveDocument(ref: { refId: string; label: string }): Promise<string> {
  const resolved = symlink.resolveSymlinkPath(ref.refId);
  if (resolved) return `[Library doc: ${ref.label} → ${resolved.absolutePath}]`;

  const text = await libraryService.getText(ref.refId as EARS.EntityId);
  if (!text) return `[Library doc: ${ref.label} (not found)]`;
  return `--- Doc: ${ref.label} ---\n${text}\n---`;
}

function resolveFolder(ref: { refId: string; label: string }): string {
  const resolved = symlink.resolveSymlinkPath(ref.refId);
  if (resolved) return `[Library folder: ${ref.label} → ${resolved.absolutePath}]`;
  return `[Library folder: ${ref.label} (id: ${ref.refId})]`;
}

// ─── Aside text generation ────────────────────────────────────────────────

/**
 * Generate a compact aside summary for a collapsed interactive message.
 * Pure function — no side effects.
 */
export function generateAsideText(message: MessageEntity, response: BlockResponse): string {
  // Derive a short context label from blocks (preferred) or message text (fallback).
  // tool-input blocks give us a clean tool name; prompt blocks are shorter than message.text.
  const toolInputBlock = message.blocks?.find(b => b.type === 'tool-input');
  const promptBlock = message.blocks?.find(b => b.type === 'prompt');
  const contextText = message.asideContext
    ?? toolInputBlock?.props?.toolName
    ?? (promptBlock?.props?.content ? truncate(String(promptBlock.props.content), 50) : null)
    ?? (message.text ? truncate(message.text, 50) : null);
  const context = contextText ? ` — ${contextText}` : '';

  // Cancelled
  if (response && typeof response === 'object' && 'cancelled' in response && response.cancelled) {
    return `Cancelled${context}`;
  }

  // Determine the primary interactive block type
  const primaryBlock = message.blocks?.find(b =>
    ['approval', 'choice', 'text', 'question', 'file-picker', 'project-select', 'button-group'].includes(b.type)
  );

  if (!primaryBlock) {
    return truncate(message.text, 80);
  }

  switch (primaryBlock.type) {
    case 'approval': {
      if (typeof response === 'object' && response !== null && 'approved' in response) {
        const reason = 'reason' in response && response.reason
          ? `: ${truncate(String(response.reason), 30)}`
          : '';
        const outcome = response.approved ? `✓ Approved${reason}` : `✗ Denied${reason}`;
        return `${outcome}${context}`;
      }
      return truncate(message.text, 80);
    }

    case 'choice': {
      if (typeof response === 'string') {
        return `Selected: ${truncate(response, 40)}${context}`;
      }
      if (Array.isArray(response)) {
        return `Selected: ${truncate(response.join(', '), 40)}${context}`;
      }
      return truncate(message.text, 80);
    }

    case 'text': {
      if (typeof response === 'string') {
        return `Replied: ${truncate(response, 40)}${context}`;
      }
      return truncate(message.text, 80);
    }

    case 'question':
      return `Answered${context}`;

    case 'project-select':
    case 'file-picker': {
      const filePath = typeof response === 'string'
        ? response
        : typeof response === 'object' && response !== null && 'path' in response
          ? (typeof (response as any).path === 'string' ? (response as any).path : (response as any).path?.[0])
          : Array.isArray(response) ? response[0] : null;
      if (filePath) {
        return `Selected: ${truncate(String(filePath), 50)}${context}`;
      }
      if (Array.isArray(response)) {
        return `Selected ${response.length} file${response.length === 1 ? '' : 's'}${context}`;
      }
      return truncate(message.text, 80);
    }

    default:
      return truncate(message.text, 80);
  }
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen - 1) + '…';
}
