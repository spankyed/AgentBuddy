import { packFrontendFiles, type BuiltInPackInfo } from '@abuddy/host/packs';
import { router, procedure } from '@/core/router/trpc';
import type { LoadedPack } from './pack-loader';

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

/**
 * The loaded external packs with frontend code (a runtime/fe.js): the renderer loads it after connecting,
 * from the registry below, and then asks for their startup data
 */
export function getPacksWithClientLoadedFrontends(): string[] {
  return _loadedPacks.filter(p => packFrontendFiles(p.dir).entry).map(p => p.manifest.id);
}

export function setBuiltInPacksForRegistry(packs: BuiltInPackInfo[]) {
  _builtInPacks = packs;
}

export interface PackBundleEntry {
  id: string;
  name: string;
  version: string;
  builtIn?: boolean;
  /** The bundle's runtime/fe.js, when it has one */
  feEntry?: string;
  /** The bundle's runtime/fe.css, when it has one */
  feStyles?: string;
}

function toRegistryEntries(packs: LoadedPack[]): PackBundleEntry[] {
  return packs.flatMap(p => {
    const { entry, styles } = packFrontendFiles(p.dir);
    if (!entry && !styles) return [];
    return [{ id: p.manifest.id, name: p.manifest.name, version: p.manifest.version, feEntry: entry, feStyles: styles }];
  });
}

function toBuiltInRegistryEntries(packs: BuiltInPackInfo[]): PackBundleEntry[] {
  return packs.map(p => ({ id: p.id, name: p.name, version: p.version, builtIn: true }));
}

export const packsRouter = router({
  registry: procedure.query(() => {
    return [
      ...toBuiltInRegistryEntries(_builtInPacks),
      ...toRegistryEntries(_loadedPacks),
    ];
  }),
});
