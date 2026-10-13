import { describe, expect, it, vi } from 'vitest';
import type { SettingsAdmin, SettingsService } from '@apackdev/sdk/services';
import type { PackOrigin } from '../../../src/packs/registry.ts';
import { createSettingsAccess } from '../../../src/features/settings/be/access.ts';

const origin = (): PackOrigin => ({
  id: 'owner-pack', declarationRevision: 'declarations', artifactRevision: 'artifact',
  name: 'Owner', version: '1.0.0', dir: '/packs/owner-pack', shipped: false,
});
const expected = { id: 'owner-pack', declarationRevision: 'declarations', artifactRevision: 'artifact' };

function setup() {
  const scoped = { get: vi.fn(), set: vi.fn(), reset: vi.fn(), onChange: vi.fn() } as SettingsService;
  const settings = { forPack: vi.fn(() => scoped) } as unknown as SettingsAdmin;
  let accepted: PackOrigin | null = origin();
  const access = createSettingsAccess(settings, () => accepted);
  return { access, settings, scoped, replace: (value: PackOrigin | null) => { accepted = value; } };
}

describe('settings transport authority', () => {
  it('issues pack access only for matching accepted declarations and artifact', () => {
    const { access, settings, scoped } = setup();
    const credential = access.issuePack('window-one', expected);
    expect(access.resolve('window-one', credential)).toEqual({ kind: 'pack', service: scoped });
    expect(settings.forPack).toHaveBeenCalledWith('owner-pack');
    expect(() => access.resolve('window-two', credential)).toThrow('Settings access is unavailable');
    expect(() => access.resolve('window-one', 'owner-pack')).toThrow('Settings access is unavailable');
  });

  it.each([
    { ...expected, id: 'another-pack' },
    { ...expected, declarationRevision: '' },
    { ...expected, artifactRevision: '' },
    { ...expected, declarationRevision: 'stale' },
    { ...expected, artifactRevision: 'stale' },
  ])('refuses a stale frontend without supplying a service', candidate => {
    const { access, settings } = setup();
    expect(() => access.issuePack('window', candidate)).toThrow('Settings access is unavailable');
    expect(settings.forPack).not.toHaveBeenCalled();
  });

  it('refuses an unloaded or replacement runtime even when its artifact identity is unchanged', () => {
    const { access, replace } = setup();
    const credential = access.issuePack('window', expected);
    replace(origin());
    expect(() => access.resolve('window', credential)).toThrow('Settings access is unavailable');
    const replacement = access.issuePack('window', expected);
    replace(null);
    expect(() => access.resolve('window', replacement)).toThrow('Settings access is unavailable');
    expect(() => access.issuePack('window', expected)).toThrow('Settings access is unavailable');
  });

  it('refuses mutated acceptance metadata on the same origin object', () => {
    const { access, replace } = setup();
    const accepted = origin();
    replace(accepted);
    const credential = access.issuePack('window', expected);
    accepted.artifactRevision = 'changed';
    expect(() => access.resolve('window', credential)).toThrow('Settings access is unavailable');
  });

  it('releases every credential of a disconnected client without affecting other clients', () => {
    const { access, settings } = setup();
    const host = access.issueHost('window-one');
    const pack = access.issuePack('window-one', expected);
    const other = access.issueHost('window-two');
    access.releaseClient('window-one');
    expect(() => access.resolve('window-one', host)).toThrow('Settings access is unavailable');
    expect(() => access.resolve('window-one', pack)).toThrow('Settings access is unavailable');
    expect(access.resolve('window-two', other)).toEqual({ kind: 'host', service: settings });
  });

  it('lets only the owning connection revoke its credential', () => {
    const { access } = setup();
    const credential = access.issueHost('window-one');
    access.revoke('window-two', credential);
    expect(access.resolve('window-one', credential).kind).toBe('host');
    access.revoke('window-one', credential);
    access.revoke('window-one', credential);
    expect(() => access.resolve('window-one', credential)).toThrow('Settings access is unavailable');
  });
});
