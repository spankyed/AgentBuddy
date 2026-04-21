/**
 * CC: DB Query — generates an EARS database query using Claude CLI.
 *
 * Triggered by the `db.query` brain event (forwarded from the database
 * system's GENERATE_AI_QUERY handler). Builds the prompt dynamically
 * from live schema data via `services.database.buildQueryContext()` and
 * the "DB Query" prompt template.
 */

import type { ActionMeta, Services, Z } from '../../types';

export const meta: ActionMeta = {
  label: 'CC: DB Query',
  description: 'Generate an EARS database query using Claude CLI',
  category: 'claude-code',
  input: {
    prompt: { type: 'string', description: 'Natural language query request from the user', required: true },
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

    const fullPrompt = services.prompt.usePrompt('DB Query', {
      userPrompt: userPrompt.trim(),
      schema,
      topology,
    });

    if (!fullPrompt) {
      services.emitter.sendToPlugin('database', {
        type: 'QUERY_ERROR',
        error: 'DB Query prompt template not found. Import the setup pack.',
      });
      return { success: false, error: 'Prompt not found' };
    }

    const result = await services.cli.claudeCode.exec(
      ['--bare', '-p', fullPrompt],
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
