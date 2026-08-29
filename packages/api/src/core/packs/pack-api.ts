import { router, procedure } from '@/core/router/trpc';
import type { LoadedPack } from './pack-loader';

let _loadedPacks: LoadedPack[] = [];

export function setLoadedPacks(packs: LoadedPack[]) {
  _loadedPacks = packs;
}

export interface PackRegistryEntry {
  id: string;
  name: string;
  version: string;
  plugins: {
    id: string;
    entry: string;
    label: string;
    icon: string;
  }[];
}

function toRegistryEntries(packs: LoadedPack[]): PackRegistryEntry[] {
  return packs
    .filter(p => p.manifest.features?.some(f => f.plugin))
    .map(p => ({
      id: p.manifest.id,
      name: p.manifest.name,
      version: p.manifest.version,
      plugins: (p.manifest.features ?? [])
        .filter(f => f.plugin)
        .map(f => ({
          id: f.id,
          entry: f.plugin!.entry,
          label: f.plugin!.label,
          icon: f.plugin!.icon,
        })),
    }));
}

export const packsRouter = router({
  registry: procedure.query(() => {
    return toRegistryEntries(_loadedPacks);
  }),
});
