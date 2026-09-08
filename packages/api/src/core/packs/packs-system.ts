import * as fs from 'fs';
import * as path from 'path';
import { setup } from 'xstate';
import { defineSystem } from '@abuddy/sdk/framework';
import { bus } from '@abuddy/sdk/ids';
import { emit } from '@abuddy/sdk/helpers';
import { readPackRegistry, writePackRegistry, addToRegistry, removeFromRegistry } from './pack-registry';
import type { PackRegistryEntry } from './pack-registry';
import { installPack as runInstall, uninstallPack as runUninstall } from './pack-installer';
import { getPackContributions, type PackContributions } from './pack-registration';

export interface PackInfo {
  id: string;
  name: string;
  version: string;
  enabled: boolean;
  builtIn: boolean;
  entityCount: number;
  hasFeEntry: boolean;
  hostVersion?: string;
  description?: string;
  entities: Record<string, string>;
  relKinds: Record<string, string>;
  plugins: string[];
  permissions: string[];
  systems: string[];
  services: string[];
  steps: string[];
  artifacts: string[];
  blocks: string[];
  migrationCount: number;
  bootHooks: string[];
  dir?: string;
  registeredAt?: string;
}

interface BuiltInPackEntry {
  id: string;
  name: string;
  version: string;
  dir: string;
}

let _builtInPacks: BuiltInPackEntry[] = [];

export function setBuiltInPacks(packs: BuiltInPackEntry[] | undefined): void {
  _builtInPacks = packs ?? [];
}

type IncomingPacksEvents =
  | { type: 'INSTALL_PACK'; packSlug: string; source?: string }
  | { type: 'UNINSTALL_PACK'; packId: string }
  | { type: 'TOGGLE_PACK_ENABLED'; packId: string }
  | { type: 'GET_INSTALLED_PACKS' }

type OutgoingPacksEvents =
  | { type: 'PACKS_LIST'; packs: PackInfo[] }
  | { type: 'PACK_INSTALL_STARTED'; packSlug: string }
  | { type: 'PACK_INSTALL_COMPLETE'; packSlug: string; packId: string; packName: string; version: string }
  | { type: 'PACK_INSTALL_FAILED'; packSlug: string; error: string }
  | { type: 'PACK_UNINSTALL_COMPLETE'; packId: string }
  | { type: 'PACK_UNINSTALL_FAILED'; packId: string; error: string }
  | { type: 'PACK_ENABLED_CHANGED'; packId: string; enabled: boolean }

export const packsSpec = defineSystem('packs')<IncomingPacksEvents, OutgoingPacksEvents>();
export const packs = packsSpec.id;

function readManifest(dir: string): Record<string, any> | null {
  try {
    const manifestPath = path.join(dir, 'abuddy.json');
    if (fs.existsSync(manifestPath)) {
      return JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    }
  } catch {}
  return null;
}

function mergeContributions(base: Omit<PackInfo, keyof PackContributions>, contrib: PackContributions | null): PackInfo {
  return {
    ...base,
    systems: contrib?.systems ?? [],
    services: contrib?.services ?? [],
    steps: contrib?.steps ?? [],
    artifacts: contrib?.artifacts ?? [],
    blocks: contrib?.blocks ?? [],
    relKinds: contrib?.relKinds ?? {},
    migrationCount: contrib?.migrationCount ?? 0,
    bootHooks: contrib?.bootHooks ?? [],
  };
}

function toExternalPackInfoList(entries: PackRegistryEntry[]): PackInfo[] {
  return entries.map(e => {
    const manifest = readManifest(e.dir);
    const entities = manifest?.entities ?? {};
    const contrib = getPackContributions(e.id);
    return mergeContributions({
      id: e.id,
      name: e.name,
      version: e.version,
      enabled: e.enabled,
      builtIn: false,
      entityCount: Object.keys(entities).length,
      hasFeEntry: !!manifest?.fe?.entry || (contrib?.systems ?? []).length > 0,
      hostVersion: manifest?.hostVersion,
      description: manifest?.description,
      entities,
      plugins: (manifest?.plugins ?? []).map((p: any) => p.id),
      permissions: manifest?.permissions ?? [],
      dir: e.dir,
      registeredAt: e.registeredAt,
    }, contrib);
  });
}

function toBuiltInPackInfoList(): PackInfo[] {
  return _builtInPacks.map(p => {
    const manifest = readManifest(p.dir);
    const entities = manifest?.entities ?? {};
    const contrib = getPackContributions(p.id);
    return mergeContributions({
      id: p.id,
      name: p.name,
      version: p.version,
      enabled: true,
      builtIn: true,
      entityCount: Object.keys(entities).length,
      hasFeEntry: !!manifest?.fe?.entry || (contrib?.systems ?? []).length > 0,
      description: manifest?.description,
      entities,
      plugins: (manifest?.plugins ?? []).map((pp: any) => pp.id),
      permissions: manifest?.permissions ?? [],
    }, contrib);
  });
}

function emitPacksList(system: any) {
  const external = toExternalPackInfoList(readPackRegistry());
  const builtIn = toBuiltInPackInfoList();
  system.get(bus).send(emit(packs, { type: 'PACKS_LIST' as const, packs: [...builtIn, ...external] }));
}

export const packsSystem = setup({
  types: packsSpec.types,
  actions: {
    sendPacksList: ({ system }) => {
      emitPacksList(system);
    },

    installPack: ({ system, event }) => {
      const ev = packsSpec.typeOf('INSTALL_PACK', event);
      const packSlug = ev.packSlug;
      console.log(`[packs] Install requested: ${packSlug} (source: ${ev.source ?? 'default'})`);

      system.get(bus).send(emit(packs, { type: 'PACK_INSTALL_STARTED' as const, packSlug }));

      runInstall(packSlug, ev.source).then(result => {
        const entries = readPackRegistry();
        const updated = addToRegistry(entries, {
          id: result.id,
          name: result.name,
          version: result.version,
          dir: result.dir,
          enabled: true,
        });
        writePackRegistry(updated);

        system.get(bus).send(emit(packs, {
          type: 'PACK_INSTALL_COMPLETE' as const,
          packSlug,
          packId: result.id,
          packName: result.name,
          version: result.version,
        }));
        emitPacksList(system);
      }).catch(err => {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[packs] Install failed for ${packSlug}:`, message);
        system.get(bus).send(emit(packs, {
          type: 'PACK_INSTALL_FAILED' as const,
          packSlug,
          error: message,
        }));
      });
    },

    uninstallPack: ({ system, event }) => {
      const ev = packsSpec.typeOf('UNINSTALL_PACK', event);
      const packId = ev.packId;
      console.log(`[packs] Uninstall requested: ${packId}`);

      runUninstall(packId).then(() => {
        const entries = readPackRegistry();
        const updated = removeFromRegistry(entries, packId);
        writePackRegistry(updated);

        system.get(bus).send(emit(packs, {
          type: 'PACK_UNINSTALL_COMPLETE' as const,
          packId,
        }));
        emitPacksList(system);
      }).catch(err => {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[packs] Uninstall failed for ${packId}:`, message);
        system.get(bus).send(emit(packs, {
          type: 'PACK_UNINSTALL_FAILED' as const,
          packId,
          error: message,
        }));
      });
    },

    togglePackEnabled: ({ system, event }) => {
      const ev = packsSpec.typeOf('TOGGLE_PACK_ENABLED', event);
      const entries = readPackRegistry();
      const entry = entries.find(e => e.id === ev.packId);
      if (!entry) {
        console.warn(`[packs] Pack not found: ${ev.packId}`);
        return;
      }
      const newEnabled = !entry.enabled;
      const updated = entries.map(e =>
        e.id === ev.packId ? { ...e, enabled: newEnabled } : e,
      );
      writePackRegistry(updated);
      system.get(bus).send(emit(packs, {
        type: 'PACK_ENABLED_CHANGED' as const,
        packId: ev.packId,
        enabled: newEnabled,
      }));
    },
  },
}).createMachine({
  id: packs,
  initial: 'idle',
  context: {},
  states: {
    idle: {
      on: {
        CLIENT_CONNECTED: {
          actions: 'sendPacksList',
        },
        GET_INSTALLED_PACKS: {
          actions: 'sendPacksList',
        },
        INSTALL_PACK: {
          actions: 'installPack',
        },
        UNINSTALL_PACK: {
          actions: 'uninstallPack',
        },
        TOGGLE_PACK_ENABLED: {
          actions: 'togglePackEnabled',
        },
      },
    },
  },
});

export const packsEvents = new Set([
  'CLIENT_CONNECTED',
  'INSTALL_PACK',
  'UNINSTALL_PACK',
  'TOGGLE_PACK_ENABLED',
  'GET_INSTALLED_PACKS',
]);
