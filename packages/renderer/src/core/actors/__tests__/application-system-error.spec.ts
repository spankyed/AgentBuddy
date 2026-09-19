// How loudly the app shows a system error. `fatal` replaces the window, `error` raises a toast, and
// `diagnostic` does neither: it is still logged and still recorded, so a pack test that leaves one
// fails, but it does not interrupt someone who can do nothing about it — a send to a plugin no pack
// declares is for whoever wrote the send, and it is already in the Logs plugin.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createActor, setup, type Actor } from 'xstate';
import type { Plugin } from '@/core/types';

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn(), info: vi.fn() }));
vi.mock('@/core/toast', () => ({ globalToast: toast, registerGlobalToast: () => {} }));
vi.mock('@/core/trpc', () => ({
  trpc: {
    bus: { sub: { subscribe: () => ({ unsubscribe: () => {} }) }, packClientReady: { mutate: () => Promise.resolve() } },
    packs: { registry: { query: () => Promise.resolve([]) } },
  },
}));

const { createApplicationState } = await import('@/core/actors/application');

const plugin = (id: string): Plugin =>
  ({ id, label: id, icon: 'Zap', state: setup({}).createMachine({}), canvas: {} } as unknown as Plugin);

let app: Actor<ReturnType<typeof createApplicationState>>;
let showErrorPage: ReturnType<typeof vi.fn>;

beforeEach(() => {
  toast.error.mockReset();
  showErrorPage = vi.fn();
  (window as unknown as { __showErrorPage?: unknown }).__showErrorPage = showErrorPage;
  const notes = plugin('notes');
  app = createActor(createApplicationState(), {
    systemId: 'application',
    input: { plugins: [notes], defaultPlugin: notes, restoreLastActivePlugin: false },
  }).start();
});
afterEach(() => {
  app.stop();
  delete (window as unknown as { __showErrorPage?: unknown }).__showErrorPage;
});

const systemError = (severity: 'diagnostic' | 'error' | 'fatal') =>
  app.send({ type: 'SYSTEM_ERROR', message: `a ${severity}`, severity } as never);

describe('SYSTEM_ERROR', () => {
  it('raises a toast for an ordinary error', () => {
    systemError('error');
    expect(toast.error).toHaveBeenCalledTimes(1);
    expect(showErrorPage).not.toHaveBeenCalled();
  });

  it('replaces the window for a fatal one', () => {
    systemError('fatal');
    expect(showErrorPage).toHaveBeenCalledTimes(1);
    expect(toast.error).not.toHaveBeenCalled();
  });

  // The whole point of the severity: the bus reports a dropped send with it
  it('shows the user nothing for a diagnostic', () => {
    systemError('diagnostic');
    expect(toast.error).not.toHaveBeenCalled();
    expect(showErrorPage).not.toHaveBeenCalled();
  });
});
