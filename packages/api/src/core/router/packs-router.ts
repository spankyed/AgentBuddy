// Lets declaration emit name tRPC's router types through a public entry (TS2742 under bundler resolution)
import type {} from '@trpc/server/unstable-core-do-not-import';
// The entry type comes from the packs barrel: AppRouter's declarations then don't reference the pack runtime
import type { LoadedPackEntry } from '@abuddy/host/packs';
import { getLoadedPackEntries } from '@abuddy/host/packs';
import { appPacks } from '@/setup/backend';
import { router, procedure } from './trpc';

export const packsRouter = router({
  /** The packs whose frontends the renderer loads: built-in packs, then external packs with frontend files */
  loaded: procedure.query((): LoadedPackEntry[] => getLoadedPackEntries(appPacks)),
});
