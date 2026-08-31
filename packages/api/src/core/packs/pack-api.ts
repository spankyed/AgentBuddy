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
    .filter(p => p.manifest.plugins?.some(d => d.plugin))
    .map(p => ({
      id: p.manifest.id,
      name: p.manifest.name,
      version: p.manifest.version,
      plugins: (p.manifest.plugins ?? [])
        .filter(d => d.plugin)
        .map(d => ({
          id: d.id,
          entry: d.plugin!.entry,
          label: d.plugin!.label,
          icon: d.plugin!.icon,
        })),
    }));
}

export const packsRouter = router({
  registry: procedure.query(() => {
    return toRegistryEntries(_loadedPacks);
  }),
});
