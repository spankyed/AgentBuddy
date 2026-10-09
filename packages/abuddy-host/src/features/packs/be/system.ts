import type { Contract } from './contract.ts';
import * as path from 'path';
import { setup } from 'xstate';
import { defineSystem } from '@abuddy/sdk/framework';
import { broadcastToPlugin, sendToSystem } from '../../../events.ts';
import { getAppVersion } from '@abuddy/sdk/env';
import { PACK_SNAPSHOT_FORMAT } from '@abuddy/sdk/build';
import { HOST_PACK_ID, PACK_ID_PATTERN } from '@abuddy/sdk/ids';
import { forgetPack, packRecord, recordInstalled, recordUpdateInstalled, setPackEnabled } from '../../../packs/installed.ts';
import { reportError } from '@abuddy/sdk/logger';
import { installPack as runInstall, uninstallPack as runUninstall, installPackFromGitHub } from '../../../packs/installer.ts';
import type { PackExtensions, PackInfo, PackRegistry } from '../../../packs/registry.ts';
import { packFrontendFiles, PACK_LAYOUT } from '../../../packs/layout.ts';
import { installedPacks, type InstalledPack } from '../../../packs/discovery.ts';
import { checkForUpdates } from '../../../packs/updater.ts';
import { teardownPack, activatePack } from '../../../packs/runtime/lifecycle.ts';
import { activationProblem } from '../../../packs/runtime/activation-outcome.ts';
import { HOST } from '../../../refs.ts';
import { errorMessage } from '@abuddy/sdk/utils/pure';
import { applyRecord, importCompiledContent, registeredContentKeys, type ContentSelection } from '@abuddy/sdk/utils';
import { appliedContent } from '../../../app-state/index.ts';
import { contentKeySelection, describeContentKey, previewPackContent, removeContentEntity } from '@abuddy/sdk/content';
import { untypedQx } from '@abuddy/ears';
import type { EARS } from '@abuddy/sdk';

export type { PackInfo };

export const packsSpec = defineSystem<Contract>();

/**
 * Convert the JSON-safe include shape from the frontend (`null = all items, [] = skip, string[] = filter`)
 * into the `SeedInclude` structure `importCompiledContent` consumes.
 */
function toContentSelection(include: Record<string, string[] | null>): Record<string, ContentSelection | undefined> {
  return Object.fromEntries(Object.entries(include).map(([key, items]) => [key, items === null ? true : new Set(items)]));
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

/**
 * The packs the view lists, read from one place: the installed packs, which is all of them, since the app
 * installs the packs it ships. So every pack's version comes from its own manifest and every one has an
 * install date — a second list built from the registry could give neither.
 */
/**
 * The decisions the last apply left the user about this pack's content, oldest key first so the list is
 * stable between asks.
 *
 * Derived from the pack's `AppliedContent` on every list, rather than kept anywhere a second time: the
 * record is where an unresolved offer lives, and an apply between two lists is why one of them is shorter.
 */
/**
 * Where a pack's compiled content is: under the directory it is installed in, which the host put it in.
 *
 * A pack does not say where its data is, here as in `applyPacks`, so restoring one item reads the same
 * directory the apply that wrote it read.
 */
function compiledDirOf(packId: string): string {
  const pack = installedPacks().find((installed) => installed.record.id === packId);
  if (!pack?.dir) throw new Error(`Pack "${packId}" isn't installed`);
  return path.join(pack.dir, PACK_LAYOUT.contentDir);
}

function contentOffersOf(packId: string): Pick<PackInfo, 'contentOffers' | 'contentKept'> {
  const items = Object.entries(appliedContent.get(packId).items).sort(([a], [b]) => a.localeCompare(b));
  return {
    contentOffers: items.flatMap(([key, item]) => (item.offer ? [{ key, label: describeContentKey(key), ...item.offer }] : [])),
    contentKept: items.flatMap(([key, item]) => (item.dismissed && !item.offer ? [{ key, label: describeContentKey(key) }] : [])),
  };
}

function toPackInfoList(registry: PackRegistry, packs: InstalledPack[], canUninstall: (packId: string) => boolean): PackInfo[] {
  return packs.map(({ manifest, dir, record }) => {
    const entities = manifest.entities ?? {};
    const contrib = registry.getPackExtensions(record.id);
    return mergeExtensions({
      id: record.id,
      name: manifest.name,
      version: manifest.version,
      enabled: record.enabled,
      canUninstall: canUninstall(record.id),
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
      loadProblem: registry.loadProblem(record.id),
      ...contentOffersOf(record.id),
    }, contrib);
  });
}

function emitPacksList(registry: PackRegistry, canUninstall: (packId: string) => boolean) {
  broadcastToPlugin('packs', { type: 'PACKS_LIST' as const, packs: toPackInfoList(registry, installedPacks(), canUninstall) });
}

/** The host `packs` system, installing, updating and toggling the packs in `registry` */
export function createPacksSystem(registry: PackRegistry) {
  /**
   * Whether the app would offer to uninstall this pack. False for the host and for whatever this app
   * shipped — the app needs it to run, and an uninstall would leave a user with nothing. The Packs view
   * reads the same answer as `PackInfo.canUninstall` to decide whether to show the button.
   *
   * Flipping a shipped pack to uninstallable is a product decision rather than a refactor, and this is the
   * one place it would be made.
   */
  const canUninstall = (packId: string) => packId !== HOST_PACK_ID && registry.packOrigin(packId)?.shipped !== true;

  const _inFlightOps = new Set<string>();
  return setup({
    types: packsSpec.types,
    actions: packsSpec.actions({
    // Both answer the settings plugin, which is where the content UI is drawn. The work is this system's; the
    // view is not, and a system sends whichever plugin's inbox declares the event.
    previewPackContent: ({ event }) => {
      const ev = packsSpec.typeOf('PREVIEW_PACK_CONTENT', event);
      try {
        broadcastToPlugin('settings', { type: 'PACK_CONTENT_PREVIEW', preview: previewPackContent(ev.directory) });
      } catch (err) {
        broadcastToPlugin('settings', { type: 'PACK_CONTENT_PREVIEW_FAILED', error: errorMessage(err) });
      }
    },

    importPackContent: ({ event }) => {
      const ev = packsSpec.typeOf('IMPORT_PACK_CONTENT', event);
      try {
        const include = ev.include ? toContentSelection(ev.include) : undefined;
        // Read first: a directory that can't name its pack fails before anything is imported
        const { packId } = previewPackContent(ev.directory);
        /**
         * **Write-only, which is what makes this an import and not an apply.** `before` is empty, so no
         * verdict here can be reached from what a previous apply wrote: nothing is read as the user's
         * deletion, nothing is read as their edit, and no item is removed for having left the content.
         * Putting a pack's data back is the request, and the modes are the whole of the policy.
         *
         * **What it does write is what it wrote**, and it has to: an import that rewrote fifty entities and
         * recorded nothing would leave the applied content describing the version before it, which the next
         * boot's apply would read as fifty edits by the user. The revision is left where it is, so asking
         * for the data again does not change what counts as changed.
         */
        const record = applyRecord();
        const result = importCompiledContent({ compiledDir: ev.directory, include, mode: ev.mode, applied: record, verbose: true });
        appliedContent.record(packId, { wrote: record.written });
        // Appliers report records they couldn't write in their counts rather than throwing
        const errors = Object.entries(result).flatMap(([key, counts]) => (counts.errors ?? []).map((error) => `${key}: ${error}`));
        broadcastToPlugin('settings', { type: 'PACK_CONTENT_IMPORTED', result, errors });
        // The running systems read what the apply changed (the chat's slash commands, the library's documents)
        sendToSystem('bus', { type: 'PACK_CHANGED', packId });
        if (ev.restartBrain) sendToSystem({ role: 'brain' }, { type: 'RESTART_BRAIN' });
      } catch (err) {
        broadcastToPlugin('settings', { type: 'PACK_CONTENT_IMPORT_FAILED', error: errorMessage(err) });
      }
    },

      sendPacksList: () => {
        emitPacksList(registry, canUninstall);
      },

      /**
       * **Write the pack's version of one item over whatever is there.** The one act in the app that
       * overwrites the user's own work, reached only from something they clicked: taking a newer version
       * they were offered, or asking for the shipped item back.
       *
       * It is an **import** of exactly one item — `force`, a selection of that item alone, and a write-only
       * record — which is what makes it structurally incapable of being an apply (`importCompiledContent`
       * refuses `force` beside anything the last apply wrote). The write re-stamps the item's entry, so the
       * offer is answered by the write rather than by a second bookkeeping step.
       */
      restoreContentItem: ({ event }) => {
        const ev = packsSpec.typeOf('RESTORE_CONTENT_ITEM', event);
        const selection = contentKeySelection(ev.key);
        if (!selection) {
          reportError({ source: 'packs', operation: 'restoreContentItem', severity: 'error', error: new Error(`Can't restore "${ev.key}": it doesn't name an item of a pack's content`) });
          return;
        }
        try {
          const dir = compiledDirOf(ev.packId);
          /**
           * **Every other entry is named and given nothing**, because an entry the map omits is not
           * excluded — `selectsAll` reads an absent selection as *all of its items*, and only an empty set
           * means skip. With `force` beside it, a map naming one entry would write every item of every
           * other entry over whatever the user had made of them, which is the one thing this request must
           * not do: they asked for one item back.
           */
          const include = Object.fromEntries(registeredContentKeys(ev.packId)
            .map((key) => [key, key === selection.entryKey ? new Set([selection.label]) : new Set<string>()]));
          if (!(selection.entryKey in include)) {
            reportError({ source: 'packs', operation: 'restoreContentItem', severity: 'error', error: new Error(`Can't restore ${describeContentKey(ev.key)}: "${ev.packId}" has no content entry "${selection.entryKey}"`) });
            return;
          }
          const record = applyRecord();
          const result = importCompiledContent({
            compiledDir: dir,
            include,
            mode: 'replace-on-collision',
            force: true,
            applied: record,
            verbose: true,
          });
          appliedContent.record(ev.packId, { wrote: record.written });
          const errors = Object.entries(result).flatMap(([key, counts]) => (counts.errors ?? []).map((error) => `${key}: ${error}`));
          if (errors.length > 0) {
            reportError({ source: 'packs', operation: 'restoreContentItem', severity: 'error', error: new Error(`Couldn't restore ${describeContentKey(ev.key)}:\n  ${errors.join('\n  ')}`) });
          }
          /**
           * **Only an item that was written has been decided**, which is why this reads the record rather
           * than the absence of an error: a run that could not write this item has changed nothing about
           * it, and clearing its offer would stop the user ever being asked again about a version they
           * never received. The write itself re-stamps the entry, so this is what answers an offer the
           * write happened to leave in place.
           */
          if (record.written.has(ev.key)) appliedContent.resolveOffer(ev.packId, ev.key, { choice: 'taken' });
          // The running systems read what the write changed (the brain's flows, the chat's slash commands)
          sendToSystem('bus', { type: 'PACK_CHANGED', packId: ev.packId });
        } catch (err) {
          reportError({ source: 'packs', operation: 'restoreContentItem', severity: 'error', error: err });
        }
        emitPacksList(registry, canUninstall);
      },

      /** "Keep mine": the item stays as the user wrote it, and this version is not offered again */
      dismissContentOffer: ({ event }) => {
        const ev = packsSpec.typeOf('DISMISS_CONTENT_OFFER', event);
        const offer = appliedContent.get(ev.packId).items[ev.key]?.offer;
        appliedContent.resolveOffer(ev.packId, ev.key, {
          choice: 'dismissed',
          ...(offer?.contentHash !== undefined && { contentHash: offer.contentHash }),
        });
        emitPacksList(registry, canUninstall);
      },

      /**
       * "Delete it": the other answer to an item the pack stopped shipping. The entity goes and so does its
       * entry, which is what makes the decision final — there is nothing left for a later apply to describe.
       */
      deleteContentItem: ({ event }) => {
        const ev = packsSpec.typeOf('DELETE_CONTENT_ITEM', event);
        try {
          const item = appliedContent.get(ev.packId).items[ev.key];
          const id = item?.entityType
            ? (untypedQx(item.entityType as EARS.Entity).where('contentKey', ev.key).pickAll()[0] as { id: EARS.EntityId } | undefined)?.id
            : undefined;
          // Through the owner's own delete: a flow's nodes and wiring go with it, and an entity type whose
          // pack registered a `remove` writer is removed the way that pack removes one
          if (id) removeContentEntity(item!.entityType!, id);
          appliedContent.resolveOffer(ev.packId, ev.key, { choice: 'deleted' });
          sendToSystem('bus', { type: 'PACK_CHANGED', packId: ev.packId });
        } catch (err) {
          reportError({ source: 'packs', operation: 'deleteContentItem', severity: 'error', error: err });
        }
        emitPacksList(registry, canUninstall);
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

        broadcastToPlugin('packs', { type: 'PACK_INSTALL_STARTED' as const, packSlug });

        const isGitHub = !ev.source && !packSlug.startsWith('http') && packSlug.includes('/');
        // The id of the running pack this install tore down, which a slug or a URL doesn't carry
        let replacedId: string | undefined;

        runInstall(packSlug, ev.source, undefined, {
          hostVersion: getAppVersion(),
          packFormat: PACK_SNAPSHOT_FORMAT,
          // Installing over a pack that is already running is a reinstall, or the same pack from another
          // source. It is torn down before its files are replaced rather than after: a pack left running
          // on a directory that has been swapped underneath it loads the new code on its next lazy
          // require. Silent (`replacing`), because the activation below announces the change.
          // **A shipped pack's id is not one an install may take**, which is what makes `canUninstall:
          // false` a promise rather than a hidden button: the same predicate answers both, so the two doors
          // to losing a pack the app needs are shut by one fact. Disabling, the third, is refused above for
          // the reason this is — the app boots with no packs and the control that would put it back is the
          // one the view does not draw.
          //
          // *"Installing over a pack is how an update lands"* is the general rule and does not reach this
          // case, because a shipped pack updates with the app. An install over one buys nothing the next
          // boot does not revert, and costs a session running a pack the user did not choose.
          //
          // Refused before the teardown below, so a refusal leaves the running pack untouched; `host` never
          // reaches here, the manifest schema having refused it. **The limit:** a shipped pack that failed
          // to load has no origin to read, so this cannot answer for it — `packOrigin` is the only thing
          // here that knows which ids are the app's, and the next boot's hash comparison is what recovers
          // that case (`tests/packs/shipped-packs.spec.ts`).
          beforePlace: (manifest) => {
            if (!registry.packOrigin(manifest.id)) return;
            if (!canUninstall(manifest.id)) {
              throw new Error(`"${manifest.id}" is part of AgentBuddy, so an install can't take its id`);
            }
            replacedId = manifest.id;
            teardownPack(registry, manifest.id, system.get(HOST.bus), { replacing: true });
            broadcastToPlugin('packs', { type: 'PACK_DEACTIVATED' as const, packId: manifest.id });
          },
        }).then(result => {
          recordInstalled(result.id, isGitHub ? packSlug : undefined);

          const activated = activatePack(registry, result.id, system.get(HOST.bus));
          const problem = activationProblem(registry, result.id, activated);
          if (problem) {
            if (replacedId && !activated) {
              // The replacement never registered: end the window, and tell the running systems the pack is gone
              registry.clearPackReplacing(result.id);
              system.get(HOST.bus).send({ type: 'PACK_CHANGED', packId: result.id });
            }
            broadcastToPlugin('packs', {
              type: 'PACK_INSTALL_FAILED' as const,
              packSlug,
              error: `${result.name} was installed but ${problem}`,
            });
            emitPacksList(registry, canUninstall);
            return;
          }

          broadcastToPlugin('packs', {
            type: 'PACK_INSTALL_COMPLETE' as const,
            packSlug,
            packId: result.id,
            packName: result.name,
            version: result.version,
          });
          broadcastToPlugin('packs', { type: 'PACK_ACTIVATED' as const, packId: result.id });
          emitPacksList(registry, canUninstall);
        }).catch(err => {
          const message = errorMessage(err);
          console.error(`[packs] Install failed for ${packSlug}:`, message);
          // The pack was torn down for a replacement that never arrived: end the window and say it is gone
          if (replacedId) {
            registry.clearPackReplacing(replacedId);
            system.get(HOST.bus).send({ type: 'PACK_CHANGED', packId: replacedId });
          }
          broadcastToPlugin('packs', {
            type: 'PACK_INSTALL_FAILED' as const,
            packSlug,
            error: message,
          });
        }).finally(() => {
          _inFlightOps.delete(packSlug);
        });
      },

      uninstallPack: ({ system, event }) => {
        const ev = packsSpec.typeOf('UNINSTALL_PACK', event);
        const packId = ev.packId;
        if (!canUninstall(packId)) {
          broadcastToPlugin('packs', { type: 'PACK_UNINSTALL_FAILED' as const, packId, error: `"${packId}" is part of AgentBuddy, so it can't be uninstalled` });
          return;
        }
        // The id names the directory the uninstall deletes, so only an installed pack's own is taken
        if (!PACK_ID_PATTERN.test(packId) || !installedPacks().some(p => p.record.id === packId && path.basename(p.dir) === packId)) {
          broadcastToPlugin('packs', { type: 'PACK_UNINSTALL_FAILED' as const, packId, error: `"${packId}" is not an installed pack` });
          return;
        }

        if (_inFlightOps.has(packId)) {
          console.warn(`[packs] Operation already in progress for ${packId}, skipping uninstall`);
          return;
        }
        _inFlightOps.add(packId);
        console.log(`[packs] Uninstall requested: ${packId}`);

        teardownPack(registry, packId, system.get(HOST.bus));
        broadcastToPlugin('packs', { type: 'PACK_DEACTIVATED' as const, packId });

        runUninstall(packId).then(() => {
          forgetPack(packId);

          broadcastToPlugin('packs', {
            type: 'PACK_UNINSTALL_COMPLETE' as const,
            packId,
          });
          emitPacksList(registry, canUninstall);
        }).catch(err => {
          const message = errorMessage(err);
          console.error(`[packs] Uninstall failed for ${packId}:`, message);
          broadcastToPlugin('packs', {
            type: 'PACK_UNINSTALL_FAILED' as const,
            packId,
            error: message,
          });
        }).finally(() => {
          _inFlightOps.delete(packId);
        });
      },

      updatePack: ({ system, event }) => {
        const ev = packsSpec.typeOf('UPDATE_PACK', event);
        const packId = ev.packId;
        const entry = packRecord(packId);
        if (!entry.installedFrom) {
          broadcastToPlugin('packs', {
            type: 'PACK_UPDATE_FAILED' as const,
            packId,
            error: 'Pack has no update source',
          });
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
        teardownPack(registry, packId, system.get(HOST.bus), { replacing: true });
        broadcastToPlugin('packs', { type: 'PACK_DEACTIVATED' as const, packId });
        let activated = false;

        installPackFromGitHub(target, undefined, {
          hostVersion: getAppVersion(),
          packFormat: PACK_SNAPSHOT_FORMAT,
          // Refused before the files are replaced, so the failure below reactivates the copy still in place
          beforePlace: (manifest) => {
            if (manifest.id !== packId) throw new Error(`${target} holds the pack "${manifest.id}", not "${packId}"`);
          },
        }).then(result => {
          recordUpdateInstalled(packId);

          activated = activatePack(registry, packId, system.get(HOST.bus));
          const problem = activationProblem(registry, packId, activated);
          if (problem) {
            broadcastToPlugin('packs', {
              type: 'PACK_UPDATE_FAILED' as const,
              packId,
              error: `Updated to ${result.version} but ${problem}`,
            });
            emitPacksList(registry, canUninstall);
            return;
          }

          broadcastToPlugin('packs', {
            type: 'PACK_UPDATE_COMPLETE' as const,
            packId,
            version: result.version,
          });
          broadcastToPlugin('packs', { type: 'PACK_ACTIVATED' as const, packId });
          emitPacksList(registry, canUninstall);
        }).catch(err => {
          const message = errorMessage(err);
          console.error(`[packs] Update failed for ${packId}:`, message);
          activated = activatePack(registry, packId, system.get(HOST.bus));
          if (activated) {
            broadcastToPlugin('packs', { type: 'PACK_ACTIVATED' as const, packId });
          }
          broadcastToPlugin('packs', {
            type: 'PACK_UPDATE_FAILED' as const,
            packId,
            error: message,
          });
          emitPacksList(registry, canUninstall);
        }).finally(() => {
          // Registering the replacement clears this; if nothing registered, the window ends here rather
          // than leaving the pack's plugins marked as expected-to-be-missing for the rest of the run
          registry.clearPackReplacing(packId);
          // Activation sends PACK_CHANGED itself; without it the pack is gone, which running systems must hear
          if (!activated) system.get(HOST.bus).send({ type: 'PACK_CHANGED', packId });
          _inFlightOps.delete(packId);
        });
      },

      checkForPackUpdates: () => {
        checkForUpdates({ hostVersion: getAppVersion() }).then(() => {
          emitPacksList(registry, canUninstall);
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

        // Refused for the packs `canUninstall` refuses, and for its reason: the app needs what it ships to
        // run. Every pack is an installed record now, so the lookup above no longer turns one of them away
        // on its own — and the Packs view hides this switch for them (`PackDetail.vue`), so a disabled
        // shipped pack could only be re-enabled by editing `installed-packs.json` by hand. The state it
        // sends back is the record's own, not `true`: an answer that invented one would be the same bug.
        if (!canUninstall(packId)) {
          broadcastToPlugin('packs', { type: 'PACK_ENABLED_CHANGED' as const, packId, enabled: entry.enabled });
          reportError({
            source: 'packs',
            operation: 'togglePackEnabled',
            severity: 'error',
            error: new Error(`"${packId}" is part of AgentBuddy, so it can't be disabled`),
          });
          return;
        }

        const newEnabled = !entry.enabled;

        if (!newEnabled) {
          teardownPack(registry, packId, system.get(HOST.bus));
          broadcastToPlugin('packs', { type: 'PACK_DEACTIVATED' as const, packId });
        } else {
          activatePack(registry, packId, system.get(HOST.bus));
          broadcastToPlugin('packs', { type: 'PACK_ACTIVATED' as const, packId });
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
        broadcastToPlugin('packs', {
          type: 'PACK_ENABLED_CHANGED' as const,
          packId,
          enabled: newEnabled,
        });
        emitPacksList(registry, canUninstall);
      },
    }),
  }).createMachine({
    id: HOST.packs,
    initial: 'idle',
    context: {},
    states: {
      idle: {
        on: {
          SEND_STATE: {
            actions: 'sendPacksList',
          },
          GET_INSTALLED_PACKS: {
            actions: 'sendPacksList',
          },
          // A pack activated, reloaded or torn down changes this list, and a reload is the one that
          // reaches here no other way: it comes from `abuddy run`, not from an action of this system
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
          PREVIEW_PACK_CONTENT: {
            actions: 'previewPackContent',
          },
          IMPORT_PACK_CONTENT: {
            actions: 'importPackContent',
          },
          RESTORE_CONTENT_ITEM: {
            actions: 'restoreContentItem',
          },
          DISMISS_CONTENT_OFFER: {
            actions: 'dismissContentOffer',
          },
          DELETE_CONTENT_ITEM: {
            actions: 'deleteContentItem',
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
  'SEND_STATE',
  'INSTALL_PACK',
  'UNINSTALL_PACK',
  'TOGGLE_PACK_ENABLED',
  'GET_INSTALLED_PACKS',
  'UPDATE_PACK',
  'CHECK_FOR_UPDATES',
  'PREVIEW_PACK_CONTENT',
  'IMPORT_PACK_CONTENT',
  'RESTORE_CONTENT_ITEM',
  'DISMISS_CONTENT_OFFER',
  'DELETE_CONTENT_ITEM',
]);
