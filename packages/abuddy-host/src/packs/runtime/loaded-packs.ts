// The external and built-in packs the app loaded, and the loaded-packs entries the renderer loads frontends from.
// Imports nothing else from packs/runtime: the app bus reads it (clientLoadedPacks).
import type { AnyStateMachine } from 'xstate';
import type { PackBootHooks, PackEARS, PackFeatureDef, PackMigration, PackRegistration } from '@abuddy/sdk/framework';
import type { StepDefinition } from '@abuddy/sdk/steps';
import type { ArtifactDefinition } from '@abuddy/sdk/artifacts';
import type { BlockDefinition } from '@abuddy/sdk/blocks';
import { packFrontendFiles, type LoadedPackEntry } from '../pack-layout.ts';
import type { BuiltInPackInfo, PackManifest } from '../pack-discovery.ts';

/** An external pack's loaded runtime */
export interface LoadedPack {
  manifest: PackManifest;
  dir: string;
  systems: Map<string, { machine: AnyStateMachine; events: Set<string> }>;
  services?: Record<string, unknown>;
  steps?: StepDefinition[];
  artifacts?: ArtifactDefinition[];
  blocks?: BlockDefinition[];
  ears?: PackEARS;
  repositories?: PackRegistration['repositories'];
  boot?: PackBootHooks;
  migrations?: PackMigration[];
  seedHooks?: PackRegistration['seedHooks'];
  /** The pack's seeders, which seeding its compiled seeds runs */
  seeders?: PackRegistration['seeders'];
  /** The slash commands the pack declares (abuddy.json `commands`) */
  commands?: PackRegistration['commands'];
  /** Feature definitions, with each feature's default settings */
  features?: PackFeatureDef[];
}

let _loadedPacks: LoadedPack[] = [];
let _builtInPacks: BuiltInPackInfo[] = [];

/** The loaded external packs */
export function getLoadedPacks(): LoadedPack[] {
  return _loadedPacks;
}

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
 * from the registry entries below, and then asks for their startup data
 */
export function getPacksWithClientLoadedFrontends(): string[] {
  return _loadedPacks.filter(p => packFrontendFiles(p.dir).entry).map(p => p.manifest.id);
}

/** The built-in packs the app loaded */
export function getBuiltInPackInfos(): BuiltInPackInfo[] {
  return _builtInPacks;
}

export function setBuiltInPackInfos(packs: BuiltInPackInfo[]) {
  _builtInPacks = packs;
}

/** The built-in packs, then the loaded external packs with frontend files */
export function getLoadedPackEntries(): LoadedPackEntry[] {
  return [
    ..._builtInPacks.map(p => ({ id: p.id, name: p.name, version: p.version, builtIn: true })),
    ..._loadedPacks.flatMap(p => {
      const { entry, styles } = packFrontendFiles(p.dir);
      if (!entry && !styles) return [];
      return [{ id: p.manifest.id, name: p.manifest.name, version: p.manifest.version, feEntry: entry, feStyles: styles }];
    }),
  ];
}
