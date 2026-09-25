// The renderer's frontend binding: SDK frontend code reaches the API client and the application actor only through it
import { afterEach, expect, it, vi } from 'vitest';

const mutate = vi.hoisted(() => vi.fn<(event: unknown) => Promise<void>>());
const secretsList = vi.hoisted(() => vi.fn(() => Promise.resolve({ secrets: [], status: { protection: 'os-keystore', backend: 'test' } })));
const toastError = vi.hoisted(() => vi.fn());

vi.mock('@/transport', () => ({ trpc: { bus: { send: { mutate } }, secrets: { list: { query: secretsList } } } }));
vi.mock('@/adapters/toast', () => ({ globalToast: { error: toastError } }));

const logWrite = vi.hoisted(() => vi.fn(() => Promise.resolve()));
(window as unknown as { electronAPI: unknown }).electronAPI = { rendererLog: { write: logWrite } };

const { bindRendererHost } = await import('@/runtime');
const { fePacks } = await import('@/runtime/packs');
const { resolveName } = await import('@abuddy/sdk/ids');
const { secretsClient, untypedOpenPlugin, getDslTypes, getDesignated, tiptapPluginRegistry } = await import('@abuddy/sdk/fe');
const { stepRegistry } = await import('@abuddy/sdk/steps');
const { untypedSendToSystem } = await import('@abuddy/sdk/events');
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

it("gives the SDK's frontend lookups the window's registered pack frontends", () => {
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
  // Read by the binding below before it is assigned, which is the case under test, so `const` would not compile.
  // eslint-disable-next-line prefer-const
  let created: typeof application | undefined;
  bindRendererHost(() => created as never);
  expect(() => untypedOpenPlugin(settingsAddress)).toThrow(/isn't created yet/);
  created = application;
  untypedOpenPlugin(settingsAddress);
  expect(application.send).toHaveBeenCalledWith({ type: 'OPEN_PLUGIN', plugin: 'default-setup/settings', events: [] });
});

it('gives secretsClient the API client and untypedOpenPlugin the application actor', async () => {
  bindRendererHost(() => application as never);
  await expect(secretsClient.list()).resolves.toMatchObject({ secrets: [] });
  untypedOpenPlugin(settingsAddress);
  expect(application.send).toHaveBeenCalledWith({ type: 'OPEN_PLUGIN', plugin: 'default-setup/settings', events: [] });
});

// Whether a ref names a registered plugin is the shell's to answer, once pack frontends have loaded; a string that
// isn't a ref at all never reaches it
it('refuses a string that is not a ref, rather than asking the shell to open it', () => {
  bindRendererHost(() => application as never);
  expect(() => untypedOpenPlugin('code')).toThrow(`"code" doesn't name a plugin`);
  expect(application.send).not.toHaveBeenCalled();
});

it("sends to systems over the API client, reporting a rejected send to the console, the app's log and a toast, without an unhandled rejection or the payload", async () => {
  bindRendererHost(() => application as never);
  process.on('unhandledRejection', unhandled);
  const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
  mutate.mockRejectedValue(new Error('socket closed'));

  untypedSendToSystem('notes', { type: 'SAVE_NOTE', body: 'secret text' });
  await new Promise(resolve => setTimeout(resolve, 0));

  expect(mutate).toHaveBeenCalledWith({ to: 'notes', event: { type: 'SAVE_NOTE', body: 'secret text' } });
  expect(unhandled).not.toHaveBeenCalled();
  expect(consoleError).toHaveBeenCalledWith(expect.stringContaining('SAVE_NOTE'));
  expect(logWrite).toHaveBeenCalledWith(expect.objectContaining({ level: 'error', source: 'fe-client' }));
  expect(toastError).toHaveBeenCalledWith(expect.stringContaining('SAVE_NOTE'));
  expect(JSON.stringify([consoleError.mock.calls, logWrite.mock.calls, toastError.mock.calls])).not.toContain('secret text');
});
