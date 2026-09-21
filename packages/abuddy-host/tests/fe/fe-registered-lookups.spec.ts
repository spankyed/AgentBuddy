// What a pack's frontend registration contributes, read the way the renderer and pack frontends read it: each
// lookup sees the pack once it registers and loses it when it unregisters.
import { afterEach, describe, expect, it } from 'vitest';
import type { Plugin, PackFERegistration, TiptapPlugin } from '@abuddy/sdk/fe';
import { getDslTypes, tiptapPluginRegistry } from '@abuddy/sdk/fe';
import { bindFeHost } from '@abuddy/sdk/runtime';
import { stepRegistry, type StepDefinition } from '@abuddy/sdk/steps';
import { artifactRegistry } from '@abuddy/sdk/artifacts';
import { blockRegistry } from '@abuddy/sdk/blocks';
import { getDesignated, hasDesignation } from '@abuddy/sdk/designations';
import { createFePackRegistry } from '../../src/fe/index.ts';

// How this spec registers and reads: a frontend registry it creates, bound for the SDK's lookups
const registry = createFePackRegistry();
bindFeHost({ application: {} as never, secrets: {} as never, transport: {} as never, packs: registry });
const register = (packId: string, registration: Omit<PackFERegistration, 'id'>) => registry.registerPackFE({ id: packId, ...registration });
const unregister = (packId: string) => registry.unregisterPackFE(packId);
const plugins = () => registry.getRegisteredPlugins();
const defaultPlugin = () => registry.getRegisteredDefaultPlugin();
const appExtension = (slot: string) => registry.getAppExtension(slot);

const packs: string[] = [];
afterEach(() => {
  for (const id of packs.splice(0)) unregister(id);
});

function add(packId: string, registration: Omit<PackFERegistration, 'id'>): void {
  register(packId, registration);
  packs.push(packId);
}

function remove(packId: string): Plugin[] {
  packs.splice(packs.indexOf(packId), 1);
  return unregister(packId);
}

const plugin = (id: string) => ({ id }) as unknown as Plugin;
const noteStepFE = { type: 'note', fe: { nodeConfig: { label: 'Note' }, loadComponents: () => ({ node: 'NoteNode', form: 'NoteForm' }) } } as unknown as StepDefinition;
const cardView = { type: 'card-view', fe: { icon: 'card', component: 'CardView' } };
const choice = { type: 'choice', fe: { component: 'Choice' } };
const mentions: TiptapPlugin = { extensions: [] };
const Welcome = { name: 'Welcome' };
const memoDsl = { prefix: 'memo:', schema: 'declare const memo: string', globals: {} };

describe("a pack's frontend", () => {
  it('is found once it registers, and gone once it unregisters', () => {
    const notebook = plugin('notebook-main');
    add('notebook-pack', {
      designations: { notebook: 'notebook-main' },
      plugins: [notebook],
      steps: [noteStepFE],
      artifacts: [cardView],
      blocks: [choice],
      tiptapPlugins: [mentions],
      appExtensions: { welcome: Welcome },
      dslTypes: { memo: memoDsl },
    });

    // Registered under `<packId>.<featureId>`, from a copy: the author's module is untouched
    expect(plugins().map((p) => p.id)).toEqual(['notebook-pack.notebook-main']);
    expect(notebook.id, "the pack's own module was mutated").toBe('notebook-main');
    expect(getDesignated('notebook')).toBe('notebook-pack.notebook-main');
    expect(stepRegistry.getFE('note')?.nodeConfig.label).toBe('Note');
    expect(stepRegistry.all().map((s) => s.type)).toEqual(['note']);
    expect(artifactRegistry.all()).toEqual([cardView]);
    expect(blockRegistry.all()).toEqual([choice]);
    // Its components load when it registers
    expect(stepRegistry.getComponent('note')).toBe('NoteNode');
    expect(stepRegistry.getFormComponent('note')).toBe('NoteForm');
    expect(artifactRegistry.getComponent('card-view')).toBe('CardView');
    expect(blockRegistry.getComponent('choice')).toBe('Choice');
    expect(tiptapPluginRegistry.getAll()).toContain(mentions);
    expect(appExtension('welcome')).toBe(Welcome);
    expect(getDslTypes().get('memo')).toBe(memoDsl);

    expect(remove('notebook-pack').map((p) => p.id)).toEqual(['notebook-pack.notebook-main']);
    expect(plugins()).toEqual([]);
    expect(hasDesignation('notebook')).toBe(false);
    expect(stepRegistry.get('note')).toBeUndefined();
    expect(stepRegistry.all()).toEqual([]);
    expect(artifactRegistry.has('card-view')).toBe(false);
    expect(artifactRegistry.all()).toEqual([]);
    expect(blockRegistry.has('choice')).toBe(false);
    expect(tiptapPluginRegistry.getAll()).not.toContain(mentions);
    expect(appExtension('welcome')).toBeUndefined();
    expect(getDslTypes().has('memo')).toBe(false);
  });

  // The renderer adds what this returns to the app. It used to add the registration's own plugin
  // modules instead, so an external pack's plugins reached the app under their bare feature ids while
  // the registry held them under `<packId>.<featureId>` — the app then had a plugin nothing could send to.
  it('returns the plugins it registered, under the ids they run under', () => {
    const notes = plugin('notes');
    packs.push('returning-pack');
    expect(registry.registerPackFE({ id: 'returning-pack', plugins: [notes] })).toEqual([{ id: 'returning-pack.notes' }]);
    expect(notes.id, "the pack's own module was mutated").toBe('notes');
  });

  // A built pack's plugin module names itself through the generated `pluginId` map, so it arrives
  // already under the id it runs as; a hand-written one names the feature. Both resolve, as a system id does.
  it('takes a plugin that already carries its own qualified id', () => {
    packs.push('named-pack');
    const registered = registry.registerPackFE({
      id: 'named-pack',
      plugins: [plugin('named-pack.notes')],
      designations: { notebook: 'notes' },
    });
    expect(registered.map((p) => p.id)).toEqual(['named-pack.notes']);
    expect(getDesignated('notebook')).toBe('named-pack.notes');
  });

  it("merges its step's frontend facet into the definition another registration gave the type", () => {
    const build = { type: 'note', kind: 'step' } as StepDefinition;
    add('build-pack', { steps: [build] });
    add('notebook-pack', { steps: [noteStepFE] });
    expect(stepRegistry.get('note')).toMatchObject({ type: 'note', kind: 'step', fe: { nodeConfig: { label: 'Note' } } });
  });

  // Its counterpart: the merged type, the slot and the DSL name are each held by two packs, and the one
  // that stays keeps what it contributed when the other unregisters
  it("leaves the other pack's contributions in place when one of two unregisters", () => {
    const build = { type: 'note', kind: 'step' } as StepDefinition;
    const otherWelcome = { name: 'OtherWelcome' } as never;
    add('build-pack', { steps: [build], appExtensions: { welcome: Welcome }, dslTypes: { memo: memoDsl } });
    add('notebook-pack', { steps: [noteStepFE], appExtensions: { welcome: otherWelcome }, dslTypes: { memo: { other: true } as never } });
    expect(stepRegistry.get('note')?.fe).toBeDefined();
    expect(appExtension('welcome')).toBe(otherWelcome);

    remove('notebook-pack');

    expect(stepRegistry.get('note'), "the remaining pack's step went with the one that left").toBeDefined();
    expect(stepRegistry.get('note')?.fe).toBeUndefined();
    expect(appExtension('welcome')).toBe(Welcome);
    expect(getDslTypes().get('memo')).toBe(memoDsl);
  });

  // Two packs with a `notes` feature each get a plugin, because a plugin is addressed by its pack. Only
  // the default is a single slot, and the first registration keeps it.
  it("gives each pack its own plugin, and keeps the first default plugin", () => {
    const first = plugin('notes');
    add('first-pack', { plugins: [first], defaultPlugin: first });
    add('second-pack', { plugins: [plugin('notes'), plugin('cards')], defaultPlugin: plugin('cards') });
    expect(plugins().map((p) => p.id)).toEqual(['first-pack.notes', 'second-pack.notes', 'second-pack.cards']);
    expect(defaultPlugin()?.id).toBe('first-pack.notes');
    expect(remove('second-pack').map((p) => p.id)).toEqual(['second-pack.notes', 'second-pack.cards']);
    expect(defaultPlugin()?.id, "the first pack's default left with the second").toBe('first-pack.notes');
  });
});
