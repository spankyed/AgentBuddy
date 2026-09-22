// The window's shell reads the panel sizes the user set from localStorage: a saved value it can't read leaves the
// window on the defaults, rather than failing the shell and the window with it.
import { afterEach, expect, it, vi } from 'vitest';
import { createActor, setup } from 'xstate';

vi.mock('@/core/fe-client', () => ({
  feClient: {
    send: () => {},
    subscribe: () => () => {},
    packClientReady: () => Promise.resolve(),
    loadedPacks: () => Promise.resolve([]),
    describeConnection: () => Promise.resolve(''),
  },
}));
vi.mock('@/core/toast', () => ({ globalToast: { error: vi.fn() } }));
vi.mock('@/packs/pack-loader', () => ({ loadPackFrontend: vi.fn(), unloadPackFrontend: vi.fn() }));

const { createAppShell } = await import('@/core/app-shell');
const { fePacks } = await import('@/core/fe-packs');
const { HOST } = await import('@abuddy/host/fe');

fePacks.registerPackFE({
  id: 'memo-pack',
  features: { memos: { plugin: { label: 'Memos', icon: 'Zap', state: setup({}).createMachine({}), canvas: {} } as never, default: true } },
});

const PANEL_SIZES_KEY = 'agentbuddy-panel-sizes';

afterEach(() => localStorage.removeItem(PANEL_SIZES_KEY));

const openedPanelSizes = () => {
  // Under the id main.ts gives it: the shell's own children reach it there
  const shell = createActor(createAppShell(), { systemId: HOST.application, input: { ownsLastActivePlugin: false } }).start();
  const { panelSizes } = shell.getSnapshot().context;
  shell.stop();
  return panelSizes;
};

it('opens with the panel sizes the user set', () => {
  localStorage.setItem(PANEL_SIZES_KEY, JSON.stringify({ canvasHeight: 70 }));
  expect(openedPanelSizes()).toMatchObject({ canvasHeight: 70, inspectionWidth: 448 });
});

it("opens with the defaults when the saved sizes aren't JSON", () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  localStorage.setItem(PANEL_SIZES_KEY, '{not json');

  expect(openedPanelSizes()).toMatchObject({ canvasHeight: 50, inspectionWidth: 448 });
  expect(warn).toHaveBeenCalledWith(expect.stringContaining('Ignoring unreadable panel sizes'));
  warn.mockRestore();
});
