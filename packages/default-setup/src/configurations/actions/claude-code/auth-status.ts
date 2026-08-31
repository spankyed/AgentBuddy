/**
 * Claude Code Auth Status — reports whether the CLI is authenticated.
 *
 * Drives `services.cli.claudeCode.authStatus()` which shells out to
 * `claude auth status --json`. Useful for a provider settings panel or a
 * preflight check in flows that want to fail fast on an unauthenticated CLI.
 */

import type { ActionMeta, Services, Z } from '../../types';

export const meta: ActionMeta = {
  label: 'Claude Code Auth Status',
  description: 'Report whether the Claude Code CLI is currently authenticated.',
  category: 'claude-code',
  input: {},
};

export async function action(
  _params: Record<string, any>,
  services: Services,
  _z: Z,
  _flowId: string,
) {
  try {
    const status = await services.cli.claudeCode.authStatus();
    return {
      success: true,
      authenticated: Boolean(status?.authenticated),
      source: status?.source,
      raw: status,
    };
  } catch (err: any) {
    return {
      success: false,
      authenticated: false,
      error: err?.message || 'Failed to check Claude Code auth status',
    };
  }
}
