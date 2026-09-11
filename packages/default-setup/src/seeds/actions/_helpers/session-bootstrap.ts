import type { EntityId, Services } from '@/__generated__/services';
import { buildTranscript, type TranscriptMessage } from '@abuddy/sdk/actions';

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

export function buildSessionBootstrapPrompt(
  services: Services,
  options: BootstrapPromptOptions,
): string {
  const thread = services.repository.chatQueries.threadData(options.threadId as EntityId);
  const messages = ((thread?.messages ?? []) as ThreadMessage[])
    .filter((message) => shouldIncludeMessage(message, options.currentMessageId));

  if (messages.length === 0) return options.currentText;

  const transcriptMessages: TranscriptMessage[] = messages.map(m => ({
    role: m.sender ?? 'user',
    text: m.text ?? '',
  }));

  const { transcript, omitted } = buildTranscript(transcriptMessages);

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
