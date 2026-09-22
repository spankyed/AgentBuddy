// The app shell in a pack's unit tests: the host's own shell machine, run over the in-memory bus the harness's test
// apps use, with the test pack's plugins registered, so a pack's frontend (navigation, the shell's state, sends to
// its systems) is tested as the app runs it rather than against a stand-in.
import { createActor, type AnyActorRef, type AnyStateMachine } from 'xstate';
import { createFePackRegistry, createShellMachine, describeFailure, HOST, type ShellClient, type ShellConnection } from '@abuddy/host/fe';
import type { Message } from '@abuddy/sdk/events';
import { resolveName } from '@abuddy/sdk/ids';
import type { HostShell, PluginDefinition } from '@abuddy/sdk/fe';
import { startFeTestRuntime, testRootEvents } from '@abuddy/sdk/testing';
import { _isFeHostBound, type FePackRegistryView, type PackExtensionsView } from '@abuddy/sdk/runtime';

/** One of the pack's plugins, as a test registers it: its state machine, and whatever else of its definition it needs */
export type TestPlugin = { state: AnyStateMachine } & Partial<Omit<PluginDefinition, 'state'>>;

export interface StartShellOptions {
  /**
   * The pack's plugins the shell runs, by feature id: each one's state machine. A plugin's components import `.vue`
   * files, which a unit test doesn't load, so the test passes the machines rather than the plugin modules
   */
  plugins: Record<string, TestPlugin>;
  /** The feature whose plugin the shell opens first, as the pack's default; the first listed when unset */
  defaultPlugin?: string;
  /** Roles the features play (`abuddy.json` `features[].designation`), by feature id */
  designations?: Record<string, string>;
}

export interface TestShell {
  /**
   * The shell, as frontend code reaches it (the SDK's `HostShell`). Published declarations name only published
   * packages, and the shell's machine is the host's
   */
  actor: HostShell;
  /** The ref of the plugin open */
  opened(): string;
  /** A plugin's running actor, named as the pack names it (its own by feature id, any other as `<packId>/<featureId>`) */
  plugin(name: string): AnyActorRef;
  /** What the shell told the user went wrong: `title` and `detail`, a toast or the error page, in order */
  notices: Array<{ title: string; detail?: string }>;
  /** Stops the shell and forgets the frontend host it bound; the harness does it after each test */
  stop(): void;
}

const running = new Set<TestShell>();

/**
 * `frontend`, with the lookups it shares with the backend (roles, steps, artifacts, blocks) answered by `backend`
 * first. The SDK reads those through a bound frontend host whenever one is bound, which in the renderer is right; in
 * a test that also runs the pack's systems, it would hide from them every role and step the pack registered, the
 * brain and the `llm` step included. The frontend's own come second, for a role only a plugin in this test plays.
 */
function backendFirst(frontend: FePackRegistryView, backend: PackExtensionsView): FePackRegistryView {
  return {
    plugins: () => frontend.plugins(),
    defaultPlugin: () => frontend.defaultPlugin(),
    tiptapPlugins: () => frontend.tiptapPlugins(),
    appExtension: (slot) => frontend.appExtension(slot),
    dslTypes: () => frontend.dslTypes(),
    designation: (role) => backend.designation(role) ?? frontend.designation(role),
    step: (type) => backend.step(type) ?? frontend.step(type),
    steps: () => backend.steps(),
    artifact: (type) => backend.artifact(type) ?? frontend.artifact(type),
    artifacts: () => backend.artifacts(),
    block: (type) => backend.block(type) ?? frontend.block(type),
    blocks: () => backend.blocks(),
  };
}

/** Stops every shell a test started; the harness calls it after each test */
export function stopRunningShells(): void {
  for (const shell of [...running]) shell.stop();
}

/**
 * Starts the app shell with `options.plugins` registered as `packId`'s and binds the frontend host to it, so
 * `navigateToPlugin`, `openPlugin` and `useShell()` reach it. Its client is the harness's bus: what the shell and
 * `sendToSystem` send reaches a test app's systems, and what those systems send plugins reaches the plugins' actors.
 * Lookups the backend shares with it (roles, steps, artifacts, blocks) read `backend` first. Resolves once the shell
 * is connected and has read the (empty) loaded packs, as a window is once the app is up.
 */
export async function startShell(packId: string, options: StartShellOptions, backend: PackExtensionsView): Promise<TestShell> {
  if (_isFeHostBound()) {
    throw new Error(
      'A frontend host is already bound in this test file: startShell() binds its own, so use it in place of '
      + 'startFeTestRuntime(), and start one shell per test (the harness stops it after each)',
    );
  }
  const ids = Object.keys(options.plugins);
  if (ids.length === 0) throw new Error('startShell() needs at least one plugin: the shell opens one when it starts');
  const defaultPlugin = options.defaultPlugin ?? ids[0];
  if (!ids.includes(defaultPlugin)) throw new Error(`defaultPlugin "${defaultPlugin}" isn't one of the plugins: ${ids.join(', ')}`);

  const packs = createFePackRegistry();
  packs.registerPackFE({
    id: packId,
    features: Object.fromEntries(ids.map((id) => [id, {
      plugin: { label: id, icon: 'Zap', canvas: {}, ...options.plugins[id] } as PluginDefinition,
      ...(options.designations?.[id] && { designation: options.designations[id] }),
      ...(id === defaultPlugin && { default: true as const }),
    }])),
  });

  const stops: Array<() => void> = [];
  // What the systems send while the shell is starting (a plugin asking for its data as it's spawned is answered at
  // once over the in-memory bus) is held until the shell subscribes, as a socket would deliver it later
  let connection: ShellConnection | undefined;
  const held: Message[] = [];
  stops.push(testRootEvents.onOutgoing((message) => {
    if (connection) connection.onMessage(message);
    else held.push(message);
  }));
  const client: ShellClient = {
    send: (message) => testRootEvents.emitIncoming(message),
    subscribe: (next) => {
      // Connected once the shell has started, and told the app's state as a window is on connecting
      queueMicrotask(() => {
        connection = next;
        next.onConnected();
        next.onMessage({ to: HOST.application, event: { type: 'CLIENT_CONNECTED', hasOnboarded: true, pluginVisibility: {} } });
        for (const message of held.splice(0)) next.onMessage(message);
      });
      return () => { if (connection === next) connection = undefined; };
    },
    packClientReady: async (id) => testRootEvents.emitPackClientConnected(id),
    // The test's plugins are registered up front, as a built-in pack's are: no external pack frontends to load
    loadedPacks: async () => [],
    describeConnection: async () => 'A unit test\'s shell: its client is the harness\'s in-memory bus',
  };

  const notices: TestShell['notices'] = [];
  const actor = createActor(createShellMachine({
    packs,
    client,
    packFrontends: { load: async () => null, unload: () => {} },
    storage: { loadPanelSizes: () => undefined, savePanelSizes: () => {} },
    notify: {
      error: (title, detail) => { notices.push({ title, detail }); },
      errorPage: (title, detail) => { notices.push({ title, detail: describeFailure(detail) }); },
    },
  }), { systemId: HOST.application, input: { ownsLastActivePlugin: false } });
  // Bound before the shell starts: starting it spawns the plugins' actors, which may reach the frontend host
  stops.push(startFeTestRuntime({ application: actor, client, packs: backendFirst(packs, backend) }));
  const started = actor.start();
  stops.unshift(() => started.stop());

  const shell: TestShell = {
    actor: started,
    opened: () => started.getSnapshot().context.activePlugin.id,
    plugin: (name) => {
      const ref = resolveName(name, packId);
      const plugin = started.system.get(ref) as AnyActorRef | undefined;
      if (!plugin) throw new Error(`No plugin is running at "${ref}"`);
      return plugin;
    },
    notices,
    stop: () => {
      if (!running.delete(shell)) return;
      for (const stop of stops) stop();
    },
  };
  running.add(shell);

  // Connected, and the loaded packs read: until they are, the shell holds a plugin it's asked for that isn't there
  await new Promise((resolve) => setTimeout(resolve, 0));
  return shell;
}
