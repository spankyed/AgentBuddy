import type { EntityId, Services } from '../../types';

type ThreadMessage = {
  id?: string;
  text?: string;
  sender?: string;
  deleted?: boolean;
  compacted?: boolean;
  isCommand?: boolean;
  status?: string | null;
  autoHide?: boolean;
  asUser?: boolean;
  asideContext?: string;
};

export interface BootstrapPromptOptions {
  threadId: EntityId | string;
  currentMessageId?: string;
  currentText: string;
  providerName: string;
}

const MAX_HISTORY_MESSAGES = 40;
const MAX_MESSAGE_CHARS = 6_000;

function shouldIncludeMessage(message: ThreadMessage, currentMessageId?: string): boolean {
  if (!message?.text?.trim()) return false;
  if (currentMessageId && message.id === currentMessageId) return false;
  if (message.deleted) return false;
  if (message.status === 'queued' || message.status === 'cancelled') return false;
  if (message.sender === 'marker') return false;
  if (message.isCommand) return false;
  if (message.autoHide || message.asUser || message.asideContext) return false;
  if (message.compacted) return false;
  if (message.sender === 'assistant' && message.text.trim() === 'Thinking…') return false;
  return message.sender === 'user' || message.sender === 'assistant' || message.sender === 'system';
}

function roleLabel(sender: string | undefined): string {
  if (sender === 'assistant') return 'Assistant';
  if (sender === 'system') return 'System';
  return 'User';
}

function clampMessage(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= MAX_MESSAGE_CHARS) return trimmed;
  return `${trimmed.slice(0, MAX_MESSAGE_CHARS).trimEnd()}\n[Message truncated]`;
}

export function buildSessionBootstrapPrompt(
  services: Services,
  options: BootstrapPromptOptions,
): string {
  const thread = services.repository.chatQueries.threadData(options.threadId as EntityId);
  const messages = ((thread?.messages ?? []) as ThreadMessage[])
    .filter((message) => shouldIncludeMessage(message, options.currentMessageId));

  if (messages.length === 0) return options.currentText;

  const selected = messages.slice(-MAX_HISTORY_MESSAGES);
  const omitted = messages.length - selected.length;
  const transcript = selected
    .map((message) => `${roleLabel(message.sender)}:\n${clampMessage(message.text ?? '')}`)
    .join('\n\n');

  const omittedLine = omitted > 0
    ? `\n\n[${omitted} earlier message${omitted === 1 ? '' : 's'} omitted]`
    : '';

  return [
    `You are continuing an existing AgentBuddy thread in ${options.providerName}.`,
    'The provider session is new, so use the prior thread transcript below as context. Continue from where the thread left off, then answer the latest user message.',
    `${omittedLine}\n\nPrior thread transcript:\n${transcript}`,
    `Latest user message:\n${options.currentText.trim()}`,
  ].join('\n\n');
}
