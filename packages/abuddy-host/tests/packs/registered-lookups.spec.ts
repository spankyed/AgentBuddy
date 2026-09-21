// What a registered pack contributes, read through the functions packs call: each lookup sees a pack once it
// registers, loses it when it unregisters, and sees nothing of a registration that was refused.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { startTestRuntime } from '@abuddy/sdk/testing';
import { services } from '@abuddy/sdk/services';
import { getDesignated, hasDesignation } from '@abuddy/sdk/designations';
import { stepRegistry, type StepDefinition } from '@abuddy/sdk/steps';
import { artifactRegistry } from '@abuddy/sdk/artifacts';
import { blockRegistry } from '@abuddy/sdk/blocks';
import { _seedHookRegistry } from '@abuddy/sdk/seed';
import { getPackCommands, getPackSettingsDefaults, onPackSettingsDefaultsChanged, type PackRegistration, type PackSystemDef } from '@abuddy/sdk/framework';
import { seedData, type Seeder } from '@abuddy/sdk/utils';
import { createPackRegistry } from '../../src/packs/pack-registration.ts';

// How this spec registers and unregisters packs: a registry it creates, bound for the SDK's lookups
const registry = createPackRegistry();
startTestRuntime({ packs: registry });
const register = (pack: PackRegistration) => registry.registerPack(pack);
const unregister = (packId: string) => registry.unregisterPack(packId);

const registered: string[] = [];
afterEach(() => {
  for (const id of registered.splice(0)) unregister(id);
});

function add(pack: Partial<PackRegistration> & { id: string }): void {
  register({ systems: [], ...pack } as PackRegistration);
  registered.push(pack.id);
}

function remove(packId: string): void {
  registered.splice(registered.indexOf(packId), 1);
  unregister(packId);
}

const build = (label: string): StepDefinition['build'] => ({
  compile: () => ({ entity: {}, relations: [] }),
  validate: () => [],
  getLabel: () => label,
});

const noteStep: StepDefinition = {
  type: 'note',
  kind: 'step',
  build: build('Note'),
  fe: { nodeConfig: { label: 'Note' }, defaults: { text: '' } } as unknown as StepDefinition['fe'],
};
const tickTrigger: StepDefinition = {
  type: 'tick',
  kind: 'trigger',
  trigger: { trackField: 'every' } as unknown as StepDefinition['trigger'],
};
const system = (id: string) => ({ id, machine: {} as PackSystemDef['machine'], events: new Set<string>() });

describe('steps', () => {
  it("are found once their pack registers, and gone once it unregisters", () => {
    add({ id: 'note-pack', steps: [noteStep, tickTrigger] });

    expect(stepRegistry.get('note')).toBe(noteStep);
    expect(stepRegistry.has('tick')).toBe(true);
    expect(stepRegistry.getBuild('note')?.getLabel({}, 0)).toBe('Note');
    expect(stepRegistry.isTrigger('tick')).toBe(true);
    expect(stepRegistry.triggers()).toEqual([tickTrigger]);
    expect(stepRegistry.types()).toEqual(['note', 'tick']);
    expect(stepRegistry.all()).toEqual([noteStep, tickTrigger]);
    expect(stepRegistry.createNodeDefaults('note')).toEqual({ nodeType: 'note', label: 'Note', text: '' });

    remove('note-pack');
    expect(stepRegistry.get('note')).toBeUndefined();
    expect(stepRegistry.all()).toEqual([]);
    expect(stepRegistry.triggers()).toEqual([]);
    expect(stepRegistry.createNodeDefaults('note')).toEqual({ nodeType: 'note' });
  });

  it("aren't found when their pack's registration is refused later on", () => {
    add({ id: 'first-pack', commands: [{ name: 'standup', placeholder: 'Topic' }] });
    expect(() => add({ id: 'second-pack', steps: [noteStep], commands: [{ name: 'standup', placeholder: 'Theirs' }] }))
      .toThrow('Command collision');
    expect(stepRegistry.get('note')).toBeUndefined();
    expect(stepRegistry.all()).toEqual([]);
  });
});

describe('artifacts and blocks', () => {
  const cardView = { type: 'card-view', fe: { icon: 'card', component: 'CardView' } };
  const choice = { type: 'choice', kind: 'input' as const, fe: { component: 'Choice' } };

  it('are found once their pack registers, and gone once it unregisters', () => {
    add({ id: 'card-pack', artifacts: [cardView], blocks: [choice] });
    expect(artifactRegistry.get('card-view')).toBe(cardView);
    expect(artifactRegistry.getComponent('card-view')).toBe('CardView');
    expect(artifactRegistry.getIcon('card-view')).toBe('card');
    expect(artifactRegistry.all()).toEqual([cardView]);
    expect(blockRegistry.get('choice')).toBe(choice);
    expect(blockRegistry.getComponent('choice')).toBe('Choice');
    expect(blockRegistry.has('choice')).toBe(true);
    expect(blockRegistry.all()).toEqual([choice]);

    remove('card-pack');
    expect(artifactRegistry.has('card-view')).toBe(false);
    expect(artifactRegistry.all()).toEqual([]);
    expect(blockRegistry.get('choice')).toBeUndefined();
    expect(blockRegistry.all()).toEqual([]);
  });

  it("aren't found when their pack's registration is refused later on", () => {
    add({ id: 'memo-pack', seedHooks: { Memo: {} } });
    expect(() => add({ id: 'card-pack', artifacts: [cardView], blocks: [choice], seedHooks: { Memo: {} } })).toThrow('Seed hooks for "Memo"');
    expect(artifactRegistry.has('card-view')).toBe(false);
    expect(blockRegistry.has('choice')).toBe(false);
  });
});

describe('services', () => {
  it("are reachable through services while their pack is registered", () => {
    const memos = { list: () => [] };
    add({ id: 'memo-pack', services: { memos } });
    expect(services.memos).toBe(memos);
    expect(Object.keys(services)).toContain('memos');

    remove('memo-pack');
    expect(services.memos).toBeUndefined();
  });

  it("aren't reachable when their pack collides with another's", () => {
    add({ id: 'first-pack', services: { memos: {} } });
    expect(() => add({ id: 'second-pack', services: { memos: {}, cards: {} } })).toThrow('Service collision: key "memos"');
    expect(services.cards).toBeUndefined();
  });
});

describe('designations', () => {
  const journal = { id: 'journal', designation: 'journal', hasSystem: true, hasPlugin: false, services: [] };

  it('resolve to the system that plays the role while its pack is registered', () => {
    add({ id: 'ext', systems: [system('ext.journal')], features: [journal] });
    expect(hasDesignation('journal')).toBe(true);
    expect(getDesignated('journal')).toBe('ext.journal');

    remove('ext');
    expect(hasDesignation('journal')).toBe(false);
    expect(() => getDesignated('journal')).toThrow('No feature designated for "journal"');
  });

  it("keep the role with the pack that holds it when another pack's registration is refused", () => {
    add({ id: 'first', systems: [system('first.journal')], features: [journal] });
    expect(() => add({ id: 'second', systems: [system('second.journal')], features: [journal], steps: [noteStep] })).toThrow('Designation collision');
    expect(getDesignated('journal')).toBe('first.journal');
    expect(stepRegistry.has('note')).toBe(false);
  });
});

describe('seed hooks', () => {
  it("are found once their pack registers, and gone once it unregisters", () => {
    const hooks = { find: () => undefined };
    add({ id: 'memo-pack', seedHooks: { Memo: hooks } });
    expect(_seedHookRegistry.get('Memo')).toBe(hooks);
    remove('memo-pack');
    expect(_seedHookRegistry.get('Memo')).toBeUndefined();
  });
});

describe('seeders', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
  });

  /** A compiled seeds directory whose seeds.json names `packId` */
  function compiledDir(packId: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'registered-seeders-'));
    dirs.push(dir);
    fs.writeFileSync(path.join(dir, 'seeds.json'), JSON.stringify({ version: 1, packId, seeds: [] }));
    return dir;
  }
  const seeder = (key: string, created: number): Seeder => ({ key, seed: () => ({ created, updated: 0, skipped: 0 }) });

  it("run for their pack's compiled seeds while it's registered, each pack's apart", () => {
    add({ id: 'pack-a', seeders: [seeder('library', 1)] });
    add({ id: 'pack-b', seeders: [seeder('library', 2), seeder('notes', 3)] });
    expect(seedData({ compiledDir: compiledDir('pack-a') })).toEqual({ library: { created: 1, updated: 0, skipped: 0 } });
    expect(Object.keys(seedData({ compiledDir: compiledDir('pack-b') }))).toEqual(['library', 'notes']);

    remove('pack-a');
    expect(seedData({ compiledDir: compiledDir('pack-a') })).toEqual({});
  });

  it("refuse two seeders for one key in a pack, registering none of the pack", () => {
    expect(() => add({ id: 'pack-a', steps: [noteStep], seeders: [seeder('notes', 1), seeder('notes', 2)] }))
      .toThrow('Pack "pack-a" registers two seeders for seed key "notes"');
    expect(seedData({ compiledDir: compiledDir('pack-a') })).toEqual({});
    expect(stepRegistry.has('note')).toBe(false);
  });

  it("aren't run when their pack's registration is refused later on", () => {
    add({ id: 'first-pack', commands: [{ name: 'standup', placeholder: 'Topic' }] });
    expect(() => add({ id: 'pack-a', seeders: [seeder('notes', 1)], commands: [{ name: 'standup', placeholder: 'Theirs' }] })).toThrow('Command collision');
    expect(seedData({ compiledDir: compiledDir('pack-a') })).toEqual({});
  });
});

// Teardown removes a pack's contributions one at a time, and one of them can fail. Stopping there would
// leave the pack registered as well as half torn down — the worst of both — so the rest still come out and
// the pack still goes; what failed is reported.
describe('a contribution that cannot be taken back out', () => {
  /** A step that registers, and whose type can't be read a second time, so its own undo throws */
  function stepWithABrokenUndo(type: string): StepDefinition {
    let read = false;
    return {
      get type() {
        if (read) throw new Error(`cannot read the type of ${type}`);
        read = true;
        return type;
      },
      kind: 'step',
    } as unknown as StepDefinition;
  }

  it("still takes out the rest, still unregisters the pack, and says what was left", () => {
    registry.registerPack({
      id: 'breaks-on-teardown',
      systems: [],
      steps: [stepWithABrokenUndo('stuck')],
      commands: [{ name: 'leaves', placeholder: 'Cleanly' }],
    });

    expect(() => registry.unregisterPack('breaks-on-teardown'))
      .toThrow(/is unregistered, but 1 of its contributions could not be taken back out: cannot read the type of stuck/);

    // The pack is gone, not half gone...
    expect(registry.getPackRegistration('breaks-on-teardown')).toBeNull();
    expect(() => registry.unregisterPack('breaks-on-teardown')).toThrow('is not registered');
    // ...and the contributions that could come out did
    expect(getPackCommands()).toEqual([]);
  });
});

// The rollback's rule is that a refused pack leaves nothing of itself behind, and takes nothing of anyone
// else's with it. registerPack registers every kind of contribution through one table whose entries hand
// back their own undo, and the rollback and unregisterPack both run those — so what this pins is the rule,
// across the kinds, rather than three hand-written lists agreeing.
// A step type's build, runtime and frontend facets may come from different packs — that is what merging is
// for. Removing one pack used to drop the merged type outright, so the other pack's facet went with it until
// the app restarted. Reload is where that shows, being a teardown and a registration.
describe('a type two packs contribute facets of', () => {
  it("keeps the facets of the pack that stays when the other unregisters", () => {
    add({ id: 'build-pack', steps: [{ type: 'shared', kind: 'step', build: build('Shared') }] });
    add({ id: 'fe-pack', steps: [{ type: 'shared', kind: 'step', fe: { nodeConfig: { label: 'Shared' } } as never }] });
    expect(stepRegistry.get('shared')?.build).toBeDefined();
    expect(stepRegistry.get('shared')?.fe).toBeDefined();

    remove('fe-pack');

    expect(stepRegistry.get('shared'), "the remaining pack's step went with the one that left").toBeDefined();
    expect(stepRegistry.get('shared')?.build).toBeDefined();
    expect(stepRegistry.get('shared')?.fe).toBeUndefined();
  });

  it('is gone once the last pack contributing it unregisters', () => {
    add({ id: 'only-pack', artifacts: [{ type: 'solo-view' } as never] });
    expect(artifactRegistry.has('solo-view')).toBe(true);

    remove('only-pack');
    expect(artifactRegistry.has('solo-view')).toBe(false);
  });
});

// A plugin is addressed `<packId>.<featureId>`, so two packs with a `memos` feature have a plugin each and
// neither shadows the other.
describe('two packs naming the same feature', () => {
  const withPlugin = (id: string, pluginId: string) =>
    ({ id, systems: [], features: [{ id: pluginId, hasSystem: false, hasPlugin: true, services: [] }] });

  it('both register, each addressing its own plugin', () => {
    add({ ...withPlugin('first-pack', 'memos'), receivedEventTypes: { memos: ['FIRST_EVENT'] } });
    add({ ...withPlugin('second-pack', 'memos'), receivedEventTypes: { memos: ['SECOND_EVENT'] }, steps: [noteStep] });

    const map = registry.getPluginEventValidationMap();
    expect(map.get('first-pack.memos')).toEqual(new Set(['FIRST_EVENT']));
    expect(map.get('second-pack.memos')).toEqual(new Set(['SECOND_EVENT']));
    expect(map.has('memos'), 'a bare feature id is nobody\'s address').toBe(false);
    expect(stepRegistry.has('note')).toBe(true);
  });

  // Bare ids are the host's namespace; a pack naming a feature after one still gets an id of its own
  it("leaves the host's own plugin alone when a feature is named after it", () => {
    const host = registry.getPluginEventValidationMap().get('application');
    add({ ...withPlugin('impostor', 'application'), receivedEventTypes: { application: ['HIJACKED'] } });

    expect(registry.getPluginEventValidationMap().get('application')).toEqual(host);
    expect(registry.getPluginEventValidationMap().get('impostor.application')).toEqual(new Set(['HIJACKED']));
  });
});

describe('a pack whose registration is refused', () => {
  const scratch: string[] = [];
  afterEach(() => { for (const dir of scratch.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });
  /** A compiled seeds directory whose seeds.json names `packId` */
  const seedsOf = (packId: string) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'refused-rollback-'));
    scratch.push(dir);
    fs.writeFileSync(path.join(dir, 'seeds.json'), JSON.stringify({ version: 1, packId, seeds: [] }));
    return dir;
  };
  const aSeeder = (key: string): Seeder => ({ key, seed: () => ({ created: 1, updated: 0, skipped: 0 }) });

  it('takes back every kind it had registered, and leaves the pack it collided with whole', () => {
    add({
      id: 'incumbent',
      steps: [noteStep],
      artifacts: [{ type: 'note-view' } as never],
      blocks: [{ type: 'note-block' } as never],
      seedHooks: { Note: {} as never },
      seeders: [aSeeder('notes')],
      commands: [{ name: 'standup', placeholder: 'Topic' }],
      features: [{ id: 'notes', hasSystem: false, hasPlugin: true, services: [], settings: { plugins: { notes: { from: 'incumbent' } } } }],
    });

    // Every kind of its own, and a command the incumbent already declares — refused after the rest registered
    expect(() => add({
      id: 'refused',
      steps: [tickTrigger],
      artifacts: [{ type: 'card-view' } as never],
      blocks: [{ type: 'card-block' } as never],
      seedHooks: { Card: {} as never },
      seeders: [aSeeder('cards')],
      commands: [{ name: 'standup', placeholder: 'Theirs' }],
      features: [{ id: 'cards', hasSystem: false, hasPlugin: true, services: [], settings: { plugins: { cards: {} } } }],
    })).toThrow('Command collision');

    // Nothing of the refused pack survives
    expect(stepRegistry.has('tick')).toBe(false);
    expect(artifactRegistry.has('card-view')).toBe(false);
    expect(blockRegistry.has('card-block')).toBe(false);
    expect(_seedHookRegistry.get('Card')).toBeUndefined();
    expect(seedData({ compiledDir: seedsOf('refused') })).toEqual({});
    expect(getPackSettingsDefaults().settings.plugins).not.toHaveProperty('refused.cards');

    // ...and nothing of the incumbent's was taken with it
    expect(stepRegistry.has('note')).toBe(true);
    expect(artifactRegistry.has('note-view')).toBe(true);
    expect(blockRegistry.has('note-block')).toBe(true);
    expect(_seedHookRegistry.get('Note')).toBeDefined();
    expect(getPackCommands().map((c) => c.name)).toEqual(['standup']);
    expect(getPackSettingsDefaults().settings.plugins).toHaveProperty('incumbent.notes');
  });

  it('leaves no origin behind either', () => {
    add({ id: 'holder-pack', commands: [{ name: 'standup', placeholder: 'Topic' }] });
    const origin = { id: 'refused-pack', name: 'Refused', version: '1.0.0', dir: '/packs/refused-pack', builtIn: false };

    expect(() => registry.registerPack(
      { id: 'refused-pack', systems: [], commands: [{ name: 'standup', placeholder: 'Theirs' }] },
      origin,
    )).toThrow('Command collision');

    expect(registry.packOrigin('refused-pack')).toBeNull();
    expect(registry.externalPacks().map((o) => o.id)).not.toContain('refused-pack');
  });
});

describe('feature settings defaults', () => {
  const memos = { id: 'memos', hasSystem: false, hasPlugin: true, services: [], settings: { plugins: { memos: { sort: 'newest' } } } };
  const cards = { id: 'cards', hasSystem: false, hasPlugin: true, services: [], settings: { plugins: { _meta: { visibility: { cards: false } } } } };

  it('appear and disappear with their pack, each change announced with a new revision', () => {
    const changed = vi.fn();
    const unsubscribe = onPackSettingsDefaultsChanged(changed);
    const before = getPackSettingsDefaults().revision;

    add({ id: 'memo-pack', features: [memos] });
    add({ id: 'card-pack', features: [cards] });
    expect(getPackSettingsDefaults().settings).toEqual({ plugins: { 'memo-pack.memos': { sort: 'newest' }, _meta: { visibility: { 'card-pack.cards': false } } } });
    expect(getPackSettingsDefaults().revision).toBe(before + 2);
    expect(changed).toHaveBeenCalledTimes(2);

    remove('memo-pack');
    expect(getPackSettingsDefaults().settings).toEqual({ plugins: { _meta: { visibility: { 'card-pack.cards': false } } } });
    remove('card-pack');
    expect(getPackSettingsDefaults().settings).toEqual({ plugins: {} });
    expect(changed).toHaveBeenCalledTimes(4);

    unsubscribe();
    add({ id: 'memo-pack', features: [memos] });
    expect(changed).toHaveBeenCalledTimes(4);
  });

  it("don't change when a pack's settings are refused", () => {
    const revision = getPackSettingsDefaults().revision;
    const invalid = { ...memos, settings: { plugins: { threads: { hidden: true } } } };
    expect(() => add({ id: 'bad-pack', features: [invalid] })).toThrow('Feature "memos" settings set "plugins.threads"');
    expect(getPackSettingsDefaults()).toEqual({ revision, settings: { plugins: {} } });
  });
});

describe('commands', () => {
  it('appear in the order their packs first registered, and disappear with their pack', () => {
    add({ id: 'first-pack', commands: [{ name: 'first', placeholder: 'A' }] });
    add({ id: 'second-pack', commands: [{ name: 'second', placeholder: 'B' }] });
    expect(getPackCommands().map((c) => c.name)).toEqual(['first', 'second']);

    // A reload registers the pack again where it was
    remove('first-pack');
    expect(getPackCommands().map((c) => c.name)).toEqual(['second']);
    add({ id: 'first-pack', commands: [{ name: 'first', placeholder: 'A, rebuilt' }] });
    expect(getPackCommands()).toEqual([{ name: 'first', placeholder: 'A, rebuilt' }, { name: 'second', placeholder: 'B' }]);
  });

  it("aren't changed by a registration that collides", () => {
    add({ id: 'first-pack', commands: [{ name: 'standup', placeholder: 'Topic' }] });
    expect(() => add({ id: 'second-pack', commands: [{ name: 'digest', placeholder: 'Week' }, { name: 'standup', placeholder: 'Theirs' }] }))
      .toThrow('Command collision: "standup" — pack "second-pack" vs "first-pack"');
    expect(getPackCommands()).toEqual([{ name: 'standup', placeholder: 'Topic' }]);
  });
});
