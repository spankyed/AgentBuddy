import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEarsEngine, installEngine, installedEngine, repository } from '@abuddy/ears';
import { getPackCommands, getPackSettingsDefaults, type PackRegistration, type PackSystemDef } from '@abuddy/sdk/framework';
import { artifactRegistry } from '@abuddy/sdk/artifacts';
import { _seedHookRegistry } from '@abuddy/sdk/seed';
import { SDK_ENTITIES } from '@abuddy/sdk/types';
import { HOST_ENTITY_TYPES } from '../../src/app-state/index.ts';
import { getDesignated, hasDesignation } from '@abuddy/sdk/designations';
import { startTestRuntime } from '@abuddy/sdk/testing';
import { createPackRegistry } from '../../src/packs/pack-registration.ts';

const registry = createPackRegistry();
startTestRuntime({ packs: registry });
const {
  getPackExtensions, getRegisteredEARSPolicy, getRegisteredEntityTypes, getRegisteredServices,
  registerPack, systemIds, pluginIds, runRegisteredBootSeeds, unregisterPack,
} = registry;

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

describe('registerPack repositories', () => {
  const testEngine = installedEngine();
  afterEach(() => { installEngine(testEngine); });

  it("registers a pack's repositories with the installed engine (the app's), where repository and services read them", () => {
    const engine = createEarsEngine({ isEntityType: () => false });
    installEngine(engine.query);
    const noteQueries = { all: () => [] };
    registerPack({ id: 'repo-pack', systems: [], repositories: { noteQueries } });
    registered.push('repo-pack');
    expect(engine.query.repository.noteQueries).toBe(noteQueries);
    expect(repository.noteQueries).toBe(noteQueries);
    expect(engine.admin.repositories()).toEqual({ noteQueries });
  });

  it('removes them when the pack is unregistered', () => {
    const engine = createEarsEngine({ isEntityType: () => false });
    installEngine(engine.query);
    registerPack({ id: 'repo-pack', systems: [], repositories: { noteQueries: {} } });

    unregisterPack('repo-pack');

    expect(engine.admin.repositories()).toEqual({});
  });

  it('rejects a repository name another pack registered, keeping that pack\'s', () => {
    const engine = createEarsEngine({ isEntityType: () => false });
    installEngine(engine.query);
    const theirs = { name: 'theirs' };
    registerPack({ id: 'first-pack', systems: [], repositories: { settingsQueries: theirs } });
    registered.push('first-pack');

    expect(() => registerPack({ id: 'second-pack', systems: [], repositories: { memoQueries: {}, settingsQueries: {} } }))
      .toThrow('Repository collision: "settingsQueries" — pack "second-pack" vs "first-pack"');
    expect(engine.admin.repositories()).toEqual({ settingsQueries: theirs });
  });

  it("removes a pack's repositories when a later part of its registration is refused", () => {
    const engine = createEarsEngine({ isEntityType: () => false });
    installEngine(engine.query);
    registerPack({ id: 'first-pack', systems: [], commands: [{ name: 'standup', placeholder: 'Topic' }] } as unknown as PackRegistration);
    registered.push('first-pack');

    expect(() => registerPack({ id: 'second-pack', systems: [], repositories: { memoQueries: {} }, commands: [{ name: 'standup', placeholder: 'Theirs' }] } as unknown as PackRegistration))
      .toThrow('Command collision');
    expect(engine.admin.repositories()).toEqual({});
  });
});

describe('registerPack designations', () => {
  const system = (id: string) => ({ id, machine: {} as unknown as PackSystemDef['machine'], events: new Set<string>() });
  const journal = { id: 'journal', designation: 'journal', hasSystem: true, hasPlugin: false, services: [] };
  const registerDesignated = (id: string, systems: PackSystemDef[], extra: Partial<PackRegistration> = {}) => {
    registerPack({ id, systems, features: [journal], ...extra } as PackRegistration);
    registered.push(id);
  };

  // Its system and plugin share the feature's address, so the role resolves to it with or without a system
  it.each([
    ['with a system', [system('ext.journal')]],
    ['without one (the early system)', []],
  ])("resolves a role to the feature's address, %s", (_case, systems) => {
    registerDesignated('ext', systems);
    expect(getDesignated('journal')).toBe('ext.journal');
  });

  // `toPackSystemDefs` addresses a pack's systems; a hand-built one without its address is refused by name
  it("refuses a system that isn't addressed under its pack", () => {
    expect(() => registerDesignated('ext', [system('journal')]))
      .toThrow('Pack "ext": system "journal" isn\'t addressed as "ext.<featureId>"');
    expect(hasDesignation('journal')).toBe(false);
  });

  it('rejects a role another pack holds, registering none of the pack', () => {
    registerDesignated('first', [system('first.journal')]);
    expect(() => registerDesignated('second', [system('second.journal')], { services: { second: {} } }))
      .toThrow('Designation collision: role "journal" — pack "second" vs "first"');
    expect(getDesignated('journal')).toBe('first.journal');
    expect(getRegisteredServices()).not.toHaveProperty('second');
  });

  it("drops a pack's roles when it unregisters", () => {
    registerDesignated('ext', [system('ext.journal')]);
    unregisterPack(registered.pop()!);
    expect(hasDesignation('journal')).toBe(false);
  });
});

describe('registered addresses', () => {
  const systemDef = (id: string) => ({ id, machine: {} as unknown as PackSystemDef['machine'], events: new Set<string>() });

  it("lists every pack's systems and plugins at their addresses, the host's bare", () => {
    registerPack({
      id: 'ext', systems: [systemDef('ext.notes')],
      features: [{ id: 'notes', hasSystem: true, hasPlugin: true, services: [] }],
    } as unknown as PackRegistration);
    registered.push('ext');
    expect(systemIds()).toContain('ext.notes');
    expect(pluginIds()).toEqual(expect.arrayContaining(['ext.notes', 'application']));

    unregisterPack(registered.pop()!);
    expect(systemIds()).not.toContain('ext.notes');
    expect(pluginIds()).not.toContain('ext.notes');
  });
});

describe('registerPack entities', () => {
  const registerEntities = (id: string, entities: Record<string, string>, relKinds: Record<string, string> = {}) => {
    registerPack({ id, systems: [], ears: { entities, relKinds } } as unknown as PackRegistration);
    registered.push(id);
  };

  it('rejects an entity type another pack registered', () => {
    registerEntities('first-pack', { Memo: 'Memo' });
    expect(() => registerEntities('second-pack', { Memo: 'Memo' })).toThrow('EARS collision: entity type "Memo" — pack "second-pack" vs "first-pack"');
  });

  it("rejects a relation kind another pack registered, by its name or its value", () => {
    registerEntities('first-pack', {}, { PINNED: 'pinned' });
    expect(() => registerEntities('second-pack', {}, { PINNED: 'pinned' })).toThrow('EARS collision: relation kind "PINNED": "pinned" — pack "second-pack" vs "first-pack"');
    expect(() => registerEntities('second-pack', {}, { STUCK: 'pinned' })).toThrow('EARS collision: relation kind "STUCK": "pinned" — pack "second-pack" vs "first-pack"');
    expect(() => registerEntities('second-pack', {}, { PINNED: 'stuck' })).toThrow('EARS collision: relation kind "PINNED": "stuck" — pack "second-pack" vs "first-pack"');
  });

  it("rejects a pack built when its registration still listed its dependency's names", () => {
    registerEntities('base-pack', { Thread: 'Thread' });
    expect(() => registerEntities('older-pack', { Thread: 'Thread', Memo: 'Memo' })).toThrow('EARS collision: entity type "Thread" — pack "older-pack" vs "base-pack"');
  });

  it("has the SDK's and the host's entity types with no pack registered, and a pack's added", () => {
    const appEntities = [...Object.values(SDK_ENTITIES), ...HOST_ENTITY_TYPES];
    expect([...getRegisteredEntityTypes()].sort()).toEqual([...appEntities].sort());
    registerEntities('first-pack', { Memo: 'Memo' }, { PINNED: 'pinned' });
    expect([...getRegisteredEntityTypes()].sort()).toEqual([...appEntities, 'Memo'].sort());
    expect(getPackExtensions('first-pack')?.relKinds).toEqual({ PINNED: 'pinned' });
  });

  it.each([
    [{ AppState: 'AppState' }, {}, 'entity type "AppState"'],
    [{ Flow: 'Flow' }, {}, 'entity type "Flow"'],
    [{}, { CONTAINS: 'contains' }, 'relation kind "CONTAINS": "contains"'],
    [{}, { HOLDS: 'contains' }, 'relation kind "HOLDS": "contains"'],
    [{}, { CONTAINS: 'holds' }, 'relation kind "CONTAINS": "holds"'],
  ])('rejects %o %o, which the app declares', (entities, relKinds, name) => {
    expect(() => registerEntities('first-pack', entities, relKinds)).toThrow(`EARS collision: ${name} — pack "first-pack" vs the app's own`);
    expect(getPackExtensions('first-pack')).toBeNull();
  });

  it('keeps TNode out of persistence without any pack asking', () => {
    expect(getRegisteredEARSPolicy()).toEqual({ excludedEntityTypes: ['TNode'] });
  });
});

describe('registerPack feature settings', () => {
  const memos = { id: 'memos', hasSystem: false, services: [], settings: { plugins: { _meta: { visibility: { memos: false } }, memos: { sort: 'newest' } } } };

  it("registers a pack's feature settings as defaults and drops them when it unregisters", () => {
    registerPack({ id: 'memo-pack', systems: [], features: [memos] } as unknown as PackRegistration);
    expect(getPackSettingsDefaults().settings).toEqual({ plugins: { 'memo-pack.memos': { sort: 'newest' }, _meta: { visibility: { 'memo-pack.memos': false } } } });
    unregisterPack('memo-pack');
    expect(getPackSettingsDefaults().settings).toEqual({ plugins: {} });
  });

  it("rejects a pack whose feature settings change another plugin's, registering none of it", () => {
    const hooks = { ears: { entities: { Memo: 'Memo' }, relKinds: {} }, seedHooks: { Memo: {} } };
    const invalid = { ...memos, settings: { plugins: { threads: { hidden: true } } } };
    expect(() => registerPack({ id: 'bad-pack', systems: [], ...hooks, features: [invalid] } as unknown as PackRegistration))
      .toThrow('Feature "memos" settings set "plugins.threads"');
    expect(getPackExtensions('bad-pack')).toBeNull();
    expect(_seedHookRegistry.get('Memo')).toBeUndefined();
    expect(getPackSettingsDefaults().settings).toEqual({ plugins: {} });
  });
});

describe('registerPack seed hooks', () => {
  const memoHooks = { find: () => undefined };

  it('rejects hooks for an entity another pack owns, rolling back what the pack registered', () => {
    registerPack({ id: 'memo-pack', systems: [], ears: { entities: { Memo: 'Memo' }, relKinds: {} }, seedHooks: { Memo: memoHooks } } as unknown as PackRegistration);
    registered.push('memo-pack');

    const other = {
      id: 'other-pack',
      systems: [],
      ears: { entities: { Card: 'Card' }, relKinds: {} },
      artifacts: [{ type: 'card-view' }],
      commands: [{ name: 'card', placeholder: 'Title' }],
      seedHooks: { Card: {}, Memo: {} },
    };
    expect(() => registerPack(other as unknown as PackRegistration))
      .toThrow('Seed hooks for "Memo" are already registered by pack "memo-pack"');

    expect(getPackExtensions('other-pack')).toBeNull();
    expect(_seedHookRegistry.get('Memo')).toBe(memoHooks);
    expect(_seedHookRegistry.get('Card')).toBeUndefined();
    expect(artifactRegistry.has('card-view')).toBe(false);
    expect(getPackCommands()).toEqual([]);
  });

  it("drops a pack's hooks when it unregisters, freeing the entity for another pack", () => {
    registerPack({ id: 'memo-pack', systems: [], ears: { entities: { Memo: 'Memo' }, relKinds: {} }, seedHooks: { Memo: memoHooks } } as unknown as PackRegistration);
    unregisterPack('memo-pack');
    expect(_seedHookRegistry.get('Memo')).toBeUndefined();

    const theirs = {};
    registerPack({ id: 'other-pack', systems: [], seedHooks: { Memo: theirs } } as unknown as PackRegistration);
    registered.push('other-pack');
    expect(_seedHookRegistry.get('Memo')).toBe(theirs);
  });
});

describe('registerPack commands', () => {
  const commands = [{ name: 'standup', placeholder: 'Topic' }];

  it("registers a pack's declared commands and drops them when it unregisters", () => {
    registerPack({ id: 'memo-pack', systems: [], commands } as unknown as PackRegistration);
    expect(getPackCommands()).toEqual(commands);
    unregisterPack('memo-pack');
    expect(getPackCommands()).toEqual([]);
  });

  it('rejects a command another pack declares, registering none of the pack', () => {
    registerPack({ id: 'memo-pack', systems: [], commands } as unknown as PackRegistration);
    registered.push('memo-pack');

    expect(() => registerPack({ id: 'other-pack', systems: [], steps: [], commands: [{ name: 'standup', placeholder: 'Theirs' }] } as unknown as PackRegistration))
      .toThrow('Command collision: "standup" — pack "other-pack" vs "memo-pack"');

    expect(getPackExtensions('other-pack')).toBeNull();
    expect(getPackCommands()).toEqual(commands);
  });

  it("rolls its commands back when a later part of the registration is refused", () => {
    const invalid = { id: 'memos', hasSystem: false, services: [], settings: { plugins: { threads: { hidden: true } } } };

    expect(() => registerPack({ id: 'bad-pack', systems: [], commands, features: [invalid] } as unknown as PackRegistration)).toThrow();

    expect(getPackCommands()).toEqual([]);
    expect(getPackSettingsDefaults().settings).toEqual({ plugins: {} });
  });
});

describe('runRegisteredBootSeeds', () => {
  it("seeds a pack's declarative seedManifest and ignores any other boot key", () => {
    const seedManifest = { seedKeys: ['actions'], compiledDir: '/compiled' };
    const smuggled = vi.fn();
    registerPack({ id: 'built-in-pack', systems: [], boot: { seedManifest } } as unknown as PackRegistration);
    registerPack({ id: 'hooks-pack', systems: [], boot: { onInit() {}, seed: smuggled } } as unknown as PackRegistration);
    registered.push('built-in-pack', 'hooks-pack');

    const orchestrate = vi.fn();
    runRegisteredBootSeeds(orchestrate);

    expect(orchestrate).toHaveBeenCalledTimes(1);
    // With the pack it belongs to, so each pack's boot seed is tracked under its own id
    expect(orchestrate).toHaveBeenCalledWith(seedManifest, 'built-in-pack');
    expect(smuggled).not.toHaveBeenCalled();
    expect(getPackExtensions('built-in-pack')?.bootHooks).toEqual(['seedManifest']);
    expect(getPackExtensions('hooks-pack')?.bootHooks).toEqual(['onInit']);
  });
});
