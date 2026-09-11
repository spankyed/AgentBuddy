const ANSI_ESCAPE_PATTERN = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

export interface ProviderErrorResult {
  message: string;
  isUsageLimit: boolean;
  alternative?: string;
}

export function formatProviderError(
  error: any,
  currentProvider: string,
  alternatives?: Record<string, string>,
): ProviderErrorResult {
  const raw = typeof error?.stderr === 'string' && error.stderr.trim()
    ? error.stderr
    : String(error?.message || 'Unknown error');

  const clean = raw.replace(ANSI_ESCAPE_PATTERN, '').trim();

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
      .replace(/^.*?(?=(?:you[''’]re|you are)\s+out of (?:extra )?usage\b)/i, '')
      .replace(/^(?:error|fatal):\s*/i, '')
      .trim();
  } else {
    message = clean || 'Unknown error';
  }

  const alternative = alternatives?.[currentProvider];

  return { message, isUsageLimit: !!usageLine, alternative };
}
