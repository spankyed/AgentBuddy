// Lets declaration emit name tRPC's router types through a public entry (TS2742 under bundler resolution)
import type {} from '@trpc/server/unstable-core-do-not-import';
// The entry type comes from the packs barrel: AppRouter's declarations then don't reference the pack runtime
import type { LoadedPackEntry } from '@apackdev/host/packs';
import { getLoadedPackEntries, PACK_LAYOUT } from '@apackdev/host/packs';
import { devServerUrl } from '@apackdev/host/packs/dev-server';
import { resolveAppEnvironment } from '@apackdev/sdk/env';
import { appPacks } from '@/runtime';
import { router, procedure } from './trpc';

export const packsRouter = router({
  /** The packs whose frontends the renderer loads: built-in packs, then external packs with frontend files */
  loaded: procedure.query((): LoadedPackEntry[] => {
    const environment = resolveAppEnvironment();
    return getLoadedPackEntries(appPacks).map(pack => {
      const url = environment.env === 'development' ? devServerUrl(environment.userDataDir, pack.id, '') : null;
      return url ? { ...pack, feEntry: PACK_LAYOUT.feEntry, developmentBaseUrl: url } : pack;
    });
  }),
});
