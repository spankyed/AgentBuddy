import { getCurrentScope, onScopeDispose, readonly, shallowRef } from 'vue';
// One settings resource per window, created before the shell and any pack frontend.
import { createWindowSettingsRuntime, type LoadedPackEntry, type FrontendSettingsBinding } from '@apackdev/host/fe';
import { newCall, type Message } from '@apackdev/sdk/events';
import { trpc } from '@/transport';

interface SettingsConnection {
  credential: Promise<string>;
  closed: AbortController;
}
let connection: SettingsConnection | undefined;

async function sendHostSettings(message: Message): Promise<void> {
  const accepted = connection;
  if (!accepted) throw new Error('The settings connection is unavailable.');
  const settingsCredential = await accepted.credential;
  assertConnected(accepted);
  await trpc.bus.send.mutate({ ...message, settingsCredential });
}

export const windowSettings = createWindowSettingsRuntime({
  send: sendHostSettings,
});
export const settingsPort = windowSettings.port;

export function resetApp(): Promise<void> {
  return sendHostSettings({ to: 'host/settings', sender: 'host/settings', call: newCall(), event: { type: 'RESET_APP' } });
}

function assertConnected(accepted: SettingsConnection): void {
  if (connection !== accepted || accepted.closed.signal.aborted) throw new Error('The settings connection changed.');
}

function releaseCredential(credential: string): void {
  void trpc.settings.close.mutate({ credential }).catch(error => console.error('Could not release settings access', error));
}

function snapshotReady(accepted: SettingsConnection): Promise<void> {
  return new Promise((resolve, reject) => {
    const stop = settingsPort.subscribe(check);
    const signal = accepted.closed.signal;
    signal.addEventListener('abort', check, { once: true });
    function check() {
      const status = settingsPort.status();
      if (!signal.aborted && connection === accepted && (status === 'loading' || status === 'replacing')) return;
      stop();
      signal.removeEventListener('abort', check);
      if (!signal.aborted && connection === accepted && status === 'ready') resolve();
      else reject(new Error('The settings connection is unavailable.'));
    }
    check();
  });
}

/** Trusted window bootstrap; pack loading starts only after authority and the validated snapshot arrive. */
export async function connectWindowSettings(): Promise<boolean> {
  disconnectWindowSettings();
  const accepted: SettingsConnection = { credential: trpc.settings.openHost.mutate(), closed: new AbortController() };
  connection = accepted;
  windowSettings.connected();
  try {
    await Promise.all([accepted.credential, snapshotReady(accepted)]);
    assertConnected(accepted);
    return true;
  } catch (error) {
    if (connection !== accepted) return false;
    disconnectWindowSettings();
    throw error;
  }
}

export function disconnectWindowSettings(): void {
  const previous = connection;
  connection = undefined;
  previous?.closed.abort();
  if (previous) void previous.credential.then(releaseCredential, () => {});
  windowSettings.disconnected();
}

/** Declaration acceptance precedes this call; issuance verifies the backend's accepted artifact too. */
export async function settingsForPack(pack: LoadedPackEntry): Promise<FrontendSettingsBinding> {
  if (!pack.artifactRevision) throw new Error(`Pack "${pack.id}" has no accepted artifact identity`);
  const accepted = connection;
  if (!accepted) throw new Error('The settings connection is unavailable.');
  await snapshotReady(accepted);
  const credential = await trpc.settings.openPack.mutate({
    id: pack.id, declarationRevision: pack.declarationRevision, artifactRevision: pack.artifactRevision,
  });
  const close = () => releaseCredential(credential);
  try {
    assertConnected(accepted);
    const binding = windowSettings.bindPort(async message => {
      assertConnected(accepted);
      await trpc.bus.send.mutate({ ...message, settingsCredential: credential });
    });
    let active = true;
    return {
      port: binding.port,
      dispose() {
        if (!active) return;
        active = false;
        binding.dispose();
        close();
      },
    };
  } catch (error) {
    close();
    throw error;
  }
}

/** Host forms follow the same window snapshot as pack consumers. */
export function useWindowSettingsSnapshot() {
  if (!getCurrentScope()) throw new Error('useWindowSettingsSnapshot runs in a component or effect scope');
  const snapshot = shallowRef(windowSettings.getSnapshot());
  const stop = settingsPort.subscribe(() => { snapshot.value = windowSettings.getSnapshot(); });
  onScopeDispose(stop);
  return readonly(snapshot);
}
