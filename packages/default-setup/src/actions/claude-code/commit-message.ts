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
    branch: { type: 'string', description: 'Current branch name', required: false },
    repoName: { type: 'string', description: 'Repository name', required: false },
  },
};

/**
 * Clean up model output into a usable commit message.
 * Strips markdown fences, preamble prose, surrounding quotes,
 * and enforces 72-char subject line.
 */
function postprocess(raw: string): string {
  let msg = raw.trim();

  // Strip markdown code fences
  msg = msg.replace(/^```(?:\w+)?\n?/, '').replace(/\n?```$/, '').trim();

  // Strip preamble like "Here is a commit message:" or "Sure, here's..."
  msg = msg.replace(/^(?:here(?:'s| is) (?:a |the )?(?:commit )?message[:\s]*)/i, '').trim();
  msg = msg.replace(/^(?:sure[,!.]?\s*)/i, '').trim();

  // Strip surrounding quotes
  if ((msg.startsWith('"') && msg.endsWith('"')) || (msg.startsWith("'") && msg.endsWith("'"))) {
    msg = msg.slice(1, -1).trim();
  }

  // Strip Co-Authored-By trailers
  msg = msg.replace(/\n*Co-Authored-By:.*$/gim, '').trim();

  return msg;
}

const ANSI_ESCAPE_PATTERN = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

/**
 * Prefer Claude's actionable usage-limit text over the wrapper's generic
 * non-zero exit summary.
 */
export function formatCommitMessageError(error: any): string {
  const raw = typeof error?.stderr === 'string' && error.stderr.trim()
    ? error.stderr
    : String(error?.message || 'Unknown error');

  const clean = raw.replace(ANSI_ESCAPE_PATTERN, '').trim();
  const usageLine = clean
    .split(/\r?\n/)
    .map(line => line.trim())
    .find(line => /out of (?:extra )?usage/i.test(line) && /resets?/i.test(line));

  if (usageLine) {
    return usageLine
      .replace(/^.*?(?=(?:you['’]re|you are)\s+out of (?:extra )?usage\b)/i, '')
      .replace(/^(?:error|fatal):\s*/i, '')
      .trim();
  }

  return clean || 'Unknown error';
}

export async function action(
  params: Record<string, any>,
  services: Services,
  _z: Z,
  _flowId: string,
) {
  const { diff, branch, repoName } = params;

  if (!diff?.trim()) {
    services.emitter.sendToPlugin('code', {
      type: 'commit.ERROR_RECEIVED',
      data: { message: 'No diff provided' },
    });
    return { success: false, error: 'Empty diff' };
  }

  services.emitter.sendToPlugin('code', { type: 'commit.GENERATING_MESSAGE' });

  try {
    const fullPrompt = services.prompt.usePrompt('Commit Message', {
      diff,
      branch: branch || '',
      repoName: repoName || '',
    });

    if (!fullPrompt) {
      services.emitter.sendToPlugin('code', {
        type: 'commit.ERROR_RECEIVED',
        data: { message: 'Commit Message prompt template not found. Import the setup pack.' },
      });
      return { success: false, error: 'Prompt not found' };
    }

    const result = await services.cli.claudeCode.exec(
      ['-p', fullPrompt, '--system-prompt', 'Output ONLY the commit message. No preamble, no markdown, no backticks, no quotes.'],
      { timeoutMs: 60_000, cwd: '/tmp' },
    );

    const message = postprocess(result.stdout);

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
    const errorMessage = formatCommitMessageError(error);
    services.emitter.sendToPlugin('code', {
      type: 'commit.ERROR_RECEIVED',
      data: { message: errorMessage },
    });
    return { success: false, error: errorMessage };
  }
}
