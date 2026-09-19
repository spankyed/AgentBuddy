import * as fs from 'fs';
import * as path from 'path';
import { setup } from 'xstate';
import { defineSystem } from '@abuddy/sdk/framework';
import { bus } from '@abuddy/sdk/ids';
import { emit } from '@abuddy/sdk/events';
import { getAppVersion } from '@abuddy/sdk/env';
import { readInstalledPacks, updateInstalledPacks, addInstalledPack, removeInstalledPack, type InstalledPack } from '../installed-packs.ts';
import { installPack as runInstall, uninstallPack as runUninstall, installPackFromGitHub } from '../pack-installer.ts';
import type { PackExtensions, PackInfo, PackRegistry } from '../pack-registration.ts';
import { packFrontendFiles } from '../pack-layout.ts';
import { checkForUpdates } from '../pack-updater.ts';
import { teardownPack, activatePack } from './lifecycle.ts';
import { activationProblem } from './activation-outcome.ts';
import { getBuiltInPackInfos, getLoadedPacks } from './loaded-packs.ts';

export type { PackInfo };

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

/**
 * The event types the `packs` plugin receives, as a value the app can check a send against — the same
 * problem `HOST_PLUGIN_EVENT_TYPES` solves for `application`, and solved here because the union lives
 * here. It is registered with `registerHostPlugin`, not added to `HostPluginEvents`, because that map
 * is what a pack may name in `sendsTo`: these are the host's to send, and no pack's.
 *
 * The check below fails to compile when the two drift, so adding an outgoing event without listing it
 * here is not possible.
 */
export const PACKS_PLUGIN_EVENT_TYPES = [
  'PACKS_LIST',
  'PACK_INSTALL_STARTED',
  'PACK_INSTALL_COMPLETE',
  'PACK_INSTALL_FAILED',
  'PACK_UNINSTALL_COMPLETE',
  'PACK_UNINSTALL_FAILED',
  'PACK_ENABLED_CHANGED',
  'PACK_ACTIVATED',
  'PACK_DEACTIVATED',
  'PACK_UPDATE_COMPLETE',
  'PACK_UPDATE_FAILED',
] as const;

type SameMembers<A extends string, B extends string> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;
type TypeOfEvent<T> = T extends { type: infer K extends string } ? K : never;
const _packsPluginEventTypesMatch: SameMembers<(typeof PACKS_PLUGIN_EVENT_TYPES)[number], TypeOfEvent<OutgoingPacksEvents>> = true;
void _packsPluginEventTypesMatch;

function readManifest(dir: string): Record<string, any> | null {
  try {
    const manifestPath = path.join(dir, 'abuddy.json');
    if (fs.existsSync(manifestPath)) {
      return JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    }
  } catch {}
  return null;
}

function mergeExtensions(base: Omit<PackInfo, keyof PackExtensions>, contrib: PackExtensions | null): PackInfo {
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

function toExternalPackInfoList(registry: PackRegistry, entries: InstalledPack[]): PackInfo[] {
  return entries.map(e => {
    const manifest = readManifest(e.dir);
    const entities = manifest?.entities ?? {};
    const contrib = registry.getPackExtensions(e.id);
    return mergeExtensions({
      id: e.id,
      name: e.name,
      version: e.version,
      enabled: e.enabled,
      builtIn: false,
      entityCount: Object.keys(entities).length,
      hasFrontend: !!packFrontendFiles(e.dir).entry,
      hostVersion: manifest?.hostVersion,
      description: manifest?.description,
      entities,
      permissions: manifest?.permissions ?? [],
      dir: e.dir,
      installedAt: e.installedAt,
      installedFrom: e.installedFrom,
      availableVersion: e.availableVersion,
      updateCheckError: e.updateCheckError,
    }, contrib);
  });
}

function toBuiltInPackInfoList(registry: PackRegistry): PackInfo[] {
  return getBuiltInPackInfos().map(p => {
    const manifest = readManifest(p.dir);
    const entities = manifest?.entities ?? {};
    const contrib = registry.getPackExtensions(p.id);
    return mergeExtensions({
      id: p.id,
      name: p.name,
      version: p.version,
      enabled: true,
      builtIn: true,
      entityCount: Object.keys(entities).length,
      hasFrontend: (contrib?.features ?? []).some(f => f.hasPlugin),
      description: manifest?.description,
      entities,
      permissions: manifest?.permissions ?? [],
    }, contrib);
  });
}

function emitPacksList(registry: PackRegistry, system: any) {
  const record = readInstalledPacks();
  const external = toExternalPackInfoList(registry, record.found ? record.packs : []);
  const builtIn = toBuiltInPackInfoList(registry);
  system.get(bus).send(emit(packs, { type: 'PACKS_LIST' as const, packs: [...builtIn, ...external] }));
}

/** The host `packs` system, installing, updating and toggling the packs in `registry` */
export function createPacksSystem(registry: PackRegistry) {
  const _inFlightOps = new Set<string>();
  return setup({
    types: packsSpec.types,
    actions: {
      sendPacksList: ({ system }) => {
        emitPacksList(registry, system);
      },

      installPack: ({ system, event }) => {
        const ev = packsSpec.typeOf('INSTALL_PACK', event);
        const packSlug = ev.packSlug;
        console.log(`[packs] Install requested: ${packSlug} (source: ${ev.source ?? 'default'})`);

        system.get(bus).send(emit(packs, { type: 'PACK_INSTALL_STARTED' as const, packSlug }));

        const isGitHub = !ev.source && !packSlug.startsWith('http') && packSlug.includes('/');

        runInstall(packSlug, ev.source, undefined, { hostVersion: getAppVersion() }).then(result => {
          updateInstalledPacks(entries => addInstalledPack(entries, {
            id: result.id,
            name: result.name,
            version: result.version,
            dir: result.dir,
            enabled: true,
            installedFrom: isGitHub ? packSlug : undefined,
          }));

          // Installing over a pack that is already running — a reinstall, or the same pack from another
          // source — has replaced its files underneath it. Without the teardown, registering the new copy
          // collides with the old registration and the pack is reported as installed but dead. Silent
          // (`replacing`), because the activation below announces the change.
          const replaced = getLoadedPacks().some(p => p.manifest.id === result.id);
          if (replaced) {
            teardownPack(registry, result.id, system.get(bus), { replacing: true });
            system.get(bus).send(emit(packs, { type: 'PACK_DEACTIVATED' as const, packId: result.id }));
          }

          const activated = activatePack(registry, result.id, system.get(bus));
          const problem = activationProblem(result.id, activated);
          if (problem) {
            if (replaced && !activated) {
              // The replacement never registered: end the window, and tell the running systems the pack is gone
              registry.clearPackReplacing(result.id);
              system.get(bus).send({ type: 'PACK_CHANGED', packId: result.id });
            }
            system.get(bus).send(emit(packs, {
              type: 'PACK_INSTALL_FAILED' as const,
              packSlug,
              error: `${result.name} was installed but ${problem}`,
            }));
            emitPacksList(registry, system);
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
          emitPacksList(registry, system);
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

        teardownPack(registry, packId, system.get(bus));
        system.get(bus).send(emit(packs, { type: 'PACK_DEACTIVATED' as const, packId }));

        runUninstall(packId).then(() => {
          updateInstalledPacks(entries => removeInstalledPack(entries, packId));

          system.get(bus).send(emit(packs, {
            type: 'PACK_UNINSTALL_COMPLETE' as const,
            packId,
          }));
          emitPacksList(registry, system);
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
        const record = readInstalledPacks();
        const entry = record.found ? record.packs.find(e => e.id === packId) : undefined;
        if (!entry?.installedFrom) {
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

        const sourceSlug = entry.installedFrom.split('@')[0];
        // Install the release the update check found (it may be a beta prerelease); fall back to latest
        const target = entry.availableTag ? `${sourceSlug}@${entry.availableTag}` : sourceSlug;
        console.log(`[packs] Update requested: ${packId} from ${target}`);

        // Silent teardown: activation announces the change, or the finally below does when nothing activates
        teardownPack(registry, packId, system.get(bus), { replacing: true });
        system.get(bus).send(emit(packs, { type: 'PACK_DEACTIVATED' as const, packId }));
        let activated = false;

        installPackFromGitHub(target, undefined, { hostVersion: getAppVersion() }).then(result => {
          updateInstalledPacks(reg =>
            reg.map(e => e.id === packId ? {
              ...e,
              version: result.version,
              dir: result.dir,
              availableVersion: undefined,
              availableTag: undefined,
            } : e),
          );

          activated = activatePack(registry, packId, system.get(bus));
          const problem = activationProblem(packId, activated);
          if (problem) {
            system.get(bus).send(emit(packs, {
              type: 'PACK_UPDATE_FAILED' as const,
              packId,
              error: `Updated to ${result.version} but ${problem}`,
            }));
            emitPacksList(registry, system);
            return;
          }

          system.get(bus).send(emit(packs, {
            type: 'PACK_UPDATE_COMPLETE' as const,
            packId,
            version: result.version,
          }));
          system.get(bus).send(emit(packs, { type: 'PACK_ACTIVATED' as const, packId }));
          emitPacksList(registry, system);
        }).catch(err => {
          const message = err instanceof Error ? err.message : String(err);
          console.error(`[packs] Update failed for ${packId}:`, message);
          activated = activatePack(registry, packId, system.get(bus));
          if (activated) {
            system.get(bus).send(emit(packs, { type: 'PACK_ACTIVATED' as const, packId }));
          }
          system.get(bus).send(emit(packs, {
            type: 'PACK_UPDATE_FAILED' as const,
            packId,
            error: message,
          }));
          emitPacksList(registry, system);
        }).finally(() => {
          // Registering the replacement clears this; if nothing registered, the window ends here rather
          // than leaving the pack's plugins marked as expected-to-be-missing for the rest of the run
          registry.clearPackReplacing(packId);
          // Activation sends PACK_CHANGED itself; without it the pack is gone, which running systems must hear
          if (!activated) system.get(bus).send({ type: 'PACK_CHANGED', packId });
          _inFlightOps.delete(packId);
        });
      },

      checkForPackUpdates: ({ system }) => {
        checkForUpdates({ hostVersion: getAppVersion() }).then(() => {
          emitPacksList(registry, system);
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

        const record = readInstalledPacks();
        const current = record.found ? record.packs : [];
        const entry = current.find(e => e.id === packId);
        if (!entry) {
          console.warn(`[packs] Pack not found: ${packId}`);
          return;
        }
        const newEnabled = !entry.enabled;

        if (!newEnabled) {
          teardownPack(registry, packId, system.get(bus));
          system.get(bus).send(emit(packs, { type: 'PACK_DEACTIVATED' as const, packId }));
        } else {
          activatePack(registry, packId, system.get(bus));
          system.get(bus).send(emit(packs, { type: 'PACK_ACTIVATED' as const, packId }));
        }

        updateInstalledPacks(entries =>
          entries.map(e => e.id === packId ? { ...e, enabled: newEnabled } : e),
        );
        system.get(bus).send(emit(packs, {
          type: 'PACK_ENABLED_CHANGED' as const,
          packId,
          enabled: newEnabled,
        }));
        emitPacksList(registry, system);
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
}

export const packsEvents = new Set([
  'CLIENT_CONNECTED',
  'INSTALL_PACK',
  'UNINSTALL_PACK',
  'TOGGLE_PACK_ENABLED',
  'GET_INSTALLED_PACKS',
  'UPDATE_PACK',
  'CHECK_FOR_UPDATES',
]);
