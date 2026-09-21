// The renderer's frontend binding: SDK frontend code reaches the API client and the application actor only through it
import { afterEach, expect, it, vi } from 'vitest';

const mutate = vi.hoisted(() => vi.fn<(event: unknown) => Promise<void>>());
const secretsList = vi.hoisted(() => vi.fn(() => Promise.resolve({ secrets: [], status: { protection: 'os-keystore', backend: 'test' } })));
const toastError = vi.hoisted(() => vi.fn());

vi.mock('@/core/trpc', () => ({ trpc: { bus: { send: { mutate } }, secrets: { list: { query: secretsList } } } }));
vi.mock('@/core/toast', () => ({ globalToast: { error: toastError } }));

const logWrite = vi.hoisted(() => vi.fn(() => Promise.resolve()));
(window as unknown as { electronAPI: unknown }).electronAPI = { rendererLog: { write: logWrite } };

const { bindRendererHost, fePacks } = await import('@/core/fe-host');
const { secretsClient, navigateToPlugin, getDslTypes, getDesignated, tiptapPluginRegistry } = await import('@abuddy/sdk/fe');
const { stepRegistry } = await import('@abuddy/sdk/steps');
const { sendToSystem } = await import('@abuddy/sdk/events');
const { unbindFeHost } = await import('@abuddy/sdk/runtime/internals');

const application = {
  getSnapshot: () => ({ context: { activePlugin: { id: 'notes' }, defaultToggles: { canvas: false } } }),
  send: vi.fn(),
  system: { get: () => undefined },
};

const unhandled = vi.fn();
afterEach(() => {
  process.off('unhandledRejection', unhandled);
  unbindFeHost();
  vi.clearAllMocks();
});

it('throws, naming bindFeHost, before the renderer binds it', () => {
  expect(() => secretsClient.list()).toThrow('bindFeHost');
  expect(() => navigateToPlugin('settings')).toThrow('bindFeHost');
  expect(() => sendToSystem('notes', { type: 'SAVE_NOTE' })).toThrow('bindFeHost');
});

it("gives the SDK's frontend lookups the window's registered pack frontends, and throws, naming bindFeHost, before", () => {
  const lookups = [() => getDslTypes(), () => tiptapPluginRegistry.getAll(), () => stepRegistry.get('note'), () => getDesignated('notebook')];
  for (const lookup of lookups) expect(lookup).toThrow('bindFeHost');

  const mentions = { extensions: [] };
  const memoDsl = { prefix: 'memo:', schema: 'declare const memo: string', globals: {} };
  const note = { type: 'note', fe: { nodeConfig: { label: 'Note' } } };
  fePacks.registerPackFE({
    id: 'fe-host-pack',
    plugins: [{ id: 'notebook-main' } as never],
    designations: { notebook: 'notebook-main' },
    steps: [note as never],
    tiptapPlugins: [mentions],
    dslTypes: { memo: memoDsl },
  });
  try {
    bindRendererHost(() => application as never);
    expect(getDslTypes().get('memo')).toBe(memoDsl);
    expect(tiptapPluginRegistry.getAll()).toEqual([mentions]);
    expect(stepRegistry.get('note')).toBe(note);
    expect(getDesignated('notebook')).toBe('fe-host-pack.notebook-main');
  } finally {
    fePacks.unregisterPackFE('fe-host-pack');
  }
  expect(getDslTypes().has('memo')).toBe(false);
});

it('binds before the application actor exists, naming it when SDK code reaches the actor too early', () => {
  let created: typeof application | undefined;
  bindRendererHost(() => created as never);
  expect(() => navigateToPlugin('settings')).toThrow("The application actor isn't created yet");
  created = application;
  navigateToPlugin('settings');
  expect(application.send).toHaveBeenCalledWith({ type: 'SELECT_PLUGIN', pluginId: 'settings' });
});

it('gives secretsClient the API client and navigateToPlugin the application actor', async () => {
  bindRendererHost(() => application as never);
  await expect(secretsClient.list()).resolves.toMatchObject({ secrets: [] });
  expect(secretsList).toHaveBeenCalledTimes(1);
  navigateToPlugin('settings');
  expect(application.send).toHaveBeenCalledWith({ type: 'SELECT_PLUGIN', pluginId: 'settings' });
});

it("sends to systems over the API client, reporting a rejected send to the console, the app's log and a toast, without an unhandled rejection or the payload", async () => {
  bindRendererHost(() => application as never);
  process.on('unhandledRejection', unhandled);
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  mutate.mockRejectedValue(new Error('socket closed'));

  sendToSystem('notes', { type: 'SAVE_NOTE', body: 'secret text' });
  await new Promise(resolve => setTimeout(resolve, 0));

  expect(mutate).toHaveBeenCalledWith({ type: 'SAVE_NOTE', body: 'secret text', systemId: 'notes' });
  expect(unhandled).not.toHaveBeenCalled();
  const message = "Couldn't send SAVE_NOTE to notes: socket closed";
  expect(consoleError).toHaveBeenCalledWith(`[fe-host] ${message}`);
  expect(logWrite).toHaveBeenCalledWith({ level: 'error', source: 'fe-host', message });
  expect(toastError).toHaveBeenCalledWith(message);
  expect(JSON.stringify([consoleError.mock.calls, logWrite.mock.calls, toastError.mock.calls])).not.toContain('secret text');
});
