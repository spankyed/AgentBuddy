import { createMachine } from 'xstate';
import { selectDefaultPluginDeclaration, getEligiblePlugin } from '../../src/fe/plugin-selection.ts';
import type { FeatureRef } from '@apackdev/sdk/ids';
import { createNativeFrontendTestRegistry } from '@apackdev/host/fe/testing';
// What a pack's frontend registration contributes, read the way the renderer and pack frontends read it: each
// lookup sees the pack once it registers and loses it when it unregisters.
import { afterEach, describe, expect, it } from 'vitest';
import type { Plugin, PluginDefinition, PackFERegistration, TiptapPlugin } from '@apackdev/sdk/fe';
import { getDslTypes, tiptapPluginRegistry, getStepFrontendBindings } from '@apackdev/sdk/fe';
import { bindFeHost } from '@apackdev/sdk/runtime';
import { type StepDefinition } from '@apackdev/sdk/steps';
import { artifactRegistry } from '@apackdev/sdk/artifacts';
import { blockRegistry } from '@apackdev/sdk/blocks';
import { getDesignated, hasDesignation } from '@apackdev/sdk/designations';

// How this spec registers and reads: a frontend registry it creates, bound for the SDK's lookups
const registry = createNativeFrontendTestRegistry();
bindFeHost({ catalog: {} as never, application: {} as never, secrets: {} as never, settings: {} as never, client: {} as never, packs: registry });
const register = (packId: string, registration: Omit<PackFERegistration, 'id'>) => registry.registerFixture({ id: packId, ...registration });
const unregister = (packId: string) => registry.unregisterPackFE(packId);
const plugins = () => registry.getRegisteredPlugins();
const defaultPlugin = () => {
  const catalog = { status: () => 'ready' as const, subscribe: () => () => {}, plugins: () => [...registry.pluginBindings()].map(([featureRef, accepted]) => ({
    featureRef: featureRef as FeatureRef, packId: accepted.packId, origin: 'native' as const, enabled: true, declaration: accepted.declaration,
  })) };
  const owner = selectDefaultPluginDeclaration(catalog);
  return owner && getEligiblePlugin(catalog, registry.pluginBindings(), owner.featureRef);
};
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

const plugin = (label: string) => ({ label, state: createMachine({}) }) satisfies PluginDefinition;
// A frontend registration carries `node` beside `fe`: the label and the field defaults are what both
// halves read, so codegen emits that facet into this registration and the backend's alike
const NoteNode = {}; const NoteForm = {}; const CardView = {}; const Choice = {};
const noteStepFE = { type: 'note', node: { label: 'Note' }, fe: { nodeConfig: { icon: {}, category: 'data', connectionRules: { inputs: 1, outputs: 1 } }, components: { node: NoteNode, form: NoteForm } } } satisfies StepDefinition;
const cardView = { type: 'card-view', fe: { icon: {}, component: CardView } };
const choice = { type: 'choice', fe: { component: Choice } };
const mentions: TiptapPlugin = { extensions: {} };
const Welcome = { name: 'Welcome' };
const memoDsl = { prefix: 'memo:', schema: 'declare const memo: string', globals: {} };

describe("a pack's frontend", () => {
  it('is found once it registers, and gone once it unregisters', () => {
    add('notebook-pack', {
      features: { notebookMain: { plugin: plugin('Notebook'), designation: 'notebook' } },
      steps: [noteStepFE],
      artifacts: [cardView],
      blocks: [choice],
      tiptapPlugins: { mentions },
      appExtensions: { welcome: Welcome },
      dslTypes: { memo: memoDsl },
    });

    // Registered at the feature's address, which also answers the role
    expect(plugins()).toMatchObject([{ label: 'Notebook', id: 'notebook-pack/notebookMain' }]);
    expect(getDesignated('notebook')).toBe('notebook-pack/notebookMain');
    expect(getStepFrontendBindings().get('note')?.binding.node?.label).toBe('Note');
    expect(getStepFrontendBindings().get('note')?.binding.fe).toBeDefined();
    expect([...getStepFrontendBindings().keys()]).toEqual(['note']);
    expect(artifactRegistry.all()).toEqual([cardView]);
    expect(blockRegistry.all()).toEqual([choice]);
    // Its components are accepted bindings
    expect(getStepFrontendBindings().get('note')?.binding.fe?.components?.node).toBe(NoteNode);
    expect(getStepFrontendBindings().get('note')?.binding.fe?.components?.form).toBe(NoteForm);
    expect(artifactRegistry.getComponent('card-view')).toBe(CardView);
    expect(blockRegistry.getComponent('choice')).toBe(Choice);
    expect(tiptapPluginRegistry.getAll()).toContainEqual({ packId: 'notebook-pack', groupId: 'mentions', binding: mentions });
    expect(appExtension('welcome')).toBe(Welcome);
    expect(getDslTypes().get('memo')).toEqual(memoDsl);

    expect(remove('notebook-pack')).toMatchObject([{ label: 'Notebook', id: 'notebook-pack/notebookMain' }]);
    expect(plugins()).toEqual([]);
    expect(hasDesignation('notebook')).toBe(false);
    expect(getStepFrontendBindings().get('note')?.binding).toBeUndefined();
    expect([...getStepFrontendBindings().values()].map(entry => entry.binding)).toEqual([]);
    expect(artifactRegistry.has('card-view')).toBe(false);
    expect(artifactRegistry.all()).toEqual([]);
    expect(blockRegistry.has('choice')).toBe(false);
    expect(tiptapPluginRegistry.getAll()).not.toContainEqual({ packId: 'notebook-pack', groupId: 'mentions', binding: mentions });
    expect(appExtension('welcome')).toBeUndefined();
    expect(getDslTypes().has('memo')).toBe(false);
  });

  it('refuses another pack supplying a facet of the same step wire', () => {
    const original: StepDefinition = { type: 'note', kind: 'step', node: { label: 'Original' } };
    add('first-pack', { steps: [original] });
    expect(() => add('notebook-pack', { steps: [noteStepFE], appExtensions: { welcome: Welcome } }))
      .toThrow(/Step "note".*first-pack.*notebook-pack/);
    expect(getStepFrontendBindings().get('note')?.binding?.node?.label).toBe('Original');
    expect(getStepFrontendBindings().get('note')?.binding.fe).toBeUndefined();
    expect(appExtension('welcome')).toBeUndefined();
    remove('first-pack');
    add('notebook-pack', { steps: [noteStepFE] });
    expect(getStepFrontendBindings().get('note')?.binding.fe).toBeDefined();
  });

  it('keeps unrelated slot and DSL contributions when another step owner unregisters', () => {
    const first: StepDefinition = { type: 'first', node: { label: 'First' } };
    const otherWelcome = { name: 'OtherWelcome' };
    add('first-pack', { steps: [first], appExtensions: { welcome: Welcome }, dslTypes: { memo: memoDsl } });
    add('notebook-pack', { steps: [noteStepFE], appExtensions: { welcome: otherWelcome }, dslTypes: { memo: { prefix: 'other:', schema: 'declare const other: string', globals: {} } } });
    expect(getStepFrontendBindings().get('note')?.binding?.fe).toBeDefined();
    expect(appExtension('welcome')).toBe(otherWelcome);
    remove('notebook-pack');
    expect(getStepFrontendBindings().get('first')?.binding?.node?.label).toBe('First');
    expect(getStepFrontendBindings().get('note')?.binding).toBeUndefined();
    expect(appExtension('welcome')).toBe(Welcome);
    expect(getDslTypes().get('memo')).toEqual(memoDsl);
  });

  // Two packs with a `notes` feature each get a plugin, because a plugin is addressed by its pack. Only
  // the default follows declaration order, independently of registration order.
  it("gives each pack its own plugin, and selects its default by declaration identity", () => {
    add('first-pack', { features: { notes: { plugin: plugin('First notes'), default: true } } });
    add('second-pack', { features: { notes: { plugin: plugin('Second notes') }, cards: { plugin: plugin('Cards'), default: true } } });
    expect(plugins().map((p) => p.id)).toEqual(['first-pack/notes', 'second-pack/notes', 'second-pack/cards']);
    expect(defaultPlugin()?.id).toBe('first-pack/notes');
    expect(remove('second-pack').map((p) => p.id)).toEqual(['second-pack/notes', 'second-pack/cards']);
    expect(defaultPlugin()?.id, "the first pack's default left with the second").toBe('first-pack/notes');
  });

  it('promotes the next default on removal and preserves priority during replacement', () => {
    add('first-pack', { features: { main: { plugin: plugin('First'), default: true } } });
    add('second-pack', { features: { main: { plugin: plugin('Second'), default: true } } });
    registry.replaceFixture({ id: 'first-pack', features: { main: { plugin: plugin('Updated'), default: true } } });
    expect(defaultPlugin()?.id).toBe('first-pack/main');
    expect(defaultPlugin()?.label).toBe('Updated');
    remove('first-pack');
    expect(defaultPlugin()?.id).toBe('second-pack/main');
    add('first-pack', { features: { main: { plugin: plugin('Returned'), default: true } } });
    expect(defaultPlugin()?.id).toBe('first-pack/main');
    remove('second-pack');
    expect(defaultPlugin()?.id).toBe('first-pack/main');
  });

  it('refuses duplicate defaults atomically and refuses a default without a plugin', () => {
    add('owner', { features: { main: { plugin: plugin('Accepted'), default: true } } });
    expect(() => registry.replaceFixture({ id: 'owner', features: {
      first: { plugin: plugin('First'), default: true }, second: { plugin: plugin('Second'), default: true },
    } })).toThrow('Two features claim the default plugin');
    expect(defaultPlugin()?.id).toBe('owner/main');
    expect(plugins().map(plugin => plugin.id)).toEqual(['owner/main']);
    expect(() => register('invalid', { features: { absent: { default: true } } })).toThrow('without a plugin');
    expect(registry.hasPackFE('invalid')).toBe(false);
  });
});

// Pack and group insertion order determines the order presented to the editor.
describe('tiptap plugin groups', () => {
  const mentions: TiptapPlugin = { extensions: {} };
  const slashes: TiptapPlugin = { extensions: {} };

  it('are listed in registration order, which the editor resolves extensions by', () => {
    add('first-pack', { tiptapPlugins: { mentions } });
    add('second-pack', { tiptapPlugins: { slashes } });

    expect(tiptapPluginRegistry.getAll()).toEqual([{ packId: 'first-pack', groupId: 'mentions', binding: mentions }, { packId: 'second-pack', groupId: 'slashes', binding: slashes }]);
  });

  it('exposes immutable ownership and observes only committed changes until unsubscribed', () => {
    add('first-pack', { tiptapPlugins: { mentions } });
    const incumbent = tiptapPluginRegistry.getAll()[0];
    expect(Object.isFrozen(incumbent)).toBe(true);
    let changes = 0;
    const stop = tiptapPluginRegistry.onChanged(() => { changes++; });
    try {
      const candidate = registry.prepareFixture({ id: 'first-pack', tiptapPlugins: { mentions } }, undefined, true);
      expect(changes).toBe(0);
      candidate.dispose();
      expect(changes).toBe(0);
      expect(() => registry.registerFixture({ id: 'first-pack' })).toThrow('already registered');
      expect(changes).toBe(0);
      add('unrelated-pack', {});
      expect(changes).toBe(1);
      expect(tiptapPluginRegistry.getAll()[0].binding).toBe(incumbent.binding);
      registry.replaceFixture({ id: 'first-pack', tiptapPlugins: { renamed: mentions } });
      expect(changes).toBe(2);
      expect(tiptapPluginRegistry.getAll()[0]).toMatchObject({ packId: 'first-pack', groupId: 'renamed' });
      stop();
      remove('unrelated-pack');
      expect(changes).toBe(2);
    } finally { stop(); }
  });

  it('loses every one of a pack when it unregisters, not just the first', () => {
    add('many-pack', { tiptapPlugins: { mentions, slashes } });

    unregister('many-pack');

    expect(tiptapPluginRegistry.getAll()).toEqual([]);
  });

  // The read hands out a copy, as the backend's command store does, so a reader cannot edit what every
  // other reader sees. It used to hand out the live array by reference.
  it('cannot be added to or emptied by a reader', () => {
    add('first-pack', { tiptapPlugins: { mentions } });

    tiptapPluginRegistry.getAll().push({ packId: 'reader', groupId: 'slashes', binding: slashes });
    tiptapPluginRegistry.getAll().length = 0;

    expect(tiptapPluginRegistry.getAll()).toEqual([{ packId: 'first-pack', groupId: 'mentions', binding: mentions }]);
  });
});
