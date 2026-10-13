import { describe, expect, it, vi } from 'vitest';
import type { PackFERegistration, SettingsPort } from '@apackdev/sdk/fe';
import type { StepDefinition } from '@apackdev/sdk/steps';
import { fakeSettings } from '@apackdev/sdk/testing';
import { createFePackRegistry } from '../../src/fe/pack-store.ts';

const target = { kind: 'feature', featureRef: 'owner/code' } as const;
const formTarget = { kind: 'pack', packId: 'owner', groupId: 'preferences' } as const;

function binding() {
  const source = fakeSettings({ features: { 'owner/code': { limit: 1 } } });
  const dispose = vi.fn();
  const cleanup = vi.fn();
  let port!: SettingsPort;
  const hook = vi.fn((accepted: SettingsPort) => { port = accepted; return { activate() {}, dispose: cleanup }; });
  return { source, dispose, cleanup, hook, get port() { return port; }, transport: { port: source, dispose } };
}

const registration = (name: string, hook?: PackFERegistration['bindSettings']): PackFERegistration => ({
  id: 'owner', bindSettings: hook,
  features: { code: { designation: 'editor', plugin: { label: name } as never } },
  settingsForms: { preferences: { name } }, appExtensions: { toolbar: { name } },
});

describe('prepared frontend replacement', () => {
  it('keeps published lookups and incumbent authority when the candidate binding throws', async () => {
    const packs = createFePackRegistry();
    const old = binding();
    packs.registerPackFE(registration('Old', old.hook), old.transport);
    const previous = packs.settingsForm(formTarget);
    const notified = vi.fn();
    packs.onSettingsFormsChanged(notified);
    const next = binding();
    expect(() => packs.replacePackFE(registration('New', port => { next.hook(port); throw new Error('refused'); }), next.transport)).toThrow('refused');
    expect(packs.settingsForm(formTarget)).toBe(previous);
    expect(packs.getRegisteredPlugins()[0].label).toBe('Old');
    expect(old.dispose).not.toHaveBeenCalled();
    expect(old.cleanup).not.toHaveBeenCalled();
    expect(old.port.get(target)).toEqual({ limit: 1 });
    expect(() => next.port.get(target)).toThrow('revoked');
    expect((await next.port.update(target, ['limit'], 9)).status).toBe('refused');
    expect(next.dispose).toHaveBeenCalledOnce();
    expect(notified).not.toHaveBeenCalled();
  });

  it('refuses a component loader failure without touching incumbent resources or authored facets', () => {
    const packs = createFePackRegistry();
    const old = binding();
    packs.registerPackFE(registration('Old', old.hook), old.transport);
    const next = binding();
    const loader = vi.fn(() => { throw new Error('broken component'); });
    const step = { type: 'broken', fe: { loadComponents: loader } } as unknown as StepDefinition;
    expect(() => packs.replacePackFE({ ...registration('New', next.hook), steps: [step] }, next.transport)).toThrow('broken component');
    expect(loader).toHaveBeenCalledOnce();
    expect(next.hook).not.toHaveBeenCalled();
    expect(old.cleanup).not.toHaveBeenCalled();
    expect(old.port.get(target)).toEqual({ limit: 1 });
    expect(step.fe?.components).toBeUndefined();
    expect(packs.getRegisteredPlugins()[0].label).toBe('Old');
  });

  it('publishes a successful replacement before retirement, and observers see only active new authority', () => {
    const packs = createFePackRegistry();
    const old = binding();
    packs.registerPackFE(registration('Old', old.hook), old.transport);
    const next = binding();
    const observed = vi.fn(() => {
      expect(packs.settingsForm(formTarget)).toMatchObject({ name: 'New' });
      expect(old.port.status()).toBe('disposed');
      expect(next.port.get(target)).toEqual({ limit: 1 });
    });
    const stop = packs.onSettingsFormsChanged(observed);
    packs.replacePackFE(registration('New', next.hook), next.transport);
    expect(observed).toHaveBeenCalledOnce();
    expect(old.cleanup).toHaveBeenCalledOnce();
    expect(old.dispose).toHaveBeenCalledOnce();
    expect(packs.designation('editor')).toBe('owner/code');
    stop();
    packs.unregisterPackFE('owner');
    expect(next.dispose).toHaveBeenCalledOnce();
  });

  it('stages pending authority without changing published forms, then disposes only the candidate', async () => {
    const packs = createFePackRegistry();
    const old = binding();
    packs.registerPackFE(registration('Old', old.hook), old.transport);
    const next = binding();
    const candidate = packs.preparePackFE(registration('New', next.hook), next.transport, true);
    expect(packs.settingsForm(formTarget)).toMatchObject({ name: 'Old' });
    expect(next.port.status()).toBe('loading');
    expect(() => next.port.get(target)).toThrow('before host acceptance');
    expect((await next.port.update(target, ['limit'], 3)).status).toBe('refused');
    expect(next.source.get(target)).toEqual({ limit: 1 });
    candidate.dispose();
    candidate.dispose();
    expect(next.dispose).toHaveBeenCalledOnce();
    expect(next.cleanup).toHaveBeenCalledOnce();
    expect(old.dispose).not.toHaveBeenCalled();
    expect(() => candidate.commit()).toThrow('pending');
  });

  it('refuses stale prepared publication after another registry change', () => {
    const packs = createFePackRegistry();
    packs.registerPackFE(registration('Old'));
    const next = binding();
    const candidate = packs.preparePackFE(registration('New', next.hook), next.transport, true);
    packs.registerPackFE({ id: 'other' });
    expect(() => candidate.commit()).toThrow('changed while');
    expect(packs.settingsForm(formTarget)).toMatchObject({ name: 'Old' });
    expect(next.dispose).toHaveBeenCalledOnce();
    candidate.dispose();
    expect(next.dispose).toHaveBeenCalledOnce();
    expect(packs.hasPackFE('other')).toBe(true);
  });

  it('never publishes a failed prepared host resource commit', () => {
    const packs = createFePackRegistry();
    packs.registerPackFE(registration('Old'));
    const next = binding();
    const candidate = packs.preparePackFE(registration('New', next.hook), next.transport, true);
    expect(() => candidate.commit(() => { throw new Error('style commit refused'); })).toThrow('style commit refused');
    expect(packs.settingsForm(formTarget)).toMatchObject({ name: 'Old' });
    expect(next.dispose).toHaveBeenCalledOnce();
    candidate.dispose();
    expect(next.dispose).toHaveBeenCalledOnce();
  });

  it('blocks reentrant admission while preparing executable bindings', () => {
    const packs = createFePackRegistry();
    packs.registerPackFE(registration('Old'));
    const next = binding();
    expect(() => packs.replacePackFE(registration('New', () => {
      packs.registerPackFE({ id: 'nested' });
      return { activate() {}, dispose() {} };
    }), next.transport)).toThrow('already in progress');
    expect(packs.hasPackFE('nested')).toBe(false);
    expect(packs.settingsForm(formTarget)).toMatchObject({ name: 'Old' });
  });

  it('revokes retained ports and subscriptions even when generated cleanup does nothing', async () => {
    const packs = createFePackRegistry();
    const old = binding();
    const stop = vi.fn();
    let deliver!: () => void;
    old.source.subscribe = listener => { deliver = listener; return stop; };
    packs.registerPackFE(registration('Old', old.hook), old.transport);
    const listener = vi.fn();
    old.port.subscribe(listener);
    packs.replacePackFE(registration('New'));
    deliver();
    expect(listener).not.toHaveBeenCalled();
    expect(stop).toHaveBeenCalledOnce();
    expect((await old.port.reset(target)).status).toBe('refused');
  });

  it('contains retirement failures after publication', () => {
    const packs = createFePackRegistry();
    const old = binding();
    old.cleanup.mockImplementation(() => { throw new Error('cleanup refused'); });
    old.dispose.mockImplementation(() => { throw new Error('transport refused'); });
    packs.registerPackFE(registration('Old', old.hook), old.transport);
    expect(() => packs.replacePackFE(registration('New'))).not.toThrow();
    expect(packs.settingsForm(formTarget)).toMatchObject({ name: 'New' });
    expect(old.port.status()).toBe('disposed');
  });

  it('refuses duplicate roles within one owner before binding or loading components', () => {
    const packs = createFePackRegistry();
    const next = binding();
    expect(() => packs.registerPackFE({ id: 'owner', bindSettings: next.hook,
      features: { first: { designation: 'editor' }, second: { designation: 'editor' } },
    }, next.transport)).toThrow('declares designation "editor" twice');
    expect(next.hook).not.toHaveBeenCalled();
    expect(next.dispose).toHaveBeenCalledOnce();
    expect(packs.designation('editor')).toBeUndefined();
  });

  it('captures feature membership and role values once', () => {
    const packs = createFePackRegistry();
    const id = vi.fn(() => 'owner');
    const role = vi.fn(() => 'editor');
    const features = vi.fn(() => ({ code: { get designation() { return role(); } } }));
    packs.registerPackFE({ get id() { return id(); }, get features() { return features(); } });
    packs.registerPackFE({ id: 'other' });
    packs.unregisterPackFE('owner');
    expect(id).toHaveBeenCalledOnce();
    expect(features).toHaveBeenCalledOnce();
    expect(role).toHaveBeenCalledOnce();
    expect(packs.designation('editor')).toBeUndefined();
  });

  it('prepares removal without revoking incumbent authority until publication', () => {
    const packs = createFePackRegistry();
    const old = binding();
    packs.registerPackFE(registration('Old', old.hook), old.transport);
    const candidate = packs.prepareUnregisterPackFE('owner');
    expect(packs.hasPackFE('owner')).toBe(true);
    expect(old.port.get(target)).toEqual({ limit: 1 });
    candidate.dispose();
    expect(packs.hasPackFE('owner')).toBe(true);
    expect(old.dispose).not.toHaveBeenCalled();
    const removal = packs.prepareUnregisterPackFE('owner');
    removal.commit();
    expect(packs.hasPackFE('owner')).toBe(false);
    expect(old.dispose).toHaveBeenCalledOnce();
    expect(old.port.status()).toBe('disposed');
    expect(packs.settingsForm(formTarget)).toBeUndefined();
  });

  it('never rereads authored collection membership during another commit or removal', () => {
    const packs = createFePackRegistry();
    const type = vi.fn(() => 'captured');
    const steps = [{ get type() { return type(); } }] as StepDefinition[];
    packs.registerPackFE({ id: 'owner', steps });
    steps.length = 0;
    packs.registerPackFE({ id: 'other' });
    expect(type).toHaveBeenCalledOnce();
    expect(packs.step('captured')).toBeDefined();
    packs.unregisterPackFE('owner');
    expect(packs.step('captured')).toBeUndefined();
  });
});


it('preserves the incumbent when candidate activation throws before host resource publication', () => {
  const packs = createFePackRegistry();
  const old = binding();
  packs.registerPackFE(registration('Old', old.hook), old.transport);
  const next = binding();
  const dispose = vi.fn();
  const beforePublish = vi.fn();
  const candidate = packs.preparePackFE(registration('New', port => {
    next.hook(port);
    return { activate() { throw new Error('activation refused'); }, dispose };
  }), next.transport, true);
  expect(() => candidate.commit(beforePublish)).toThrow('activation refused');
  expect(beforePublish).not.toHaveBeenCalled();
  expect(packs.getRegisteredPlugins()[0].label).toBe('Old');
  expect(old.port.get(target)).toEqual({ limit: 1 });
  expect(old.dispose).not.toHaveBeenCalled();
  expect(dispose).toHaveBeenCalledOnce();
  expect(next.dispose).toHaveBeenCalledOnce();
});
