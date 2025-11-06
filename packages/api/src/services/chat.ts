import { EARS } from '@/core/types';
import { repository } from '@/repository';
import type { BlockConfig, LinkConfig, MessageEntity, ButtonConfig } from '@/systems/threads/types';
import { sendToPlugin } from './event-emitter';

/**
 * Block-based interaction helpers for creating composable messages
 *
 * These helpers make it easy to create messages using reusable blocks that can be
 * mixed and matched to create complex interactions.
 */

interface BlockMessageOptions {
  threadId: EARS.EntityId;
  text: string;
  blocks: BlockConfig[];
}

/**
 * Create a message with custom blocks (pure function)
 * Returns message data without side effects
 */
export function createBlockMessage(options: BlockMessageOptions): {
  messageId: EARS.EntityId;
  threadId: EARS.EntityId;
  message: MessageEntity;
} {
  const { threadId, text, blocks } = options;

  const result = repository.agentCommands.addMessage({
    threadId,
    text,
    sender: 'assistant',
    blocks,
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
  sendToPlugin('agent', {
    type: 'MESSAGE_ADDED',
    threadId: result.threadId,
    message: result.message
  } as any);

  return { messageId: result.messageId };
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
}): { messageId: EARS.EntityId } {
  const { threadId, text, prompt, fileType = 'both', allowMultiple = false, displayText } = options;

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

  return sendBlockMessage({ threadId, text, blocks });
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
  displayText?: string;
}): { messageId: EARS.EntityId } {
  const { threadId, text, prompt, choices, multiSelect = false, allowCustom = false, displayText } = options;

  const blocks: BlockConfig[] = [
    {
      type: 'prompt',
      props: { content: prompt }
    },
    {
      type: 'choice',
      props: { choices, multiSelect, allowCustom, displayText }
    }
  ];

  return sendBlockMessage({ threadId, text, blocks });
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
}): { messageId: EARS.EntityId } {
  const { threadId, text, prompt, context, requireReason = false, allowReason = true } = options;

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

  return sendBlockMessage({ threadId, text, blocks });
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
}): { messageId: EARS.EntityId } {
  const { threadId, text, prompt, placeholder, multiline = false, required = false, displayText } = options;

  const blocks: BlockConfig[] = [
    {
      type: 'prompt',
      props: { content: prompt }
    },
    {
      type: 'text',
      props: { placeholder, multiline, required, displayText }
    }
  ];

  return sendBlockMessage({ threadId, text, blocks });
}

/**
 * Create a link block with navigation actions
 */
export function sendLinkBlock(options: {
  threadId: EARS.EntityId;
  text: string;
  prompt?: string;
  links: LinkConfig[];
}): { messageId: EARS.EntityId } {
  const { threadId, text, prompt, links } = options;

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

  return sendBlockMessage({ threadId, text, blocks });
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
}): { messageId: EARS.EntityId } {
  const { threadId, text, prompt, buttons, keepInteractive = false, displayText } = options;

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

  return sendBlockMessage({ threadId, text, blocks });
}

/**
 * Update a message with block interaction response data
 */
export function updateMessageBlockResponse(
  messageId: EARS.EntityId,
  response: any
): void {
  repository.agentCommands.updateMessageBlockResponse({
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
  updates: Partial<Pick<MessageEntity, 'text' | 'blocks' | 'blockResponse' | 'responseTimestamp'>>
): void {
  const result = repository.agentCommands.updateMessageState({
    messageId,
    updates
  });

  // Emit UPDATE_MESSAGE_STATE event to frontend with all updated fields
  sendToPlugin('agent', {
    type: 'UPDATE_MESSAGE_STATE',
    messageId: result.messageId,
    ...result.updates
  } as any);
}
