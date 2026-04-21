/**
 * CC: DB Transaction — generates an EARS database transaction using Claude CLI.
 *
 * Triggered by the `db.query` brain event when mode is 'transaction'.
 */

import type { ActionMeta, Services, Z } from '../../types';

export const meta: ActionMeta = {
  label: 'CC: DB Transaction',
  description: 'Generate an EARS database transaction using Claude CLI',
  category: 'claude-code',
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

    const fullPrompt = services.prompt.usePrompt('DB Transaction', {
      userPrompt: userPrompt.trim(),
      schema,
      topology,
    });

    if (!fullPrompt) {
      services.emitter.sendToPlugin('database', {
        type: 'QUERY_ERROR',
        error: 'DB Transaction prompt template not found. Import the setup pack.',
      });
      return { success: false, error: 'Prompt not found' };
    }

    const result = await services.cli.claudeCode.exec(
      ['-p', fullPrompt],
      { timeoutMs: 60_000, cwd: '/tmp' },
    );

    const query = result.stdout.trim().replace(/^```(?:typescript|ts|javascript|js)?\n?/, '').replace(/\n?```$/, '').trim();

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
