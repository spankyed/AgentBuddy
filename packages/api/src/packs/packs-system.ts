import * as fs from 'fs';
import * as path from 'path';
import { setup } from 'xstate';
import { defineSystem } from '@abuddy/sdk/framework';
import { bus } from '@abuddy/sdk/ids';
import { emit } from '@abuddy/sdk/helpers';
import {
  readPackRegistry, modifyRegistry, addToRegistry, removeFromRegistry,
  type PackRegistryEntry, type PackInfo, type BuiltInPackInfo,
  installPack as runInstall, uninstallPack as runUninstall,
  installPackFromGitHub,
  getPackContributions, type PackContributions,
  checkForUpdates,
} from '@abuddy/host/packs';
import { teardownPack, activatePack } from './pack-lifecycle';
import { activationProblem } from './activation-outcome';
import { APP_VERSION } from '@/version';

export type { PackInfo };

let _builtInPacks: BuiltInPackInfo[] = [];
const _inFlightOps = new Set<string>();

export function setBuiltInPacks(packs: BuiltInPackInfo[] | undefined): void {
  _builtInPacks = packs ?? [];
}

type IncomingPacksEvents =
  | { type: 'INSTALL_PACK'; packSlug: string; source?: string }
  | { type: 'UNINSTALL_PACK'; packId: string }
  | { type: 'TOGGLE_PACK_ENABLED'; packId: string }
  | { type: 'UPDATE_PACK'; packId: string }
  | { type: 'CHECK_FOR_UPDATES' }
  | { type: 'GET_INSTALLED_PACKS' }

type OutgoingPacksEvents =
  | { type: 'PACKS_LIST'; packs: PackInfo[] }
  | { type: 'PACK_INSTALL_STARTED'; packSlug: string }
  | { type: 'PACK_INSTALL_COMPLETE'; packSlug: string; packId: string; packName: string; version: string }
  | { type: 'PACK_INSTALL_FAILED'; packSlug: string; error: string }
  | { type: 'PACK_UNINSTALL_COMPLETE'; packId: string }
  | { type: 'PACK_UNINSTALL_FAILED'; packId: string; error: string }
  | { type: 'PACK_ENABLED_CHANGED'; packId: string; enabled: boolean }
  | { type: 'PACK_ACTIVATED'; packId: string }
  | { type: 'PACK_DEACTIVATED'; packId: string }
  | { type: 'PACK_UPDATE_COMPLETE'; packId: string; version: string }
  | { type: 'PACK_UPDATE_FAILED'; packId: string; error: string }

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

function extractPluginNames(manifest: Record<string, any> | null): string[] {
  if (!manifest) return [];
  if (manifest.features) {
    return manifest.features
      .filter((f: any) => f.plugin)
      .map((f: any) => f.plugin.label ?? f.id);
  }
  return [];
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
    features: contrib?.features ?? [],
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
      hasFeEntry: !!manifest?.fe?.entry || extractPluginNames(manifest).length > 0 || (contrib?.systems ?? []).length > 0,
      hostVersion: manifest?.hostVersion,
      description: manifest?.description,
      entities,
      plugins: extractPluginNames(manifest),
      permissions: manifest?.permissions ?? [],
      dir: e.dir,
      registeredAt: e.registeredAt,
      source: e.source,
      availableVersion: e.availableVersion,
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
      hasFeEntry: !!manifest?.fe?.entry || extractPluginNames(manifest).length > 0 || (contrib?.systems ?? []).length > 0,
      description: manifest?.description,
      entities,
      plugins: extractPluginNames(manifest),
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

      const isGitHub = !ev.source && !packSlug.startsWith('http') && packSlug.includes('/');

      runInstall(packSlug, ev.source, undefined, { hostVersion: APP_VERSION }).then(result => {
        modifyRegistry(entries => addToRegistry(entries, {
          id: result.id,
          name: result.name,
          version: result.version,
          dir: result.dir,
          enabled: true,
          source: isGitHub ? packSlug : undefined,
        }));

        const problem = activationProblem(result.id, activatePack(result.id, system.get(bus), { seed: true }));
        if (problem) {
          system.get(bus).send(emit(packs, {
            type: 'PACK_INSTALL_FAILED' as const,
            packSlug,
            error: `${result.name} was installed but ${problem}`,
          }));
          emitPacksList(system);
          return;
        }

        system.get(bus).send(emit(packs, {
          type: 'PACK_INSTALL_COMPLETE' as const,
          packSlug,
          packId: result.id,
          packName: result.name,
          version: result.version,
        }));
        system.get(bus).send(emit(packs, { type: 'PACK_ACTIVATED' as const, packId: result.id }));
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

      if (_inFlightOps.has(packId)) {
        console.warn(`[packs] Operation already in progress for ${packId}, skipping uninstall`);
        return;
      }
      _inFlightOps.add(packId);
      console.log(`[packs] Uninstall requested: ${packId}`);

      teardownPack(packId, system.get(bus));
      system.get(bus).send(emit(packs, { type: 'PACK_DEACTIVATED' as const, packId }));

      runUninstall(packId).then(() => {
        modifyRegistry(entries => removeFromRegistry(entries, packId));

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
      }).finally(() => {
        _inFlightOps.delete(packId);
      });
    },

    updatePack: ({ system, event }) => {
      const ev = packsSpec.typeOf('UPDATE_PACK', event);
      const packId = ev.packId;
      const entries = readPackRegistry();
      const entry = entries.find(e => e.id === packId);
      if (!entry?.source) {
        system.get(bus).send(emit(packs, {
          type: 'PACK_UPDATE_FAILED' as const,
          packId,
          error: 'Pack has no update source',
        }));
        return;
      }

      if (_inFlightOps.has(packId)) {
        console.warn(`[packs] Operation already in progress for ${packId}, skipping update`);
        return;
      }
      _inFlightOps.add(packId);

      const sourceSlug = entry.source.split('@')[0];
      // Install the release the update check found (it may be a beta prerelease); fall back to latest
      const target = entry.availableTag ? `${sourceSlug}@${entry.availableTag}` : sourceSlug;
      console.log(`[packs] Update requested: ${packId} from ${target}`);

      teardownPack(packId, system.get(bus));
      system.get(bus).send(emit(packs, { type: 'PACK_DEACTIVATED' as const, packId }));

      installPackFromGitHub(target, undefined, { hostVersion: APP_VERSION }).then(result => {
        modifyRegistry(reg =>
          reg.map(e => e.id === packId ? {
            ...e,
            version: result.version,
            dir: result.dir,
            availableVersion: undefined,
            availableTag: undefined,
          } : e),
        );

        const problem = activationProblem(packId, activatePack(packId, system.get(bus), { seed: true }));
        if (problem) {
          system.get(bus).send(emit(packs, {
            type: 'PACK_UPDATE_FAILED' as const,
            packId,
            error: `Updated to ${result.version} but ${problem}`,
          }));
          emitPacksList(system);
          return;
        }

        system.get(bus).send(emit(packs, {
          type: 'PACK_UPDATE_COMPLETE' as const,
          packId,
          version: result.version,
        }));
        system.get(bus).send(emit(packs, { type: 'PACK_ACTIVATED' as const, packId }));
        emitPacksList(system);
      }).catch(err => {
        const message = err instanceof Error ? err.message : String(err);
        console.error(`[packs] Update failed for ${packId}:`, message);
        if (activatePack(packId, system.get(bus))) {
          system.get(bus).send(emit(packs, { type: 'PACK_ACTIVATED' as const, packId }));
        }
        system.get(bus).send(emit(packs, {
          type: 'PACK_UPDATE_FAILED' as const,
          packId,
          error: message,
        }));
        emitPacksList(system);
      }).finally(() => {
        _inFlightOps.delete(packId);
      });
    },

    checkForPackUpdates: ({ system }) => {
      checkForUpdates().then(() => {
        emitPacksList(system);
      }).catch(err => {
        console.error('[packs] Update check failed:', err);
      });
    },

    togglePackEnabled: ({ system, event }) => {
      const ev = packsSpec.typeOf('TOGGLE_PACK_ENABLED', event);
      const packId = ev.packId;

      if (_inFlightOps.has(packId)) {
        console.warn(`[packs] Operation already in progress for ${packId}, skipping toggle`);
        return;
      }

      const current = readPackRegistry();
      const entry = current.find(e => e.id === packId);
      if (!entry) {
        console.warn(`[packs] Pack not found: ${packId}`);
        return;
      }
      const newEnabled = !entry.enabled;

      if (!newEnabled) {
        teardownPack(packId, system.get(bus));
        system.get(bus).send(emit(packs, { type: 'PACK_DEACTIVATED' as const, packId }));
      } else {
        activatePack(packId, system.get(bus));
        system.get(bus).send(emit(packs, { type: 'PACK_ACTIVATED' as const, packId }));
      }

      modifyRegistry(entries =>
        entries.map(e => e.id === packId ? { ...e, enabled: newEnabled } : e),
      );
      system.get(bus).send(emit(packs, {
        type: 'PACK_ENABLED_CHANGED' as const,
        packId,
        enabled: newEnabled,
      }));
      emitPacksList(system);
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
        UPDATE_PACK: {
          actions: 'updatePack',
        },
        CHECK_FOR_UPDATES: {
          actions: 'checkForPackUpdates',
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
  'UPDATE_PACK',
  'CHECK_FOR_UPDATES',
]);
