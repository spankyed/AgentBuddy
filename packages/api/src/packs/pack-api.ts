import { router, procedure } from '@/core/router/trpc';
import type { LoadedPack } from './pack-loader';
import type { BuiltInPackInfo } from './pack-loader';

let _loadedPacks: LoadedPack[] = [];
let _builtInPacks: BuiltInPackInfo[] = [];

export function setLoadedPacks(packs: LoadedPack[]) {
  _loadedPacks = packs;
}

export function updateLoadedPack(pack: LoadedPack) {
  const idx = _loadedPacks.findIndex(p => p.manifest.id === pack.manifest.id);
  if (idx >= 0) {
    _loadedPacks[idx] = pack;
  } else {
    _loadedPacks.push(pack);
  }
}

export function removeLoadedPack(packId: string) {
  _loadedPacks = _loadedPacks.filter(p => p.manifest.id !== packId);
}

export function setBuiltInPacksForRegistry(packs: BuiltInPackInfo[]) {
  _builtInPacks = packs;
}

export interface PackBundleEntry {
  id: string;
  name: string;
  version: string;
  builtIn?: boolean;
  feEntry?: string;
  feStyles?: string;
  plugins: {
    id: string;
    entry: string;
    label: string;
    icon: string;
    designation?: string;
  }[];
}

function toRegistryEntries(packs: LoadedPack[]): PackBundleEntry[] {
  return packs
    .filter(p => {
      const entries = p.manifest.features;
      return p.manifest.fe?.entry || p.manifest.fe?.styles || entries?.some(d => d.plugin);
    })
    .map(p => {
      const entries = p.manifest.features ?? [];
      return {
        id: p.manifest.id,
        name: p.manifest.name,
        version: p.manifest.version,
        feEntry: p.manifest.fe?.entry,
        feStyles: p.manifest.fe?.styles,
        plugins: entries
          .filter(d => d.plugin)
          .map(d => ({
            id: d.id,
            entry: d.plugin!.entry,
            label: d.plugin!.label,
            icon: d.plugin!.icon,
            designation: d.designation,
          })),
      };
    });
}

function toBuiltInRegistryEntries(packs: BuiltInPackInfo[]): PackBundleEntry[] {
  return packs.map(p => ({
    id: p.id,
    name: p.name,
    version: p.version,
    builtIn: true,
    plugins: [],
  }));
}

export const packsRouter = router({
  registry: procedure.query(() => {
    return [
      ...toBuiltInRegistryEntries(_builtInPacks),
      ...toRegistryEntries(_loadedPacks),
    ];
  }),
});
