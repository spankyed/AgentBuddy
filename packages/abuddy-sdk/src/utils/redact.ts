// Keeps API keys out of logs and error reports: a backstop for anything that writes text or data it didn't build

/**
 * Strings shaped like provider API keys (OpenAI, Anthropic, Groq, Google), masked or not, wherever they start after a
 * character that isn't a letter or digit (`foo_sk-…` too). Mistral and Cohere keys have no prefix: text can't tell them
 * from other long tokens, so they're redacted only as the values of credential fields below.
 */
const KEY_SHAPED = /(?<![A-Za-z0-9])(?:sk-(?:ant-|proj-)?|gsk_|AIza)[A-Za-z0-9_\-*.…]{16,}/g;

/** Names of fields whose values are credentials, whatever they hold */
const SECRET_FIELD_NAMES = 'api[-_]?key|apikey|secret|client[-_]?secret|token|access[-_]?token|refresh[-_]?token|password|authorization|x-api-key';
const SECRET_FIELDS = new RegExp(`^(?:${SECRET_FIELD_NAMES})$`, 'i');

/**
 * A credential field's quoted, non-empty string value in text: printed objects (`apiKey: '…'`, `'x-api-key': '…'`)
 * and JSON (`"apiKey":"…"`). Groups: what comes before the value, then its quote.
 */
const SECRET_FIELD_TEXT = new RegExp(
  String.raw`((?<![A-Za-z0-9_-])(['"]?)(?:${SECRET_FIELD_NAMES})\2\s*:\s*)(['"${'`'}])(?:(?!\3)[^\\\n]|\\.)+\3`,
  'gi',
);

export const REDACTED = '[redacted]';

/** Objects nested deeper than this are replaced by a marker */
const MAX_DEPTH = 50;

/** `text` with key-shaped strings, and the quoted values of credential fields printed in it, replaced */
export function redactSecretText(text: string): string {
  return text
    .replace(SECRET_FIELD_TEXT, (_match, before: string, _nameQuote: string, quote: string) => `${before}${quote}${REDACTED}${quote}`)
    .replace(KEY_SHAPED, REDACTED);
}

/**
 * A copy of `value` with key-shaped strings, and the values of credential fields, replaced. Errors become plain objects
 * keeping their name, message, stack, cause, `errors` and own fields (`code`, `errno`, …); a value that contains itself shows a
 * marker where it repeats (a value reached twice by other paths is copied each time), and values nested deeper than
 * `MAX_DEPTH` show a marker too, so deep input never overflows the stack.
 */
export function redactSecrets<T>(value: T): T {
  const ancestors = new WeakSet<object>();
  let depth = 0;
  const visit = (current: unknown): unknown => {
    if (typeof current === 'string') return redactSecretText(current);
    if (current === null || typeof current !== 'object') return current;
    if (current instanceof Date) return new Date(current.getTime());
    if (ancestors.has(current)) return '[Circular Reference]';
    if (depth === MAX_DEPTH) return '[Too deep]';
    ancestors.add(current);
    depth++;
    try {
      if (Array.isArray(current)) return current.map(visit);
      const fields = Object.fromEntries(Object.entries(current).map(([key, field]) =>
        [key, SECRET_FIELDS.test(key) && field !== null && field !== undefined && field !== '' ? REDACTED : visit(field)]));
      if (!(current instanceof Error)) return fields;
      // cause and an AggregateError's errors, read without ES2022 types (this module also runs in the renderer)
      const { cause, errors } = current as Error & { cause?: unknown; errors?: unknown };
      return {
        name: current.name,
        message: redactSecretText(current.message),
        ...(current.stack && { stack: redactSecretText(current.stack) }),
        ...(cause !== undefined && { cause: visit(cause) }),
        ...(Array.isArray(errors) && { errors: visit(errors) }),
        ...fields,
      };
    } finally {
      depth--;
      ancestors.delete(current);
    }
  };
  return visit(value) as T;
}
