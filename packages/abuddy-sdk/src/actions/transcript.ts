export interface TranscriptMessage {
  role: string;
  text: string;
}

export interface BuildTranscriptOptions {
  maxMessages?: number;
  maxChars?: number;
}

const DEFAULT_MAX_MESSAGES = 40;
const DEFAULT_MAX_CHARS = 6_000;

function clampText(text: string, maxChars: number): string {
  const trimmed = text.trim();
  if (trimmed.length <= maxChars) return trimmed;
  return `${trimmed.slice(0, maxChars).trimEnd()}\n[Message truncated]`;
}

function roleLabel(role: string): string {
  if (role === 'assistant') return 'Assistant';
  if (role === 'system') return 'System';
  return 'User';
}

export function buildTranscript(
  messages: TranscriptMessage[],
  options?: BuildTranscriptOptions,
): { transcript: string; omitted: number } {
  const maxMessages = options?.maxMessages ?? DEFAULT_MAX_MESSAGES;
  const maxChars = options?.maxChars ?? DEFAULT_MAX_CHARS;

  const selected = messages.slice(-maxMessages);
  const omitted = messages.length - selected.length;

  const transcript = selected
    .map(m => `${roleLabel(m.role)}:\n${clampText(m.text, maxChars)}`)
    .join('\n\n');

  return { transcript, omitted };
}
