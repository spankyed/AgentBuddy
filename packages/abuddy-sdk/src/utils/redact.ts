// Keeps API keys out of logs and error reports: a backstop for anything that writes text or data it didn't build

/** Strings shaped like provider API keys (OpenAI, Anthropic, Groq, Google), masked or not */
const KEY_SHAPED = /\b(?:sk-(?:ant-|proj-)?|gsk_|AIza)[A-Za-z0-9_\-*.…]{16,}/g;

/** Fields whose values are credentials, whatever they hold */
const SECRET_FIELDS = /^(?:api[-_]?key|apikey|secret|client[-_]?secret|token|access[-_]?token|refresh[-_]?token|password|authorization|x-api-key)$/i;

export const REDACTED = '[redacted]';

/** `text` with key-shaped strings replaced */
export function redactSecretText(text: string): string {
  return text.replace(KEY_SHAPED, REDACTED);
}

/** A copy of `value` with key-shaped strings, and the values of credential fields, replaced (cycles become a marker) */
export function redactSecrets<T>(value: T): T {
  const seen = new WeakSet<object>();
  const visit = (current: unknown): unknown => {
    if (typeof current === 'string') return redactSecretText(current);
    if (current === null || typeof current !== 'object') return current;
    if (seen.has(current)) return '[Circular Reference]';
    seen.add(current);
    if (Array.isArray(current)) return current.map(visit);
    if (current instanceof Error) {
      return { name: current.name, message: redactSecretText(current.message), ...(current.stack && { stack: redactSecretText(current.stack) }) };
    }
    return Object.fromEntries(Object.entries(current).map(([key, field]) =>
      [key, SECRET_FIELDS.test(key) && field !== null && field !== undefined && field !== '' ? REDACTED : visit(field)]));
  };
  return visit(value) as T;
}
