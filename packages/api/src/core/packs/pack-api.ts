import { router, procedure } from '@/core/router/trpc';
import type { LoadedPack } from './pack-loader';

let _loadedPacks: LoadedPack[] = [];

export function setLoadedPacks(packs: LoadedPack[]) {
  _loadedPacks = packs;
}

export interface PackBundleEntry {
  id: string;
  name: string;
  version: string;
  feEntry?: string;
  feStyles?: string;
  plugins: {
    id: string;
    entry: string;
    label: string;
    icon: string;
  }[];
}

function toRegistryEntries(packs: LoadedPack[]): PackBundleEntry[] {
  return packs
    .filter(p => p.manifest.fe?.entry || p.manifest.fe?.styles || p.manifest.plugins?.some(d => d.plugin))
    .map(p => ({
      id: p.manifest.id,
      name: p.manifest.name,
      version: p.manifest.version,
      feEntry: p.manifest.fe?.entry,
      feStyles: p.manifest.fe?.styles,
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
