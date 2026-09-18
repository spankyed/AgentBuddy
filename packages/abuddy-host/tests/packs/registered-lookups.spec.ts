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
const system = (id: string, designation?: string) => ({ id, machine: {} as PackSystemDef['machine'], events: new Set<string>(), designation });

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
    add({ id: 'first', systems: [system('first.journal', 'journal')] });
    expect(() => add({ id: 'second', systems: [system('second.journal', 'journal')], steps: [noteStep] })).toThrow('Designation collision');
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

describe('feature settings defaults', () => {
  const memos = { id: 'memos', hasSystem: false, hasPlugin: true, services: [], settings: { plugins: { memos: { sort: 'newest' } } } };
  const cards = { id: 'cards', hasSystem: false, hasPlugin: true, services: [], settings: { plugins: { _meta: { visibility: { cards: false } } } } };

  it('appear and disappear with their pack, each change announced with a new revision', () => {
    const changed = vi.fn();
    const unsubscribe = onPackSettingsDefaultsChanged(changed);
    const before = getPackSettingsDefaults().revision;

    add({ id: 'memo-pack', features: [memos] });
    add({ id: 'card-pack', features: [cards] });
    expect(getPackSettingsDefaults().settings).toEqual({ plugins: { memos: { sort: 'newest' }, _meta: { visibility: { cards: false } } } });
    expect(getPackSettingsDefaults().revision).toBe(before + 2);
    expect(changed).toHaveBeenCalledTimes(2);

    remove('memo-pack');
    expect(getPackSettingsDefaults().settings).toEqual({ plugins: { _meta: { visibility: { cards: false } } } });
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
