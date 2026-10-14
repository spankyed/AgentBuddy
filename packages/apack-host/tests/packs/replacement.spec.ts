import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createEarsEngine, installEngine } from '@apackdev/ears';
import { _createPackServices, type SettingsService } from '@apackdev/sdk/services';
import type { PackRegistration } from '@apackdev/sdk/framework';
import { createPackRegistry } from '../../src/packs/registry.ts';

const target = { kind: 'app' } as const;
let previousEngine: ReturnType<typeof installEngine>;
let engine: ReturnType<typeof createEarsEngine>;
beforeEach(() => {
  engine = createEarsEngine({ isEntityType: () => false });
  previousEngine = installEngine(engine.query);
});
afterEach(() => { installEngine(previousEngine); vi.restoreAllMocks(); });

function fixture() {
  const listeners = new Set<() => void>();
  const service: SettingsService = {
    get: <T,>() => ({ value: 1 }) as T,
    set() {}, reset() {},
    onChange(listener) { const notify = () => listener('written'); listeners.add(notify); return () => { listeners.delete(notify); }; },
  };
  const registry = createPackRegistry({
    nativeDeclarations: [{ id: 'incumbent', features: { widget: { description: 'Feature declaration fixture.',} } }, { id: 'peer', features: {} }],
    settingsForPack: () => service,
  });
  const generated = _createPackServices();
  const handle = generated.settingsHandle(target);
  const records = { owner: 'old' };
  const registration: PackRegistration = {
    id: 'incumbent', bindSettings: generated.bindSettings,
    features: { widget: { designation: 'before' } },
    repositories: { records }, services: { value: 'old' },
    commands: [{ name: 'old-command', placeholder: 'Old' }],
  };
  registry.registerPack(registration);
  const heard = vi.fn();
  handle.onChange(heard);
  const fresh = _createPackServices();
  const next: PackRegistration = {
    ...registration, bindSettings: fresh.bindSettings,
    features: { widget: { designation: 'after' } },
    repositories: { records: { owner: 'new' } }, services: { value: 'new' },
    commands: [{ name: 'new-command', placeholder: 'New' }],
  };
  return { registry, handle, heard, listeners, records, registration, fresh, next };
}

function assertIncumbent(f: ReturnType<typeof fixture>) {
  expect(f.registry.getPackRegistration('incumbent')).toBe(f.registration);
  expect(f.registry.designation('before')).toBe('incumbent/widget');
  expect(f.registry.designation('after')).toBeUndefined();
  expect(f.registry.commands().map(command => command.name)).toEqual(['old-command']);
  expect(f.registry.getRegisteredServices().value).toBe('old');
  expect(engine.query.repository.records).toBe(f.records);
  expect(f.handle.get()).toEqual({ value: 1 });
  for (const notify of f.listeners) notify();
  expect(f.heard).toHaveBeenCalled();
}

describe('accepted pack replacement', () => {
  it('publishes the candidate while the coordinator retains incumbent authority through actor cleanup', () => {
    const f = fixture();
    let dispose!: () => string[];
    const candidate = f.fresh.settingsHandle(target);
    expect(f.registry.replacePack(f.next, undefined, { retireBinding: cleanup => { dispose = cleanup; } })).toEqual([]);
    expect(f.registry.getPackRegistration('incumbent')).toBe(f.next);
    expect(candidate.get()).toEqual({ value: 1 });
    expect(f.handle.get()).toEqual({ value: 1 });
    expect(f.listeners.size).toBe(1);
    expect(dispose()).toEqual([]);
    expect(f.listeners.size).toBe(0);
    expect(() => f.handle.get()).toThrow('revoked');
    expect(candidate.get()).toEqual({ value: 1 });
  });

  it.each(['__proto__', 'constructor', 'toString'])('publishes, replaces and removes the exact repository key %s', name => {
    const f = fixture();
    f.next.repositories = { [name]: { owner: 'candidate' } };
    f.registry.replacePack(f.next);
    expect(engine.query.repository[name]).toBe(f.next.repositories[name]);
    expect(Object.hasOwn(engine.admin.repositories(), name)).toBe(true);
    expect(() => engine.query.repository.owner).toThrow('is not registered');
    f.registry.unregisterPack('incumbent');
    expect(engine.admin.repositories()).toEqual({});
    expect(() => engine.query.repository[name]).toThrow('is not registered');
    expect(() => engine.query.repository.owner).toThrow('is not registered');
  });

  it('retains the same incumbent handle and subscription when candidate binding refuses', () => {
    const f = fixture();
    f.next.bindSettings = () => {
      assertIncumbent(f); // Reentrant reads observe accepted state while the candidate is prepared.
      throw new Error('binding refused');
    };
    expect(() => f.registry.replacePack(f.next)).toThrow('binding refused');
    assertIncumbent(f);
    expect(f.listeners.size).toBe(1);
  });

  it('revokes a port captured by a hook that binds and then throws before returning cleanup', () => {
    const f = fixture();
    const provisional = f.fresh.settingsHandle(target);
    f.next.bindSettings = port => { f.fresh.bindSettings(port); throw new Error('hook refused after capture'); };
    expect(() => f.registry.replacePack(f.next)).toThrow('hook refused after capture');
    expect(() => provisional.get()).toThrow('revoked');
    assertIncumbent(f);
  });

  it('does not grant candidate operations until publication accepts its runtime', () => {
    const f = fixture();
    f.next.bindSettings = port => {
      expect(() => port.get(target)).toThrow('until the host accepts');
      expect(() => port.set(target, ['value'], 2)).toThrow('until the host accepts');
      return f.fresh.bindSettings(port);
    };
    f.registry.replacePack(f.next);
    expect(f.fresh.settingsHandle(target).get()).toEqual({ value: 1 });
  });

  it('rolls back failed repository publication and disposes only the provisional binding', () => {
    const f = fixture();
    const provisional = f.fresh.settingsHandle(target);
    f.next.repositories = { ...f.next.repositories, added: {} };
    const publish = engine.query.registerRepository;
    const register = vi.spyOn(engine.query, 'registerRepository').mockImplementation((name, value) => {
      if (name === 'added') throw new Error('publication refused');
      publish(name, value);
    });
    expect(() => f.registry.replacePack(f.next)).toThrow('publication refused');
    expect(register).toHaveBeenCalledTimes(3); // First entry, failed second entry, restored first entry.
    expect(engine.admin.repositories()).toEqual({ records: f.records });
    expect(() => provisional.get()).toThrow('revoked');
    assertIncumbent(f);
    expect(f.listeners.size).toBe(1);
  });

  it('publishes new contributions before retiring the old binding, without removing its repositories', () => {
    const f = fixture();
    expect(f.registry.replacePack(f.next)).toEqual([]);
    expect(f.registry.getPackRegistration('incumbent')).toBe(f.next);
    expect(f.registry.designation('before')).toBeUndefined();
    expect(f.registry.designation('after')).toBe('incumbent/widget');
    expect(f.registry.commands().map(command => command.name)).toEqual(['new-command']);
    expect(f.registry.getRegisteredServices().value).toBe('new');
    expect(engine.query.repository.records).toBe(f.next.repositories!.records);
    expect(() => f.handle.get()).toThrow('revoked');
    expect(f.listeners.size).toBe(0);
    expect(f.fresh.settingsHandle(target).get()).toEqual({ value: 1 });
    f.registry.unregisterPack('incumbent');
    expect(() => f.fresh.settingsHandle(target).get()).toThrow('until the host accepts');
    expect(engine.admin.repositories()).toEqual({});
  });

  it('reports old cleanup failure as committed replacement and never restores the disposed runtime', () => {
    const f = fixture();
    f.registry.unregisterPack('incumbent');
    const rebound = _createPackServices();
    const cleanup = vi.fn(() => { throw new Error('cleanup refused'); });
    f.registration.bindSettings = port => {
      const dispose = rebound.bindSettings(port);
      return () => { dispose(); cleanup(); };
    };
    f.registry.registerPack(f.registration);
    const old = rebound.settingsHandle(target);
    expect(f.registry.replacePack(f.next)).toEqual(['cleanup refused']);
    expect(f.registry.getPackRegistration('incumbent')).toBe(f.next);
    expect(() => old.get()).toThrow('revoked');
    expect(cleanup).toHaveBeenCalledOnce();
    f.registry.unregisterPack('incumbent');
    expect(cleanup).toHaveBeenCalledOnce();
  });

  it('revokes host-owned authority and subscriptions even when the hook omits generated cleanup', () => {
    const f = fixture();
    f.next.bindSettings = port => { f.fresh.bindSettings(port); return () => {}; };
    f.registry.replacePack(f.next);
    const current = f.fresh.settingsHandle(target);
    current.onChange(() => {});
    expect(f.listeners.size).toBe(1);
    f.registry.unregisterPack('incumbent');
    expect(f.listeners.size).toBe(0);
    expect(() => current.get()).toThrow('revoked');
  });

  it('retains admitted collection identities despite later authored registration mutation', () => {
    const f = fixture();
    f.registration.repositories = { foreign: {} };
    f.registration.commands![0].name = 'mutated';
    f.registration.services = { unrelated: 'mutated' };
    f.registry.registerPack({ id: 'peer' });
    expect(f.registry.commands().map(command => command.name)).toEqual(['old-command']);
    expect(f.registry.getRegisteredServices()).toEqual({ value: 'old' });
    expect(engine.query.repository.records).toBe(f.records);
    engine.query.registerRepository('foreign', 'unowned');
    f.registry.unregisterPack('incumbent');
    expect(engine.admin.repositories()).toEqual({ foreign: 'unowned' });
  });

  it('retires all accepted state on unload even when binding cleanup throws', () => {
    const f = fixture();
    const dispose = f.fresh.bindSettings;
    f.next.bindSettings = port => {
      const stop = dispose(port);
      return () => { stop(); throw new Error('unload cleanup refused'); };
    };
    f.registry.replacePack(f.next);
    const current = f.fresh.settingsHandle(target);
    expect(() => f.registry.unregisterPack('incumbent')).toThrow('unload cleanup refused');
    expect(f.registry.getPackRegistration('incumbent')).toBeNull();
    expect(f.registry.commands()).toEqual([]);
    expect(f.registry.designation('after')).toBeUndefined();
    expect(engine.admin.repositories()).toEqual({});
    expect(() => current.get()).toThrow('revoked');
  });

  it('refuses reentrant mutation while letting the candidate inspect accepted state', () => {
    const f = fixture();
    f.next.bindSettings = () => {
      assertIncumbent(f);
      f.registry.unregisterPack('incumbent');
      return () => {};
    };
    expect(() => f.registry.replacePack(f.next)).toThrow('change is already in progress');
    assertIncumbent(f);
  });
});
