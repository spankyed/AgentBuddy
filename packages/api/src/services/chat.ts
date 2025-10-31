import type { EARS } from '@/core/types';
import { repository } from '@/repository';
import type { BlockConfig, LinkConfig } from '@/systems/threads/types';
import { tx } from '@/core/ears/helpers/transaction';

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
 * Send a message with custom blocks
 */
export function sendBlockMessage(options: BlockMessageOptions): { messageId: EARS.EntityId } {
  const { threadId, text, blocks } = options;

  const result = repository.agentCommands.addMessage({
    threadId,
    text,
    sender: 'assistant',
  });

  // Update the message to include blocks and set initial state
  tx(result.id)
    .put('blocks', blocks)
    .put('updatedAt', Date.now());

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
 * Update a message with block interaction response data
 */
export function updateMessageBlockResponse(
  messageId: EARS.EntityId,
  response: any
): void {
  tx(messageId)
    .put('blockResponse', response)
    .put('responseTimestamp', Date.now())
    .put('updatedAt', Date.now());
}
