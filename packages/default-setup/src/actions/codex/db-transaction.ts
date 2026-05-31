/**
 * CDX: DB Transaction — generates an EARS database transaction using Codex CLI.
 *
 * Triggered by the `db.query` brain event when mode is 'transaction'
 * and the user's default mode is set to Codex.
 */

import type { ActionMeta, Services, Z } from '../../types';
import { formatProviderError } from '../_helpers/format-provider-error';

export const meta: ActionMeta = {
  label: 'CDX: DB Transaction',
  description: 'Generate an EARS database transaction using Codex CLI',
  category: 'codex',
  input: {
    prompt: { type: 'string', description: 'Natural language transaction request from the user', required: true },
  },
};

export async function action(
  params: Record<string, any>,
  services: Services,
  _z: Z,
  _flowId: string,
) {
  const { prompt: userPrompt } = params;

  if (!userPrompt?.trim()) {
    services.emitter.sendToPlugin('database', {
      type: 'QUERY_ERROR',
      error: 'Please provide a valid prompt',
    });
    return { success: false, error: 'Empty prompt' };
  }

  services.emitter.sendToPlugin('database', { type: 'AI_QUERY_LOADING' });

  try {
    const { schema, topology } = services.database.buildQueryContext();

    const systemPrompt = services.prompt.usePrompt('DB Transaction System', { schema, topology });

    if (!systemPrompt) {
      services.emitter.sendToPlugin('database', {
        type: 'QUERY_ERROR',
        error: 'DB Transaction prompt template not found. Import the setup pack.',
      });
      return { success: false, error: 'Prompt not found' };
    }

    // Codex CLI has no --system-prompt flag, so embed system context in the prompt
    const prompt = `${systemPrompt}\n\n${userPrompt.trim()}`;

    const result = await services.cli.codex.exec(
      ['exec', prompt, '--sandbox', 'read-only', '--ask-for-approval', 'never'],
      { timeoutMs: 60_000, cwd: '/tmp' },
    );

    const query = result.stdout.trim().replace(/^```(?:typescript|ts|javascript|js)?\n?/, '').replace(/\n?```$/, '').trim();

    if (!query) {
      services.emitter.sendToPlugin('database', {
        type: 'QUERY_ERROR',
        error: 'Codex returned an empty response.',
      });
      return { success: false, error: 'Empty response' };
    }

    services.emitter.sendToPlugin('database', {
      type: 'AI_QUERY_GENERATED',
      query,
    });

    return { success: true };
  } catch (error: any) {
    const errorMessage = formatProviderError(error, 'Codex');
    services.emitter.sendToPlugin('database', {
      type: 'QUERY_ERROR',
      error: errorMessage,
    });
    return { success: false, error: errorMessage };
  }
}
