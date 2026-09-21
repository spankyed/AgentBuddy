import * as fs from 'fs';
import * as path from 'path';
import { setup } from 'xstate';
import { defineSystem } from '@abuddy/sdk/framework';
import { bus } from '@abuddy/sdk/ids';
import { emit } from '@abuddy/sdk/events';
import { getAppVersion } from '@abuddy/sdk/env';
import { forgetPack, packRecord, recordInstalled, recordUpdateInstalled, setPackEnabled } from '../installed-packs.ts';
import { reportError } from '@abuddy/sdk/logger';
import { installPack as runInstall, uninstallPack as runUninstall, installPackFromGitHub } from '../pack-installer.ts';
import type { PackExtensions, PackInfo, PackRegistry } from '../pack-registration.ts';
import { packFrontendFiles } from '../pack-layout.ts';
import { installedPacks, type InstalledPack } from '../pack-discovery.ts';
import { checkForUpdates } from '../pack-updater.ts';
import { teardownPack, activatePack } from './lifecycle.ts';
import { activationProblem } from './activation-outcome.ts';
import { HOST_PACK_ID, resolveName } from '@abuddy/sdk/ids';

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
/** The host `packs` feature's ref, which its system and plugin both run under */
export const packs = resolveName(packsSpec.id, HOST_PACK_ID);

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

function toExternalPackInfoList(registry: PackRegistry, packs: InstalledPack[]): PackInfo[] {
  return packs.map(({ manifest, dir, record }) => {
    const entities = manifest.entities ?? {};
    const contrib = registry.getPackExtensions(record.id);
    return mergeExtensions({
      id: record.id,
      name: manifest.name,
      version: manifest.version,
      enabled: record.enabled,
      builtIn: false,
      entityCount: Object.keys(entities).length,
      hasFrontend: !!packFrontendFiles(dir).entry,
      hostVersion: manifest.hostVersion,
      description: manifest.description,
      entities,
      permissions: manifest.permissions ?? [],
      dir,
      installedAt: record.installedAt,
      installedFrom: record.installedFrom,
      availableVersion: record.availableVersion,
      updateCheckError: record.updateCheckError,
    }, contrib);
  });
}

function toBuiltInPackInfoList(registry: PackRegistry): PackInfo[] {
  return registry.builtInPacks().map(p => {
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
  const external = toExternalPackInfoList(registry, installedPacks());
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

        // Keyed on the slug, because an install learns the pack's id only from its result: two installs of
        // the same slug at once would place two copies over each other and register the loser
        if (_inFlightOps.has(packSlug)) {
          console.warn(`[packs] Operation already in progress for ${packSlug}, skipping install`);
          return;
        }
        _inFlightOps.add(packSlug);
        console.log(`[packs] Install requested: ${packSlug} (source: ${ev.source ?? 'default'})`);

        system.get(bus).send(emit(packs, { type: 'PACK_INSTALL_STARTED' as const, packSlug }));

        const isGitHub = !ev.source && !packSlug.startsWith('http') && packSlug.includes('/');
        // The id of the running pack this install tore down, which a slug or a URL doesn't carry
        let replacedId: string | undefined;

        runInstall(packSlug, ev.source, undefined, {
          hostVersion: getAppVersion(),
          // Installing over a pack that is already running is a reinstall, or the same pack from another
          // source. It is torn down before its files are replaced rather than after: a pack left running
          // on a directory that has been swapped underneath it loads the new code on its next lazy
          // require. Silent (`replacing`), because the activation below announces the change.
          beforePlace: (manifest) => {
            if (!registry.packOrigin(manifest.id)) return;
            replacedId = manifest.id;
            teardownPack(registry, manifest.id, system.get(bus), { replacing: true });
            system.get(bus).send(emit(packs, { type: 'PACK_DEACTIVATED' as const, packId: manifest.id }));
          },
        }).then(result => {
          recordInstalled(result.id, isGitHub ? packSlug : undefined);

          const activated = activatePack(registry, result.id, system.get(bus));
          const problem = activationProblem(result.id, activated);
          if (problem) {
            if (replacedId && !activated) {
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
          // The pack was torn down for a replacement that never arrived: end the window and say it is gone
          if (replacedId) {
            registry.clearPackReplacing(replacedId);
            system.get(bus).send({ type: 'PACK_CHANGED', packId: replacedId });
          }
          system.get(bus).send(emit(packs, {
            type: 'PACK_INSTALL_FAILED' as const,
            packSlug,
            error: message,
          }));
        }).finally(() => {
          _inFlightOps.delete(packSlug);
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
          forgetPack(packId);

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
        const entry = packRecord(packId);
        if (!entry.installedFrom) {
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
          recordUpdateInstalled(packId);

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

        const installed = installedPacks().find(p => p.record.id === packId);
        if (!installed) {
          console.warn(`[packs] Pack not found: ${packId}`);
          return;
        }
        const entry = installed.record;
        const newEnabled = !entry.enabled;

        if (!newEnabled) {
          teardownPack(registry, packId, system.get(bus));
          system.get(bus).send(emit(packs, { type: 'PACK_DEACTIVATED' as const, packId }));
        } else {
          activatePack(registry, packId, system.get(bus));
          system.get(bus).send(emit(packs, { type: 'PACK_ACTIVATED' as const, packId }));
        }

        // The pack has already been torn down or activated; what may not have survived is the choice
        // itself, and at the next boot the pack comes back the way it was. Saying which decision was
        // lost is the difference between that and the app quietly disagreeing with the user.
        if (!setPackEnabled(packId, newEnabled)) {
          reportError({
            source: 'packs',
            operation: 'setPackEnabled',
            severity: 'error',
            error: new Error(`Couldn't save that ${packId} is ${newEnabled ? 'enabled' : 'disabled'}: it will be ${newEnabled ? 'disabled' : 'enabled'} again the next time AgentBuddy starts.`),
          });
        }
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
          // A pack activated, reloaded or torn down changes this list, and a reload is the one that
          // reaches here no other way: it comes from `abuddy dev`, not from an action of this system
          PACK_CHANGED: {
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
