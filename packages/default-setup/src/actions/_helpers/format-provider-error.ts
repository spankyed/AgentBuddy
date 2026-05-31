/**
 * Shared error formatter for provider-driven one-shot tasks
 * (commit message generation, DB query generation).
 *
 * Extracts usage-limit text from CLI stderr/error messages and
 * appends a hint to switch providers when applicable.
 */

const ANSI_ESCAPE_PATTERN = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

const PROVIDER_ALTERNATIVES: Record<string, string> = {
  'Claude Code': 'Codex',
  'Codex': 'Claude Code',
};

/**
 * Format a provider error with usage-limit detection and
 * a hint to switch to the alternative provider.
 */
export function formatProviderError(error: any, currentProvider: string): string {
  const raw = typeof error?.stderr === 'string' && error.stderr.trim()
    ? error.stderr
    : String(error?.message || 'Unknown error');

  const clean = raw.replace(ANSI_ESCAPE_PATTERN, '').trim();

  // Detect usage-limit lines (works for both Claude and OpenAI patterns)
  const usageLine = clean
    .split(/\r?\n/)
    .map(line => line.trim())
    .find(line =>
      (/out of (?:extra )?usage/i.test(line) && /resets?/i.test(line)) ||
      /rate.?limit/i.test(line) ||
      /quota.*exceeded/i.test(line)
    );

  let message: string;
  if (usageLine) {
    message = usageLine
      .replace(/^.*?(?=(?:you[''\u2019]re|you are)\s+out of (?:extra )?usage\b)/i, '')
      .replace(/^(?:error|fatal):\s*/i, '')
      .trim();
  } else {
    message = clean || 'Unknown error';
  }

  // Append provider-switch hint for usage/rate-limit errors
  const alt = PROVIDER_ALTERNATIVES[currentProvider];
  if (alt && usageLine) {
    message += ` Try switching to ${alt} in Thread settings.`;
  }

  return message;
}
