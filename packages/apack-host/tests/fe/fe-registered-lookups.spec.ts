// What a pack's frontend registration contributes, read the way the renderer and pack frontends read it: each
// lookup sees the pack once it registers and loses it when it unregisters.
import { afterEach, describe, expect, it } from 'vitest';
import type { Plugin, PluginDefinition, PackFERegistration, TiptapPlugin } from '@apackdev/sdk/fe';
import { getDslTypes, onRegisteredPacksChanged, tiptapPluginRegistry } from '@apackdev/sdk/fe';
import { referenceRegistry, type PackReferences, type ReferenceTypeConfig } from '@apackdev/sdk/fe/references';
import { bindFeHost } from '@apackdev/sdk/runtime';
import { stepRegistry, type StepDefinition } from '@apackdev/sdk/steps';
import { artifactRegistry } from '@apackdev/sdk/artifacts';
import { blockRegistry } from '@apackdev/sdk/blocks';
import { getDesignated, hasDesignation } from '@apackdev/sdk/designations';
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

/**
 * Reference types have two identities and both must be unique across packs: the **type name**, which is what
 * a reference carries (`ReferenceItem.type`, and the editor node's stored attribute), and the **protocol**,
 * which is what a URL names. They are genuinely different facts — default-setup's `document` type uses the
 * scheme `doc` — so neither can stand in for the other, and nothing checked either until an external pack's
 * references could reach the app at all.
 */
describe('reference types, which have two identities', () => {
  const memo: ReferenceTypeConfig = { protocol: 'memo', category: 'memos', icon: {} as never, svgElements: [], navigate: () => {} };
  const packReferences = (types: Record<string, ReferenceTypeConfig>, category: string): PackReferences => ({
    types,
    categories: [{ id: category, label: category, primaryIcon: {} as never }],
    itemsProviders: [{ category, useItems: () => ({ value: [] }) as never }],
  });

  it("answers with every registered pack's types, categories and providers", () => {
    add('memo-pack', { references: packReferences({ memo }, 'memos') });
    add('card-pack', { references: packReferences({ card: { ...memo, protocol: 'card', category: 'cards' } }, 'cards') });

    expect(Object.keys(referenceRegistry.types())).toEqual(['memo', 'card']);
    expect(referenceRegistry.protocols()).toEqual(['memo', 'card']);
    expect(referenceRegistry.categories().map((c) => c.id)).toEqual(['memos', 'cards']);
    expect(referenceRegistry.itemsProviders().map((p) => p.category)).toEqual(['memos', 'cards']);
  });

  it('refuses a second pack claiming a type name, naming both packs', () => {
    add('memo-pack', { references: packReferences({ memo }, 'memos') });

    expect(() => add('other-pack', { references: packReferences({ memo: { ...memo, protocol: 'other' } }, 'memos') }))
      .toThrow('Reference type collision: "memo" — pack "other-pack" vs "memo-pack"');
  });

  it('refuses a second pack claiming a protocol, naming both packs', () => {
    add('memo-pack', { references: packReferences({ memo }, 'memos') });

    expect(() => add('other-pack', { references: packReferences({ sticker: memo }, 'stickers') }))
      .toThrow('Reference protocol collision: "memo://" — pack "other-pack" vs "memo-pack"');
  });

  it("loses a pack's types when it unregisters, leaving the other pack's", () => {
    add('memo-pack', { references: packReferences({ memo }, 'memos') });
    add('card-pack', { references: packReferences({ card: { ...memo, protocol: 'card', category: 'cards' } }, 'cards') });

    remove('memo-pack');

    expect(referenceRegistry.type('memo')).toBeUndefined();
    expect(referenceRegistry.type('card')).toBeDefined();
    expect(referenceRegistry.protocols()).toEqual(['card']);
  });
});

/**
 * Every lookup above is a pull, and every pack's frontend — the app's own included — loads after the window is
 * up. So a consumer that answers at setup holds that answer for as long as it lives, and this is how it learns
 * to ask again: the editor rebuilds on it, and the welcome slot re-reads on it.
 */
describe('learning that the registered packs changed', () => {
  function heard() {
    let calls = 0;
    const stop = onRegisteredPacksChanged(() => { calls += 1; });
    return { count: () => calls, stop };
  }

  /** Past the microtask the notification is deferred to */
  const settle = () => Promise.resolve();

  it('tells a listener when a pack registers and when it unregisters', async () => {
    const { count, stop } = heard();

    add('notebook-pack', { features: { main: { plugin: plugin('Notebook') } } });
    await settle();
    expect(count()).toBe(1);

    remove('notebook-pack');
    await settle();
    expect(count()).toBe(2);

    stop();
  });

  /**
   * Not during the registration, which is the whole of why it is deferred: the shell spawns a pack's plugin
   * actors after `registerPackFE` hands back its plugins, so a listener that redraws from inside it mounts a
   * component whose `usePluginState` finds its own plugin registered and not running — which that helper
   * throws over rather than renders.
   */
  it('does not tell a listener from inside the registration itself', async () => {
    const { count, stop } = heard();

    add('notebook-pack', { features: { main: { plugin: plugin('Notebook') } } });
    expect(count()).toBe(0);

    await settle();
    expect(count()).toBe(1);

    stop();
  });

  // What the pack loader does: it registers each pack in turn, and a listener redraws, so one notification
  // for a run of them is the difference between one rebuild of an editor and one per pack.
  it('tells a listener once for several packs registered in a row', async () => {
    const { count, stop } = heard();

    add('first-pack', { features: { main: { plugin: plugin('First') } } });
    add('second-pack', { features: { main: { plugin: plugin('Second') } } });
    add('third-pack', { features: { main: { plugin: plugin('Third') } } });
    await settle();

    expect(count()).toBe(1);

    stop();
  });

  /**
   * The reason the signal is the registry's and not the shell's. The shell publishes its plugin list, which a
   * consumer could have watched instead — but a pack contributing only an editor extension registers no
   * plugin, so that list never moves and the editor would never hear of the extension it just gained.
   */
  it('tells a listener about a pack that registers no plugin at all', async () => {
    const { count, stop } = heard();

    add('editor-only-pack', { tiptapPlugins: [{ extensions: [] }] });
    await settle();

    expect(count()).toBe(1);
    expect(plugins()).toEqual([]);

    stop();
  });

  it('stops telling a listener that unsubscribed', async () => {
    const { count, stop } = heard();

    stop();
    add('notebook-pack', { features: { main: { plugin: plugin('Notebook') } } });
    await settle();

    expect(count()).toBe(0);
  });
});
