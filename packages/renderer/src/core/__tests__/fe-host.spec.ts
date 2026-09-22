// The renderer's frontend binding: SDK frontend code reaches the API client and the application actor only through it
import { afterEach, expect, it, vi } from 'vitest';

const mutate = vi.hoisted(() => vi.fn<(event: unknown) => Promise<void>>());
const secretsList = vi.hoisted(() => vi.fn(() => Promise.resolve({ secrets: [], status: { protection: 'os-keystore', backend: 'test' } })));
const toastError = vi.hoisted(() => vi.fn());

vi.mock('@/core/trpc', () => ({ trpc: { bus: { send: { mutate } }, secrets: { list: { query: secretsList } } } }));
vi.mock('@/core/toast', () => ({ globalToast: { error: toastError } }));

const logWrite = vi.hoisted(() => vi.fn(() => Promise.resolve()));
(window as unknown as { electronAPI: unknown }).electronAPI = { rendererLog: { write: logWrite } };

const { bindRendererHost } = await import('@/core/fe-host');
const { fePacks } = await import('@/core/fe-packs');
const { resolveName } = await import('@abuddy/sdk/ids');
const { secretsClient, openPlugin, getDslTypes, getDesignated, tiptapPluginRegistry } = await import('@abuddy/sdk/fe');
const { stepRegistry } = await import('@abuddy/sdk/steps');
const { sendToSystem } = await import('@abuddy/sdk/events');
const { unbindFeHost } = await import('@abuddy/sdk/runtime/internals');

const application = {
  getSnapshot: () => ({
    context: { plugins: [{ id: 'default-setup/notes' }, { id: 'default-setup/settings' }], activePlugin: { id: 'default-setup/notes' }, defaultToggles: { canvas: false } },
  }),
  send: vi.fn(),
  system: { get: () => undefined },
};

const unhandled = vi.fn();
afterEach(() => {
  process.off('unhandledRejection', unhandled);
  unbindFeHost();
  vi.clearAllMocks();
});

const settingsAddress = resolveName('default-setup/settings');

it('throws, naming bindFeHost, before the renderer binds it', () => {
  expect(() => secretsClient.list()).toThrow('bindFeHost');
  expect(() => openPlugin(settingsAddress)).toThrow('bindFeHost');
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
    features: { notebookMain: { plugin: { label: 'Notebook' } as never, designation: 'notebook' } },
    steps: [note as never],
    tiptapPlugins: [mentions],
    dslTypes: { memo: memoDsl },
  });
  try {
    bindRendererHost(() => application as never);
    expect(getDslTypes().get('memo')).toBe(memoDsl);
    expect(tiptapPluginRegistry.getAll()).toEqual([mentions]);
    expect(stepRegistry.get('note')).toBe(note);
    expect(getDesignated('notebook')).toBe('fe-host-pack/notebookMain');
  } finally {
    fePacks.unregisterPackFE('fe-host-pack');
  }
  expect(getDslTypes().has('memo')).toBe(false);
});

it('binds before the application actor exists, naming it when SDK code reaches the actor too early', () => {
  let created: typeof application | undefined;
  bindRendererHost(() => created as never);
  expect(() => openPlugin(settingsAddress)).toThrow("The application actor isn't created yet");
  created = application;
  openPlugin(settingsAddress);
  expect(application.send).toHaveBeenCalledWith({ type: 'OPEN_PLUGIN', plugin: 'default-setup/settings', events: [] });
});

it('gives secretsClient the API client and openPlugin the application actor', async () => {
  bindRendererHost(() => application as never);
  await expect(secretsClient.list()).resolves.toMatchObject({ secrets: [] });
  expect(secretsList).toHaveBeenCalledTimes(1);
  openPlugin(settingsAddress);
  expect(application.send).toHaveBeenCalledWith({ type: 'OPEN_PLUGIN', plugin: 'default-setup/settings', events: [] });
});

// Whether a ref names a registered plugin is the shell's to answer, once pack frontends have loaded; a string that
// isn't a ref at all never reaches it
it('refuses a string that is not a ref, rather than asking the shell to open it', () => {
  bindRendererHost(() => application as never);
  expect(() => openPlugin('code')).toThrow(`"code" doesn't name a plugin`);
  expect(application.send).not.toHaveBeenCalled();
});

it("sends to systems over the API client, reporting a rejected send to the console, the app's log and a toast, without an unhandled rejection or the payload", async () => {
  bindRendererHost(() => application as never);
  process.on('unhandledRejection', unhandled);
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  mutate.mockRejectedValue(new Error('socket closed'));

  sendToSystem('notes', { type: 'SAVE_NOTE', body: 'secret text' });
  await new Promise(resolve => setTimeout(resolve, 0));

  expect(mutate).toHaveBeenCalledWith({ to: 'notes', event: { type: 'SAVE_NOTE', body: 'secret text' } });
  expect(unhandled).not.toHaveBeenCalled();
  const message = "Couldn't send SAVE_NOTE to notes: socket closed";
  expect(consoleError).toHaveBeenCalledWith(`[fe-client] ${message}`);
  expect(logWrite).toHaveBeenCalledWith({ level: 'error', source: 'fe-client', message });
  expect(toastError).toHaveBeenCalledWith(message);
  expect(JSON.stringify([consoleError.mock.calls, logWrite.mock.calls, toastError.mock.calls])).not.toContain('secret text');
});
