// One cancellable read/load cycle: reconcile absent owners, accept new frontends, and refresh existing
// resources on reconnect. Refused candidates leave accepted resources to their owner.
import { fromCallback } from 'xstate';
import type { ShellClient } from '../../../fe/client.ts';
import type { ShellEvent } from './types.ts';
import type { ShellPackFrontends } from '../../../fe/pack-frontends.ts';
import { errorMessage } from '@apackdev/sdk/utils/pure';

export const PACK_FRONTEND_LOADER_ID = 'packFrontendLoader';

function messageOf(err: unknown): string {
  return errorMessage(err);
}

/**
 * Ordinary reads skip matching accepted lifetimes; changed revisions and reconnect refresh their resources.
 * Only a successful authoritative list can remove an owner; failed reads and candidates preserve incumbents.
 */
export function packFrontendLoader(client: ShellClient, packFrontends: ShellPackFrontends) {
  return fromCallback<ShellEvent, { acceptedPackRuntimes: Record<string, string>; refresh: boolean }>(({ sendBack, input }) => {
    let stopped = false;
    const controller = new AbortController();
    const failedPacks: { packId: string; error: string }[] = [];

    client.loadedPacks().then(async (loadedPacks) => {
      if (stopped) return;
      const present = new Set(loadedPacks.map(pack => pack.id));
      for (const packId of Object.keys(input.acceptedPackRuntimes)) {
        if (!present.has(packId)) sendBack({ type: 'PACK_PLUGINS_UNLOADED', packId });
      }
      for (const pack of loadedPacks) {
        if (stopped) return;
        if (!input.refresh && input.acceptedPackRuntimes[pack.id] === pack.runtimeRevision) continue;
        try {
          // null: the pack has no frontend code, so there's nothing to merge or ask startup data for
          const plugins = await packFrontends.load(pack, controller.signal);
          if (stopped) return;
          sendBack({ type: 'PACK_FRONTEND_LOADED', packId: pack.id, runtimeRevision: pack.runtimeRevision, plugins });
        } catch (err: unknown) {
          if (stopped) return;
          failedPacks.push({ packId: pack.id, error: messageOf(err) });
        }
      }
      if (!stopped) sendBack({ type: 'PACK_FRONTENDS_SETTLED', failedPacks });
    }).catch((err: unknown) => {
      if (!stopped) sendBack({ type: 'PACK_FRONTENDS_SETTLED', loadedPacksError: messageOf(err), failedPacks });
    });

    return () => { stopped = true; controller.abort(); };
  });
}

/**
 * Asks a pack's systems for their startup data. A connection's CLIENT_CONNECTED skips the systems of every pack
 * with frontend code, the ones the app ships included, since that frontend loads after it; each is asked for once
 * its load finished, whether it added plugins or not, so its systems without plugins get it too.
 */
export function announcePackClientReady(client: ShellClient, packId: string, runtimeRevision: string): void {
  client.packClientReady(packId, runtimeRevision).catch((err: unknown) => {
    console.warn(`[shell] Couldn't request startup data for pack ${packId}:`, err);
  });
}
