// The external and built-in packs the app loaded, and the loaded-packs entries the renderer loads frontends from.
// Imports nothing else from packs/runtime: the app bus reads it (clientLoadedPacks).
//
// Held at module scope, unlike the registry beside it, which is an instance per app (`createPackRegistry()`,
// with `tests/packs/registry-state.spec.ts` keeping its modules free of state). The two hold overlapping
// answers to "which packs does this app have" and are written at the same four moments — boot, activate,
// teardown, reload — so a divergence would be a bug in one of those paths, not a file going stale: both
// live in memory and neither outlives the process. What the asymmetry does cost is isolation. Two registries
// in one process share this list, so a second app, or a test harness building one per file in a shared
// worker, sees the first's loaded packs.
//
// Moving it onto the registry is the consistent shape and reaches 18 call sites across nine files, the
// migrations runner among them, for a fault nothing has yet hit. Worth doing when something does, or when
// one of those files is being changed anyway.
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
 * from the installed-packs entries below, and then asks for their startup data
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
