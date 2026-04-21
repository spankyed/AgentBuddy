/**
 * CC: Commit Message — generates a commit message from a git diff using Claude CLI.
 *
 * Triggered by the `commit.generate` brain event (forwarded from the
 * code system's generateCommitMessage handler).
 */

import type { ActionMeta, Services, Z } from '../../types';

export const meta: ActionMeta = {
  label: 'CC: Commit Message',
  description: 'Generate a git commit message from a diff using Claude CLI',
  category: 'claude-code',
  input: {
    diff: { type: 'string', description: 'Git diff to generate a commit message from', required: true },
  },
};

export async function action(
  params: Record<string, any>,
  services: Services,
  _z: Z,
  _flowId: string,
) {
  const { diff } = params;

  if (!diff?.trim()) {
    services.emitter.sendToPlugin('code', {
      type: 'commit.ERROR_RECEIVED',
      data: { message: 'No diff provided' },
    });
    return { success: false, error: 'Empty diff' };
  }

  services.emitter.sendToPlugin('code', { type: 'commit.GENERATING_MESSAGE' });

  try {
    const fullPrompt = services.prompt.usePrompt('Commit Message', { diff });

    if (!fullPrompt) {
      services.emitter.sendToPlugin('code', {
        type: 'commit.ERROR_RECEIVED',
        data: { message: 'Commit Message prompt template not found. Import the setup pack.' },
      });
      return { success: false, error: 'Prompt not found' };
    }

    const result = await services.cli.claudeCode.exec(
      ['-p', fullPrompt],
      { timeoutMs: 60_000, cwd: '/tmp' },
    );

    const message = result.stdout.trim()
      .replace(/^```(?:typescript|ts|javascript|js)?\n?/, '')
      .replace(/\n?```$/, '')
      .trim();

    if (!message) {
      services.emitter.sendToPlugin('code', {
        type: 'commit.ERROR_RECEIVED',
        data: { message: 'Claude returned an empty response.' },
      });
      return { success: false, error: 'Empty response' };
    }

    services.emitter.sendToPlugin('code', {
      type: 'commit.MESSAGE_GENERATED',
      data: { message },
    });

    return { success: true };
  } catch (error: any) {
    const errorMessage = error?.message || 'Unknown error';
    services.emitter.sendToPlugin('code', {
      type: 'commit.ERROR_RECEIVED',
      data: { message: errorMessage },
    });
    return { success: false, error: errorMessage };
  }
}
