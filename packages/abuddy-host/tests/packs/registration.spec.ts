import { afterEach, describe, expect, it } from 'vitest';
import { createEarsEngine, installEngine, installedEngine, repository } from '@abuddy/ears';
import { getPackCommands, getPackSettingsDefaults, type PackFeatureSystem, type PackRegistration } from '@abuddy/sdk/framework';
import { artifactRegistry } from '@abuddy/sdk/artifacts';
import { _contentWriterRegistry } from '@abuddy/sdk/content';
import { SDK_ENTITIES } from '@abuddy/sdk/types';
import { HOST_ENTITY_TYPES } from '../../src/app-state/index.ts';
import { getDesignated, hasDesignation } from '@abuddy/sdk/designations';
import { startTestRuntime } from '@abuddy/sdk/testing';
import { createPackRegistry } from '../../src/packs/registry.ts';
import { hostRegistration } from '../../src/features/registration.ts';
import { HOST } from '../../src/refs.ts';
import { HOST_PACK_ID } from '@abuddy/sdk/ids';

const registry = createPackRegistry();
startTestRuntime({ packs: registry });
const {
  getPackExtensions, getRegisteredEntityTypes, getRegisteredServices,
  registerPack, systemIds, pluginIds, unregisterPack,
} = registry;

const registered: string[] = [];
afterEach(() => {
  for (const id of registered.splice(0)) unregisterPack(id);
});

function register(id: string, services: Record<string, unknown>): void {
  registerPack({ id, services } as unknown as PackRegistration);
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
    registerPack({ id: 'repo-pack', repositories: { noteQueries } });
    registered.push('repo-pack');
    expect(engine.query.repository.noteQueries).toBe(noteQueries);
    expect(repository.noteQueries).toBe(noteQueries);
    expect(engine.admin.repositories()).toEqual({ noteQueries });
  });

  it('removes them when the pack is unregistered', () => {
    const engine = createEarsEngine({ isEntityType: () => false });
    installEngine(engine.query);
    registerPack({ id: 'repo-pack', repositories: { noteQueries: {} } });

    unregisterPack('repo-pack');

    expect(engine.admin.repositories()).toEqual({});
  });

  it('rejects a repository name another pack registered, keeping that pack\'s', () => {
    const engine = createEarsEngine({ isEntityType: () => false });
    installEngine(engine.query);
    const theirs = { name: 'theirs' };
    registerPack({ id: 'first-pack', repositories: { settingsQueries: theirs } });
    registered.push('first-pack');

    expect(() => registerPack({ id: 'second-pack', repositories: { memoQueries: {}, settingsQueries: {} } }))
      .toThrow(/"settingsQueries"[\s\S]*"second-pack"[\s\S]*"first-pack"/);
    expect(engine.admin.repositories()).toEqual({ settingsQueries: theirs });
  });

  it("removes a pack's repositories when a later part of its registration is refused", () => {
    const engine = createEarsEngine({ isEntityType: () => false });
    installEngine(engine.query);
    registerPack({ id: 'first-pack', commands: [{ name: 'standup', placeholder: 'Topic' }] } as unknown as PackRegistration);
    registered.push('first-pack');

    expect(() => registerPack({ id: 'second-pack', repositories: { memoQueries: {} }, commands: [{ name: 'standup', placeholder: 'Theirs' }] } as unknown as PackRegistration))
      .toThrow('Command collision');
    expect(engine.admin.repositories()).toEqual({});
  });
});

/**
 * The host's own features are addressed as `HOST.<feature>`, not by a role. Settings claimed the `settings`
 * designation from when it was a default-setup feature, and every reader of that role turned out to be the app
 * resolving its own plugin. The role is gone; the plugin is registered and reachable without it, and the name is
 * free for a pack to take.
 */
describe('the host claims no designation', () => {
  it('registers its features with no role, and the Settings view is still registered', () => {
    registry.registerPack(hostRegistration());
    registered.push(HOST_PACK_ID);

    expect(pluginIds()).toContain(HOST.settings);
    expect(hasDesignation('settings')).toBe(false);
  });

  // A role is a pack's own name for a pack's own feature, `settings` included: the app's view is registered at its
  // ref either way, and the two are not the same thing
  it('leaves every role name to the packs, `settings` included', () => {
    registry.registerPack(hostRegistration());
    registered.push(HOST_PACK_ID);
    registerPack({ id: 'ext', features: { prefs: { designation: 'settings', plugin: { receives: [] } } } });
    registered.push('ext');

    expect(getDesignated('settings')).toBe('ext/prefs');
    expect(pluginIds()).toContain(HOST.settings);
  });
});

describe('registerPack designations', () => {
  const system: PackFeatureSystem = { machine: {} as PackFeatureSystem['machine'], receives: [] };
  const registerDesignated = (id: string, journal: { system?: PackFeatureSystem } = { system }, extra: Partial<PackRegistration> = {}) => {
    registerPack({ id, features: { journal: { designation: 'journal', ...journal } }, ...extra });
    registered.push(id);
  };

  // Its system and plugin share the feature's address, so the role resolves to it whether it has a system, runs
  // it early, or has none
  it.each([
    ['with a system', { system }],
    ['with an early system', { system: { ...system, early: true as const } }],
    ['without one', {}],
  ])("resolves a role to the feature's address, %s", (_case, journal) => {
    registerDesignated('ext', journal);
    expect(getDesignated('journal')).toBe('ext/journal');
  });

  it('rejects a role another pack holds, registering none of the pack', () => {
    registerDesignated('first');
    expect(() => registerDesignated('second', { system }, { services: { second: {} } }))
      .toThrow('Designation collision: role "journal" — pack "second" vs "first"');
    expect(getDesignated('journal')).toBe('first/journal');
    expect(getRegisteredServices()).not.toHaveProperty('second');
  });

});

describe('registered addresses', () => {
  it("lists every pack's systems and plugins at their refs", () => {
    registerPack({ id: 'ext', features: { notes: { system: { machine: {} as PackFeatureSystem['machine'], receives: [] }, plugin: { receives: [] } } } });
    registered.push('ext');
    expect(systemIds()).toContain('ext/notes');
    expect(pluginIds()).toContain('ext/notes');

    unregisterPack(registered.pop()!);
    expect(systemIds()).not.toContain('ext/notes');
    expect(pluginIds()).not.toContain('ext/notes');
  });
});

describe('registerPack entities', () => {
  const registerEntities = (id: string, entities: Record<string, string>, relKinds: Record<string, string> = {}) => {
    registerPack({ id, ears: { entities, relKinds } } as unknown as PackRegistration);
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
    [{ AppliedContent: 'AppliedContent' }, {}, 'entity type "AppliedContent"'],
    [{ Flow: 'Flow' }, {}, 'entity type "Flow"'],
    [{}, { CONTAINS: 'contains' }, 'relation kind "CONTAINS": "contains"'],
    [{}, { HOLDS: 'contains' }, 'relation kind "HOLDS": "contains"'],
    [{}, { CONTAINS: 'holds' }, 'relation kind "CONTAINS": "holds"'],
  ])('rejects %o %o, which the app declares', (entities, relKinds, name) => {
    expect(() => registerEntities('first-pack', entities, relKinds)).toThrow(`EARS collision: ${name} — pack "first-pack" vs the app's own`);
    expect(getPackExtensions('first-pack')).toBeNull();
  });

});

describe('registerPack feature settings', () => {
  const memos = { settings: { visible: false, plugins: { memos: { sort: 'newest' } } } };

  it("rejects a pack whose feature settings change another plugin's, registering none of it", () => {
    const hooks = { ears: { entities: { Memo: 'Memo' }, relKinds: {} }, contentWriters: { Memo: {} } };
    const invalid = { ...memos, settings: { plugins: { threads: { hidden: true } } } };
    expect(() => registerPack({ id: 'bad-pack', ...hooks, features: { memos: invalid } } as unknown as PackRegistration))
      .toThrow('Feature "memos" settings set "plugins.threads"');
    expect(getPackExtensions('bad-pack')).toBeNull();
    expect(_contentWriterRegistry.get('Memo')).toBeUndefined();
    expect(getPackSettingsDefaults().settings).toEqual({ plugins: {} });
  });
});

describe('registerPack content writers', () => {
  const memoHooks = { find: () => undefined };

  it('rejects hooks for an entity another pack owns, rolling back what the pack registered', () => {
    registerPack({ id: 'memo-pack', ears: { entities: { Memo: 'Memo' }, relKinds: {} }, contentWriters: { Memo: memoHooks } } as unknown as PackRegistration);
    registered.push('memo-pack');

    const other = {
      id: 'other-pack',
      ears: { entities: { Card: 'Card' }, relKinds: {} },
      artifacts: [{ type: 'card-view' }],
      commands: [{ name: 'card', placeholder: 'Title' }],
      contentWriters: { Card: {}, Memo: {} },
    };
    expect(() => registerPack(other as unknown as PackRegistration))
      .toThrow('Content writers for "Memo" are already registered by pack "memo-pack"');

    expect(getPackExtensions('other-pack')).toBeNull();
    expect(_contentWriterRegistry.get('Memo')).toBe(memoHooks);
    expect(_contentWriterRegistry.get('Card')).toBeUndefined();
    expect(artifactRegistry.has('card-view')).toBe(false);
    expect(getPackCommands()).toEqual([]);
  });

  it("drops a pack's hooks when it unregisters, freeing the entity for another pack", () => {
    registerPack({ id: 'memo-pack', ears: { entities: { Memo: 'Memo' }, relKinds: {} }, contentWriters: { Memo: memoHooks } } as unknown as PackRegistration);
    unregisterPack('memo-pack');
    expect(_contentWriterRegistry.get('Memo')).toBeUndefined();

    const theirs = {};
    registerPack({ id: 'other-pack', contentWriters: { Memo: theirs } } as unknown as PackRegistration);
    registered.push('other-pack');
    expect(_contentWriterRegistry.get('Memo')).toBe(theirs);
  });
});

describe('registerPack commands', () => {
  const commands = [{ name: 'standup', placeholder: 'Topic' }];

  it('rejects a command another pack declares, registering none of the pack', () => {
    registerPack({ id: 'memo-pack', commands } as unknown as PackRegistration);
    registered.push('memo-pack');

    expect(() => registerPack({ id: 'other-pack', steps: [], commands: [{ name: 'standup', placeholder: 'Theirs' }] } as unknown as PackRegistration))
      .toThrow('Command collision: "standup" — pack "other-pack" vs "memo-pack"');

    expect(getPackExtensions('other-pack')).toBeNull();
    expect(getPackCommands()).toEqual(commands);
  });

  it("rolls its commands back when a later part of the registration is refused", () => {
    const invalid = { settings: { plugins: { threads: { hidden: true } } } };

    expect(() => registerPack({ id: 'bad-pack', commands, features: { memos: invalid } } as unknown as PackRegistration)).toThrow();

    expect(getPackCommands()).toEqual([]);
    expect(getPackSettingsDefaults().settings).toEqual({ plugins: {} });
  });
});

describe('packContentTargets', () => {
  const origin = (id: string, shipped: boolean, dependencies?: Record<string, string>) =>
    ({ id, name: id, version: '1.0.0', dir: `/packs/${id}`, shipped, manifest: { id, name: id, version: '1.0.0', dependencies } } as unknown as Parameters<typeof registerPack>[1]);

  // **A pack is writable because it is somewhere.** Its compiled content is files in its directory, which the
  // origin knows and a registration does not, so a pack never has to tell the host where its compiled data
  // is: a registration claiming a `compiledDir` is not enough to be written from.
  it('leaves out a pack with no origin, having nowhere to read content from', () => {
    registerPack({ id: 'nowhere-pack', boot: { onInit() {} } } as unknown as PackRegistration);
    registered.push('nowhere-pack');

    expect(registry.packContentTargets().map((t) => t.manifest.id)).not.toContain('nowhere-pack');
    // Still reported as a boot hook the pack declares, which is a different question
    expect(getPackExtensions('nowhere-pack')?.bootHooks).toEqual(['onInit']);
  });

  /**
   * An apply target is where a pack's content are and what it depends on, and nothing else: what an apply leaves
   * alone the applier decides from the rows, so nothing about a pack's content travels on its registration.
   */
  it("carries each pack's own id and directory, whoever ships it", () => {
    registerPack({ id: 'shipped-pack' } as PackRegistration, origin('shipped-pack', true));
    registerPack({ id: 'installed-pack' } as PackRegistration, origin('installed-pack', false));
    registered.push('shipped-pack', 'installed-pack');

    const targets = registry.packContentTargets();
    expect(targets.find((t) => t.manifest.id === 'shipped-pack'))
      .toEqual({ manifest: { id: 'shipped-pack', dependencies: undefined }, dir: '/packs/shipped-pack' });
    // Nothing in an apply target says which app shipped the pack: every pack's content are read from
    // `runtime/content` under its own directory
    expect(targets.find((t) => t.manifest.id === 'installed-pack'))
      .toEqual({ manifest: { id: 'installed-pack', dependencies: undefined }, dir: '/packs/installed-pack' });
  });

  // The order content run in, so a pack's content can reference what the packs it depends on written
  it('orders a pack after the packs it depends on', () => {
    registerPack({ id: 'base-pack' } as PackRegistration, origin('base-pack', true));
    registerPack({ id: 'dependent-pack' } as PackRegistration, origin('dependent-pack', false, { 'base-pack': '*' }));
    registered.push('base-pack', 'dependent-pack');

    const ids = registry.packContentTargets().map((t) => t.manifest.id);
    expect(ids.indexOf('base-pack')).toBeLessThan(ids.indexOf('dependent-pack'));
  });

  it('narrows to the packs it is given, which is what activating or reloading one content', () => {
    registerPack({ id: 'one-pack' } as PackRegistration, origin('one-pack', false));
    registerPack({ id: 'two-pack' } as PackRegistration, origin('two-pack', false));
    registered.push('one-pack', 'two-pack');

    expect(registry.packContentTargets(['two-pack']).map((t) => t.manifest.id)).toEqual(['two-pack']);
  });
});
