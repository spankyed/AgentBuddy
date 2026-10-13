// External packs' frontends, loaded by a child actor: it reads the loaded packs and loads the frontend of each this
// window hasn't loaded, reporting each one as it finishes and the run as a whole when it's done.
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
 * Loads the frontends of the loaded packs not in `loadedPackIds`. A failed read of the loaded packs leaves them
 * unloaded: the shell runs the loader again whenever its subscription is established, so the next connection picks
 * them up. One pack that throws doesn't stop the others; it's reported as its own failure, since the loaded packs
 * were read and only that pack is missing.
 */
export function packFrontendLoader(client: ShellClient, packFrontends: ShellPackFrontends) {
  return fromCallback<ShellEvent, { loadedPackIds: string[] }>(({ sendBack, input }) => {
    let stopped = false;
    const controller = new AbortController();
    const failedPacks: { packId: string; error: string }[] = [];

    client.loadedPacks().then(async (loadedPacks) => {
      for (const pack of loadedPacks) {
        if (stopped) return;
        if (input.loadedPackIds.includes(pack.id)) continue;
        try {
          // null: the pack has no frontend code, so there's nothing to merge or ask startup data for
          const plugins = await packFrontends.load(pack, controller.signal);
          if (stopped) return;
          sendBack({ type: 'PACK_FRONTEND_LOADED', packId: pack.id, plugins });
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
export function announcePackClientReady(client: ShellClient, packId: string): void {
  client.packClientReady(packId).catch((err: unknown) => {
    console.warn(`[shell] Couldn't request startup data for pack ${packId}:`, err);
  });
}
