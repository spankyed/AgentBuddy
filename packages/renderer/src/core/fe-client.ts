// The window's client to the API: the SDK's sends and the shell's subscription, over tRPC and the Electron main
// process's report of the API's status. Nothing else in the renderer calls the bus or reads the loaded packs.
import type { ShellClient } from '@abuddy/host/fe';
import { trpc, reconnectApiClient } from '@/core/trpc';
import { globalToast } from '@/core/toast';

/** What the Electron main process reports about the API process */
type ApiStatusEvent = { type: string; port?: number; restarting?: boolean; error?: unknown; message?: string; stack?: string; source?: string };

/** Why the API process stopped or failed, as the error page shows it */
function failureOf(event: ApiStatusEvent): string {
  if (event.type === 'api:fatal') {
    return event.stack ? `[${event.source}] ${event.message}\n\n${event.stack}` : `[${event.source}] ${event.message}`;
  }
  const error = event.error as { message?: string; stack?: string } | string | undefined;
  const detail = (typeof error === 'object' ? error?.message : error) || 'The backend process stopped unexpectedly.';
  const stack = typeof error === 'object' ? error?.stack : undefined;
  return stack ? `${detail}\n\n${stack}` : detail;
}

export const feClient: ShellClient = {
  send: (message) => {
    // Caught, since an unhandled rejection shows the error page. The report leaves out the payload, and goes to
    // the app's log (and so diagnostics) as well as the console
    trpc.bus.send.mutate(message).catch((error: unknown) => {
      const report = `Couldn't send ${message.event.type} to ${message.to}: ${error instanceof Error ? error.message : String(error)}`;
      console.error(`[fe-client] ${report}`);
      window.electronAPI?.rendererLog?.write({ level: 'error', source: 'fe-client', message: report }).catch(() => {});
      globalToast.error(report);
    });
  },

  subscribe: (connection) => {
    // The backend may have failed for good before this window started listening
    window.electronAPI?.apiStatus?.getStatus().then((status) => {
      if (status.error && !status.running && status.restartAttempts >= 3) connection.onFailed(String(status.error));
    });

    const subscribeToBus = () => trpc.bus.sub.subscribe(undefined, {
      // Each time this window's subscription is established: the server has sent this connection's
      // CLIENT_CONNECTED. Another window connecting broadcasts CLIENT_CONNECTED too, but not this.
      onStarted: () => connection.onConnected(),
      // The socket dropped: the subscription is established again when it reconnects
      onConnectionStateChange: ({ state }) => {
        if (state === 'connecting') connection.onDisconnected();
      },
      onError: (error: unknown) => {
        console.error('Error in subscription:', error);
        connection.onFailed(String(error));
      },
      onData: (message) => connection.onMessage(message),
    });
    let subscription = subscribeToBus();

    // The main process tells this window at once when the API stops, fails or moves
    const stopStatus = window.electronAPI?.apiStatus?.onEvent((event: ApiStatusEvent) => {
      if (event.type === 'api:stopped' && event.restarting) return;
      if (event.type === 'api:started') {
        // A restart can land on a different port; the old subscription died with the old socket
        if (event.port && reconnectApiClient(event.port)) {
          subscription.unsubscribe();
          subscription = subscribeToBus();
        }
        return;
      }
      if (event.type === 'api:fatal' || event.type === 'api:stopped' || event.type === 'api:error') {
        connection.onFailed(failureOf(event));
      }
    });

    return () => {
      subscription.unsubscribe();
      stopStatus?.();
    };
  },

  packClientReady: (packId) => trpc.bus.packClientReady.mutate({ packId }),

  loadedPacks: () => trpc.packs.loaded.query(),

  describeConnection: () => window.electronAPI?.apiStatus?.getStatus()
    .then((status) => [
      'The backend did not respond within 30 seconds.',
      '',
      `Startup ID: ${status.startupId || window.electronAPI?.startupId || 'unknown'}`,
      `API running: ${status.running ? 'yes' : 'no'}`,
      `API port: ${status.port ?? 'unknown'}`,
      `Restart attempts: ${status.restartAttempts}`,
      status.error ? `Last backend error: ${typeof status.error === 'string' ? status.error : status.error.message}` : undefined,
      '',
      `Main log: ${status.logPath}`,
      `Renderer log: ${status.rendererLogPath}`,
      `App events log: ${status.appEventsLogPath}`,
    ].filter(Boolean).join('\n'))
    .catch(() => 'The backend did not respond within 30 seconds and API status could not be read.')
    ?? Promise.resolve('The backend did not respond within 30 seconds, and this window has no API status to read.'),
};
