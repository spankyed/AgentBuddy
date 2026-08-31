/** CDX: Start Server — spawns the codex app-server on flow entry. */

import type { ActionMeta, Services } from '../../types';

export const meta: ActionMeta = {
  label: 'CDX: Start Server',
  description: 'Starts the Codex app-server subprocess if not already running.',
  category: 'codex',
  input: {},
};

export async function action(_params: Record<string, any>, services: Services) {
  const codex = services.codex as any;

  if (codex.status === 'ready') {
    return { success: true, alreadyRunning: true };
  }

  try {
    await codex.start();
    services.logger.info('[codex] app-server started on flow entry');
    return { success: true };
  } catch (err: any) {
    services.logger.error('[codex] failed to start app-server', { error: err?.message });
    return { success: false, error: err?.message };
  }
}
