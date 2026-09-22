// The window's client to the API as the app shell uses it: the SDK's part (sending to backend systems) and what only
// the shell reads. The renderer implements it over its API client; tests pass a fake.
import type { Message } from '@abuddy/sdk/events';
import type { FeClient } from '@abuddy/sdk/runtime';
import type { LoadedPackEntry } from '../packs/pack-layout.ts';

/** What the shell hears from its subscription to the bus */
export interface ShellConnection {
  /**
   * The subscription is established: the server has sent this connection's CLIENT_CONNECTED. Each reconnection
   * establishes it again.
   */
  onConnected(): void;
  /** The connection dropped; `onConnected` follows when it's back */
  onDisconnected(): void;
  /** A message a backend system sent a plugin, exactly as sent */
  onMessage(message: Message): void;
  /** The backend failed and won't recover by itself: why, for the error page */
  onFailed(error: string): void;
}

export interface ShellClient extends FeClient {
  /** Subscribes to what the backend sends this window; returns the unsubscribe */
  subscribe(connection: ShellConnection): () => void;
  /** Asks a pack's systems for their startup data, once this window has its frontend */
  packClientReady(packId: string): Promise<void>;
  /** The packs the backend loaded, the built-in ones first */
  loadedPacks(): Promise<LoadedPackEntry[]>;
  /** What the platform knows about the backend, for the error page when it doesn't answer */
  describeConnection(): Promise<string>;
}
