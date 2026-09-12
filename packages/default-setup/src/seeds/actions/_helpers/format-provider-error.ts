import { formatProviderError as _formatProviderError } from '@abuddy/sdk/actions';

const PROVIDER_ALTERNATIVES: Record<string, string> = {
  'Claude Code': 'Codex',
  'Codex': 'Claude Code',
};

export function formatProviderError(error: any, currentProvider: string): string {
  const result = _formatProviderError(error, currentProvider, PROVIDER_ALTERNATIVES);

  if (result.isUsageLimit && result.alternative) {
    return `${result.message} Try switching to ${result.alternative} in Thread settings.`;
  }

  return result.message;
}
