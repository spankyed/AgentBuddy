/**
 * CC: DB Query — generates an EARS database query using Claude CLI.
 *
 * Triggered by the `db.query` brain event (forwarded from the database
 * system's GENERATE_AI_QUERY handler). The full prompt (including EARS
 * API docs and schema) is assembled by the database system and passed
 * through as `prompt`.
 */

import type { ActionMeta, Services, Z } from '../../types';

export const meta: ActionMeta = {
  label: 'CC: DB Query',
  description: 'Generate an EARS database query using Claude CLI',
  category: 'claude-code',
  input: {
    prompt: { type: 'string', description: 'Full prompt with EARS API docs, schema, and user request', required: true },
  },
};

export async function action(
  params: Record<string, any>,
  services: Services,
  _z: Z,
  _flowId: string,
) {
  const { prompt } = params;

  if (!prompt?.trim()) {
    services.emitter.sendToPlugin('database', {
      type: 'QUERY_ERROR',
      error: 'Please provide a valid prompt',
    });
    return { success: false, error: 'Empty prompt' };
  }

  services.emitter.sendToPlugin('database', { type: 'AI_QUERY_LOADING' });

  try {
    const result = await services.cli.claudeCode.exec(
      ['--bare', '-p', prompt.trim()],
      { timeoutMs: 60_000 },
    );

    const query = result.stdout.trim();

    if (!query) {
      services.emitter.sendToPlugin('database', {
        type: 'QUERY_ERROR',
        error: 'Claude returned an empty response.',
      });
      return { success: false, error: 'Empty response' };
    }

    services.emitter.sendToPlugin('database', {
      type: 'AI_QUERY_GENERATED',
      query,
    });

    return { success: true };
  } catch (error: any) {
    const message = error?.message || 'Unknown error';
    services.emitter.sendToPlugin('database', {
      type: 'QUERY_ERROR',
      error: message,
    });
    return { success: false, error: message };
  }
}
