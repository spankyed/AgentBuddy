import { afterEach, describe, expect, it } from 'vitest';
import type { PackRegistration } from '@abuddy/sdk/framework';
import { getRegisteredEntityTypes, getRegisteredServices, registerPack, unregisterPack } from '../../src/packs/pack-registration.ts';

const registered: string[] = [];
afterEach(() => {
  for (const id of registered.splice(0)) unregisterPack(id);
});

function register(id: string, services: Record<string, unknown>): void {
  registerPack({ id, systems: [], services } as unknown as PackRegistration);
  registered.push(id);
}

describe('registerPack services', () => {
  it('rejects a service name another pack registered', () => {
    register('first-pack', { llm: {} });
    expect(() => register('second-pack', { llm: {} })).toThrow('Service collision: key "llm" — pack "second-pack" vs "first-pack"');
  });

  it.each(['logger', 'emitter', 'repository'])('rejects a pack service named like the host service %s', (name) => {
    expect(() => register('shadowing-pack', { [name]: {} })).toThrow(`vs the host's own "${name}" service`);
    expect(getRegisteredServices()).not.toHaveProperty(name);
  });

  it('registers distinct services', () => {
    register('first-pack', { llm: 1 });
    register('second-pack', { search: 2 });
    expect(getRegisteredServices()).toEqual({ llm: 1, search: 2 });
  });
});

describe('registerPack entities', () => {
  const registerEntities = (id: string, entities: Record<string, string>) => {
    registerPack({ id, systems: [], ears: { entities, relKinds: {} } } as unknown as PackRegistration);
    registered.push(id);
  };

  it('rejects an entity type another pack registered', () => {
    registerEntities('first-pack', { Memo: 'Memo' });
    expect(() => registerEntities('second-pack', { Memo: 'Memo' })).toThrow('EARS collision: entity type "Memo" — pack "second-pack" vs "first-pack"');
  });

  it("treats the engine's Relation as every pack's, not a collision", () => {
    expect(getRegisteredEntityTypes().has('Relation')).toBe(true);
    // Packs built with an older SDK list it
    registerEntities('first-pack', { Relation: 'Relation', Memo: 'Memo' });
    expect(() => registerEntities('second-pack', { Relation: 'Relation', Tag: 'Tag' })).not.toThrow();
    expect([...getRegisteredEntityTypes()].sort()).toEqual(['Memo', 'Relation', 'Tag']);
  });
});
