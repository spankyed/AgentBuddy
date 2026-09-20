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
const register = (registration: PackFERegistration, packId?: string) => registry.registerPackFE(registration, packId);
const unregister = (packId: string) => registry.unregisterPackFE(packId);
const plugins = () => registry.getRegisteredPlugins();
const defaultPlugin = () => registry.getRegisteredDefaultPlugin();
const appExtension = (slot: string) => registry.getAppExtension(slot);

const packs: string[] = [];
afterEach(() => {
  for (const id of packs.splice(0)) unregister(id);
});

function add(packId: string, registration: PackFERegistration): void {
  register(registration, packId);
  packs.push(packId);
}

function remove(packId: string): Plugin[] {
  packs.splice(packs.indexOf(packId), 1);
  return unregister(packId);
}

const plugin = (id: string, designation?: string) => ({ id, designation }) as unknown as Plugin;
const noteStepFE = { type: 'note', fe: { nodeConfig: { label: 'Note' }, loadComponents: () => ({ node: 'NoteNode', form: 'NoteForm' }) } } as unknown as StepDefinition;
const cardView = { type: 'card-view', fe: { icon: 'card', component: 'CardView' } };
const choice = { type: 'choice', fe: { component: 'Choice' } };
const mentions: TiptapPlugin = { extensions: [] };
const Welcome = { name: 'Welcome' };
const memoDsl = { prefix: 'memo:', schema: 'declare const memo: string', globals: {} };

describe("a pack's frontend", () => {
  it('is found once it registers, and gone once it unregisters', () => {
    const notebook = plugin('notebook-main', 'notebook');
    add('notebook-pack', {
      plugins: [notebook],
      steps: [noteStepFE],
      artifacts: [cardView],
      blocks: [choice],
      tiptapPlugins: [mentions],
      appExtensions: { welcome: Welcome },
      dslTypes: { memo: memoDsl },
    });

    expect(plugins()).toContain(notebook);
    expect(getDesignated('notebook')).toBe('notebook-main');
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

    expect(remove('notebook-pack')).toEqual([notebook]);
    expect(plugins()).not.toContain(notebook);
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

  it("keeps the first plugin with an id, and the first default plugin", () => {
    const first = plugin('notes');
    add('first-pack', { plugins: [first], defaultPlugin: first });
    add('second-pack', { plugins: [plugin('notes'), plugin('cards')], defaultPlugin: plugin('cards') });
    expect(plugins().map((p) => p.id)).toEqual(['notes', 'cards']);
    expect(plugins()[0]).toBe(first);
    expect(defaultPlugin()).toBe(first);
    expect(remove('second-pack').map((p) => p.id)).toEqual(['cards']);
  });
});
