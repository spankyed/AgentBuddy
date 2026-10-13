import { randomUUID } from 'node:crypto';
import type { SettingsAdmin, SettingsService } from '@apackdev/sdk/services';
import type { PackOrigin } from '../../../packs/registry.ts';
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

export const SETTINGS_MUTATIONS = new Set(['UPDATE_SETTINGS', 'RESET_SETTINGS', 'REPLACE_SETTINGS', 'RESET_ALL_SETTINGS', 'RESET_APP']);

interface Lease {
  client: string;
  access: SettingsAccess;
  runtime?: { origin: PackOrigin; declarationRevision: string; artifactRevision: string };
}

/** Host-issued authority is bound to a connection and, for packs, the accepted runtime instance. */
export function createSettingsAccess(settings: SettingsAdmin, originFor: (packId: string) => PackOrigin | null) {
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
    issuePack(client: string, expected: { id: string; declarationRevision: string; artifactRevision: string }): string {
      const origin = originFor(expected.id);
      if (!origin || origin.id !== expected.id || !expected.declarationRevision || !expected.artifactRevision
        || origin.declarationRevision !== expected.declarationRevision || origin.artifactRevision !== expected.artifactRevision) throw refusal();
      return issue({ client, runtime: { origin, declarationRevision: expected.declarationRevision, artifactRevision: expected.artifactRevision },
        access: { kind: 'pack', service: settings.forPack(origin.id) } });
    },
    resolve(client: string, credential: string): SettingsAccess {
      const lease = leases.get(credential);
      if (!lease || lease.client !== client) throw refusal();
      const runtime = lease.runtime;
      if (runtime && (originFor(runtime.origin.id) !== runtime.origin
        || runtime.origin.declarationRevision !== runtime.declarationRevision || runtime.origin.artifactRevision !== runtime.artifactRevision)) {
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
