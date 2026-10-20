import { randomUUID } from 'node:crypto';
import type { SettingsAdmin, SettingsService } from '@apackdev/sdk/services';
import type { PackRegistry } from '../../../packs/registry.ts';
import { SettingsRefusedError } from '../document.ts';

export type SettingsAccess =
  | { kind: 'host'; service: SettingsAdmin }
  | { kind: 'pack'; service: SettingsService };

const requests = new WeakMap<object, () => SettingsAccess>();

/** Host transport/test composition only; authority never comes from an event property. */
export function bindSettingsRequest(event: object, resolve: () => SettingsAccess): void {
  requests.set(event, resolve);
}

/** Preserve authority when the bus copies a payload to attach request correlation. */
export function carrySettingsRequest(from: object, to: object): void {
  const resolve = requests.get(from);
  if (resolve) requests.set(to, resolve);
}

export function settingsRequestAccess(event: object): SettingsAccess {
  const resolve = requests.get(event);
  if (!resolve) throw new SettingsRefusedError(['Settings requests require host-issued access.']);
  return resolve();
}

export function settingsRequestAdmin(event: object): SettingsAdmin {
  const access = settingsRequestAccess(event);
  if (access.kind !== 'host') throw new SettingsRefusedError(['This operation requires host settings administration.']);
  return access.service;
}

export const SETTINGS_MUTATIONS = new Set(['RECOVER_SETTINGS', 'UPDATE_SETTINGS', 'RESET_SETTINGS', 'REPLACE_SETTINGS', 'RESET_ALL_SETTINGS', 'RESET_APP']);

interface Lease {
  client: string;
  access: SettingsAccess;
  runtime?: NonNullable<ReturnType<PackRegistry['getPackRuntime']>> & { declarationRevision: string; buildRevision: string };
}

/** Host-issued authority is bound to a connection and, for packs, the accepted runtime instance. */
export function createSettingsAccess(settings: SettingsAdmin, runtimeFor: PackRegistry['getPackRuntime']) {
  const leases = new Map<string, Lease>();
  const refusal = () => new SettingsRefusedError(['Settings access is unavailable. Reconnect or reload the accepted frontend.']);
  function issue(lease: Lease): string {
    const credential = randomUUID();
    leases.set(credential, lease);
    return credential;
  }

  return {
    /** Called by trusted window/tool setup; never inferred from a message's sender or target. */
    issueHost(client: string): string {
      return issue({ client, access: { kind: 'host', service: settings } });
    },
    issuePack(client: string, expected: { id: string; registrationId: string; declarationRevision: string; buildRevision: string }): string {
      const runtime = runtimeFor(expected.id);
      const origin = runtime?.origin;
      if (!runtime || runtime.registrationId !== expected.registrationId || !origin || origin.id !== expected.id || !expected.declarationRevision || !expected.buildRevision
        || origin.declarationRevision !== expected.declarationRevision || origin.buildRevision !== expected.buildRevision) throw refusal();
      return issue({ client, runtime: { ...runtime, declarationRevision: expected.declarationRevision, buildRevision: expected.buildRevision },
        access: { kind: 'pack', service: settings.forPack(origin.id) } });
    },
    resolve(client: string, credential: string): SettingsAccess {
      const lease = leases.get(credential);
      if (!lease || lease.client !== client) throw refusal();
      const runtime = lease.runtime;
      const current = runtime && runtimeFor(runtime.origin.id);
      if (runtime && (!current || current.origin !== runtime.origin || current.registrationId !== runtime.registrationId
        || runtime.origin.declarationRevision !== runtime.declarationRevision || runtime.origin.buildRevision !== runtime.buildRevision)) {
        leases.delete(credential);
        throw refusal();
      }
      return lease.access;
    },
    revoke(client: string, credential: string): void {
      if (leases.get(credential)?.client === client) leases.delete(credential);
    },
    releaseClient(client: string): void {
      for (const [credential, lease] of leases) if (lease.client === client) leases.delete(credential);
    },
  };
}
