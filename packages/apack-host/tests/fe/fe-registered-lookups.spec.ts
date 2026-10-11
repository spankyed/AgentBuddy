// What a pack's frontend registration contributes, read the way the renderer and pack frontends read it: each
// lookup sees the pack once it registers and loses it when it unregisters.
import { afterEach, describe, expect, it } from 'vitest';
import type { Plugin, PluginDefinition, PackFERegistration, TiptapPlugin } from '@apack/sdk/fe';
import { getDslTypes, tiptapPluginRegistry } from '@apack/sdk/fe';
import { bindFeHost } from '@apack/sdk/runtime';
import { stepRegistry, type StepDefinition } from '@apack/sdk/steps';
import { artifactRegistry } from '@apack/sdk/artifacts';
import { blockRegistry } from '@apack/sdk/blocks';
import { getDesignated, hasDesignation } from '@apack/sdk/designations';
import { createFePackRegistry } from '../../src/fe/index.ts';

// How this spec registers and reads: a frontend registry it creates, bound for the SDK's lookups
const registry = createFePackRegistry();
bindFeHost({ application: {} as never, secrets: {} as never, settings: {} as never, client: {} as never, packs: registry });
const register = (packId: string, registration: Omit<PackFERegistration, 'id'>) => registry.registerPackFE({ id: packId, ...registration });
const unregister = (packId: string) => registry.unregisterPackFE(packId);
const plugins = () => registry.getRegisteredPlugins();
const defaultPlugin = () => registry.defaultPlugin();
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

const plugin = (label: string) => ({ label }) as unknown as PluginDefinition;
// A frontend registration carries `node` beside `fe`: the label and the field defaults are what both
// halves read, so codegen emits that facet into this registration and the backend's alike
const noteStepFE = { type: 'note', node: { label: 'Note' }, fe: { nodeConfig: {}, loadComponents: () => ({ node: 'NoteNode', form: 'NoteForm' }) } } as unknown as StepDefinition;
const cardView = { type: 'card-view', fe: { icon: 'card', component: 'CardView' } };
const choice = { type: 'choice', fe: { component: 'Choice' } };
const mentions: TiptapPlugin = { extensions: [] };
const Welcome = { name: 'Welcome' };
const memoDsl = { prefix: 'memo:', schema: 'declare const memo: string', globals: {} };

describe("a pack's frontend", () => {
  it('is found once it registers, and gone once it unregisters', () => {
    add('notebook-pack', {
      features: { notebookMain: { plugin: plugin('Notebook'), designation: 'notebook' } },
      steps: [noteStepFE],
      artifacts: [cardView],
      blocks: [choice],
      tiptapPlugins: [mentions],
      appExtensions: { welcome: Welcome },
      dslTypes: { memo: memoDsl },
    });

    // Registered at the feature's address, which also answers the role
    expect(plugins()).toEqual([{ label: 'Notebook', id: 'notebook-pack/notebookMain' }]);
    expect(getDesignated('notebook')).toBe('notebook-pack/notebookMain');
    expect(stepRegistry.getNode('note')?.label).toBe('Note');
    expect(stepRegistry.getFE('note')).toBeDefined();
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

    expect(remove('notebook-pack')).toEqual([{ label: 'Notebook', id: 'notebook-pack/notebookMain' }]);
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

  it("merges its step's frontend facet into the definition another registration gave the type", () => {
    const build = { type: 'note', kind: 'step' } as StepDefinition;
    add('build-pack', { steps: [build] });
    add('notebook-pack', { steps: [noteStepFE] });
    expect(stepRegistry.get('note')).toMatchObject({ type: 'note', kind: 'step', node: { label: 'Note' } });
    expect(stepRegistry.getFE('note')).toBeDefined();
  });

  // Its counterpart: the merged type, the slot and the DSL name are each held by two packs, and the one
  // that stays keeps what it contributed when the other unregisters
  it("leaves the other pack's contributions in place when one of two unregisters", () => {
    const build = { type: 'note', kind: 'step' } as StepDefinition;
    const otherWelcome = { name: 'OtherWelcome' };
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
    add('first-pack', { features: { notes: { plugin: plugin('First notes'), default: true } } });
    add('second-pack', { features: { notes: { plugin: plugin('Second notes') }, cards: { plugin: plugin('Cards'), default: true } } });
    expect(plugins().map((p) => p.id)).toEqual(['first-pack/notes', 'second-pack/notes', 'second-pack/cards']);
    expect(defaultPlugin()?.id).toBe('first-pack/notes');
    expect(remove('second-pack').map((p) => p.id)).toEqual(['second-pack/notes', 'second-pack/cards']);
    expect(defaultPlugin()?.id, "the first pack's default left with the second").toBe('first-pack/notes');
  });
});

/**
 * Tiptap plugins are the one frontend contribution with no key: `TiptapPlugin` has no name, so two of them
 * are told apart only by which pack contributed each. Nothing covered this — these plugins appeared here
 * only as one line of a wider case — and the list is what the editor resolves extension order by.
 */
describe('tiptap plugins, which have no key', () => {
  const mentions: TiptapPlugin = { extensions: [] };
  const slashes: TiptapPlugin = { extensions: [] };

  it('are listed in registration order, which the editor resolves extensions by', () => {
    add('first-pack', { tiptapPlugins: [mentions] });
    add('second-pack', { tiptapPlugins: [slashes] });

    expect(tiptapPluginRegistry.getAll()).toEqual([mentions, slashes]);
  });

  it('loses every one of a pack when it unregisters, not just the first', () => {
    add('many-pack', { tiptapPlugins: [mentions, slashes] });

    unregister('many-pack');

    expect(tiptapPluginRegistry.getAll()).toEqual([]);
  });

  // The read hands out a copy, as the backend's command store does, so a reader cannot edit what every
  // other reader sees. It used to hand out the live array by reference.
  it('cannot be added to or emptied by a reader', () => {
    add('first-pack', { tiptapPlugins: [mentions] });

    tiptapPluginRegistry.getAll().push(slashes);
    tiptapPluginRegistry.getAll().length = 0;

    expect(tiptapPluginRegistry.getAll()).toEqual([mentions]);
  });
});
