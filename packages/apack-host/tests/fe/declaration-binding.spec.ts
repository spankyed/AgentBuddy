import { describe, expect, it, vi } from 'vitest';
import { createMachine } from 'xstate';
import { Extension } from '@tiptap/core';
import { ManifestSchema, type PackManifest } from '@apackdev/sdk/build';
import { createFePackRegistry } from '../../src/fe/pack-store.ts';
import { frontendBindingProblem } from '../../src/fe/declaration-binding.ts';

function fixture() {
  const component = { render: vi.fn() };
  const loadComponents = vi.fn();
  const bindSettings = vi.fn();
  const editorExtension = Extension.create({ name: 'example' });
  const configure = vi.spyOn(editorExtension, 'configure');
  const isSuggestionActive = vi.fn(() => false);
  const manifest: PackManifest = { id: 'notes-pack', name: 'Notes', version: '1.0.0',
    features: { notes: { description: 'Feature declaration fixture.', plugin: { label: 'Notes', state: 'src/plugin.ts', default: true }, designation: 'notes' },
      backend: { description: 'Feature declaration fixture.', system: { entry: 'src/system.ts' } }, form: { description: 'Feature declaration fixture.', settings: { schema: { type: 'object' }, defaults: {}, form: 'src/form.vue' } } },
    extensions: { settings: { preferences: { schema: { type: 'object' }, defaults: {}, form: 'src/preferences.vue' } },
      steps: { note: { node: 'src/node.ts#node', fe: 'src/step.ts#fe' }, trigger: { kind: 'trigger', node: 'src/trigger.ts#node' } },
      artifacts: { text: { icon: 'File', fe: 'src/text.vue' } }, blocks: { note: { kind: 'input', fe: 'src/block.vue' } },
      appExtensions: { toolbar: 'src/toolbar.vue' }, tiptapPlugins: { tools: {
        extensions: { example: 'src/editor.ts#Example' }, popups: { suggestions: 'src/editor.vue' },
        isSuggestionActive: 'src/editor.ts#isSuggestionActive' } } ,
      dsl: { notes: { prefix: 'n', entry: 'src/schema.ts', targets: ['monaco'], globals: { foo: 'Foo' } } } } };
  expect(ManifestSchema.safeParse(manifest).success).toBe(true);
  const registration = { id: manifest.id, bindSettings,
    features: { notes: { plugin: { label: 'Notes', state: createMachine({}) }, designation: 'notes', default: true }, form: { settingsForm: component } },
    settingsForms: { preferences: component }, steps: [{ type: 'note', node: {}, fe: { loadComponents } }, { type: 'trigger', kind: 'trigger', node: {} }],
    artifacts: [{ type: 'text', fe: { icon: component, component } }], blocks: [{ type: 'note', kind: 'input', fe: { component } }],
    appExtensions: { toolbar: component }, tiptapPlugins: { tools: { extensions: { example: editorExtension },
      popups: { suggestions: component }, isSuggestionActive } },
    dslTypes: { notes: { prefix: 'n', schema: 'declare interface Foo {}', globals: { foo: 'Foo' } } },
  };
  return { manifest, registration, component, loadComponents, bindSettings, configure, isSuggestionActive };
}

describe('frontend declaration binding', () => {
  it('accepts the frontend facet without executing component or settings factories', () => {
    const { manifest, registration, component, loadComponents, bindSettings, configure, isSuggestionActive } = fixture();
    expect(frontendBindingProblem(manifest, registration)).toBeUndefined();
    expect(configure).not.toHaveBeenCalled();
    expect(isSuggestionActive).not.toHaveBeenCalled();
    expect(component.render).not.toHaveBeenCalled();
    expect(loadComponents).not.toHaveBeenCalled();
    expect(bindSettings).not.toHaveBeenCalled();
  });

  it.each([
    ['undeclared feature', (r: Record<string, unknown>) => { r.features = { ghost: {} }; }, 'features'],
    ['missing feature', (r: Record<string, unknown>) => { r.features = {}; }, 'features'],
    ['null features', (r: Record<string, unknown>) => { r.features = null; }, 'features'],
    ['foreign role', (r: Record<string, unknown>) => { r.features = { notes: { designation: 'brain' }, form: {} }; }, 'designation'],
    ['changed default', (r: Record<string, unknown>) => { r.features = { notes: { designation: 'notes', default: false }, form: {} }; }, 'default'],
    ['missing plugin', (r: Record<string, unknown>) => { r.features = { notes: { designation: 'notes', default: true }, form: {} }; }, 'plugin'],
    ['missing form', (r: Record<string, unknown>) => { (r.features as Record<string, unknown>).form = {}; }, 'settingsForm'],
    ['invalid form', (r: Record<string, unknown>) => { (r.features as Record<string, unknown>).form = { settingsForm: null }; }, 'settingsForm'],
    ['foreign form group', (r: Record<string, unknown>) => { r.settingsForms = { foreign: {} }; }, 'settingsForms'],
    ['null forms', (r: Record<string, unknown>) => { r.settingsForms = null; }, 'settingsForms'],
    ['missing step', (r: Record<string, unknown>) => { r.steps = []; }, 'steps'],
    ['duplicate step', (r: Record<string, unknown>) => { r.steps = [{ type: 'note' }, { type: 'note' }]; }, 'steps'],
    ['undeclared runtime facet', (r: Record<string, unknown>) => { (r.steps as Record<string, unknown>[])[0].runtime = {}; }, 'runtime'],
    ['missing node facet', (r: Record<string, unknown>) => { delete (r.steps as Record<string, unknown>[])[0].node; }, 'node'],
    ['missing frontend facet', (r: Record<string, unknown>) => { delete (r.steps as Record<string, unknown>[])[0].fe; }, '.fe'],
    ['changed step kind', (r: Record<string, unknown>) => { (r.steps as Record<string, unknown>[])[0].kind = 'trigger'; }, 'kind'],
    ['foreign artifact', (r: Record<string, unknown>) => { r.artifacts = [{ type: 'foreign' }]; }, 'artifacts'],
    ['missing artifact viewer', (r: Record<string, unknown>) => { r.artifacts = [{ type: 'text', fe: { icon: {} } }]; }, 'artifacts.text.fe'],
    ['changed block kind', (r: Record<string, unknown>) => { r.blocks = [{ type: 'note', kind: 'display' }]; }, 'blocks.note.kind'],
    ['missing block component', (r: Record<string, unknown>) => { r.blocks = [{ type: 'note', kind: 'input', fe: {} }]; }, 'blocks.note.fe'],
    ['foreign slot', (r: Record<string, unknown>) => { r.appExtensions = { other: {} }; }, 'appExtensions'],
    ['foreign DSL', (r: Record<string, unknown>) => { r.dslTypes = {}; }, 'dslTypes'],
    ['changed DSL globals', (r: Record<string, unknown>) => { r.dslTypes = { notes: { prefix: 'n', schema: '', globals: { foo: 'Wrong' } } }; }, 'globals.foo'],
    ['missing editor binding', (r: Record<string, unknown>) => { r.tiptapPlugins = undefined; }, 'tiptapPlugins'],
    ['foreign editor group', (r: Record<string, unknown>) => { r.tiptapPlugins = { other: {} }; }, 'tiptapPlugins'],
    ['missing editor extension', (r: Record<string, unknown>) => { (r.tiptapPlugins as Record<string, Record<string, unknown>>).tools.extensions = {}; }, 'tiptapPlugins.tools.extensions'],
    ['wrong editor name', (r: Record<string, unknown>) => { (r.tiptapPlugins as Record<string, Record<string, unknown>>).tools.extensions = { example: Extension.create({ name: 'wrong' }) }; }, 'tiptapPlugins.tools.extensions.example'],
    ['invalid editor value', (r: Record<string, unknown>) => { (r.tiptapPlugins as Record<string, Record<string, unknown>>).tools.extensions = { example: { name: 'example' } }; }, 'tiptapPlugins.tools.extensions.example'],
    ['missing popup', (r: Record<string, unknown>) => { (r.tiptapPlugins as Record<string, Record<string, unknown>>).tools.popups = {}; }, 'tiptapPlugins.tools.popups'],
    ['invalid suggestion predicate', (r: Record<string, unknown>) => { (r.tiptapPlugins as Record<string, Record<string, unknown>>).tools.isSuggestionActive = {}; }, 'tiptapPlugins.tools.isSuggestionActive'],
    ['invalid settings factory', (r: Record<string, unknown>) => { r.bindSettings = {}; }, 'bindSettings'],
    ['unsupported registration field', (r: Record<string, unknown>) => { r.commands = []; }, 'registration fields'],
  ] as const)('refuses %s', (_name, mutate, expected) => {
    const { manifest, registration } = fixture();
    mutate(registration);
    expect(frontendBindingProblem(manifest, registration)).toContain(expected);
  });

  it('accepts the omitted DSL prefix as an empty global prefix', () => {
    const { manifest, registration } = fixture();
    delete manifest.extensions!.dsl!.notes.prefix;
    registration.dslTypes.notes.prefix = '';
    expect(frontendBindingProblem(manifest, registration)).toBeUndefined();
  });

  it('refuses editor bindings a manifest never declared', () => {
    expect(frontendBindingProblem({ id: 'empty' }, { tiptapPlugins: { undeclared: {} } })).toContain('tiptapPlugins');
  });
});


it('checks declared presentation and panes without resolving a component or predicate', () => {
  const { manifest, registration, component } = fixture();
  const declaration = manifest.features!.notes.plugin!;
  Object.assign(declaration, { label: 'Notes', isPinned: true, icon: 'NotebookText',
    canvas: { routes: { list: 'src/list.vue', view: { entry: 'src/view.vue', load: 'lazy' } } },
    panel: 'src/panel.vue', chat: 'src/chat.vue', hotkeys: [{ action: 'open', global: false }],
    options: { headerClass: 'notes' }, fallbackPanel: { label: 'Inspect', toggle: { type: 'INSPECT' }, isShown: 'src/predicate.ts#isShown' } });
  const isShown = vi.fn();
  Object.assign(registration.features.notes.plugin, { icon: component, isPinned: true,
    canvas: { list: component, view: component }, panel: component, chat: component,
    hotkeys: [{ action: 'open', global: false }], options: { headerClass: 'notes' },
    fallbackPanel: { label: 'Inspect', toggle: { type: 'INSPECT' }, isShown } });
  expect(frontendBindingProblem(manifest, registration)).toBeUndefined();
  expect(isShown).not.toHaveBeenCalled();
  expect(component.render).not.toHaveBeenCalled();
  const plugin = registration.features.notes.plugin as Record<string, unknown>;
  const changes: [string, unknown][] = [
    ['label', 'Wrong'], ['isPinned', false], ['icon', undefined], ['canvas', { list: component }],
    ['panel', undefined], ['chat', undefined], ['hotkeys', [{ action: 'other' }]],
    ['options', { headerClass: 'other' }], ['fallbackPanel', { label: 'Inspect', toggle: { type: 'OTHER' }, isShown }],
    ['undeclared', true],
  ];
  for (const [field, value] of changes) {
    const previous = plugin[field];
    plugin[field] = value;
    expect(frontendBindingProblem(manifest, registration), field).toContain(`plugin.${field}`);
    if (previous === undefined) delete plugin[field]; else plugin[field] = previous;
  }
  expect(frontendBindingProblem(manifest, registration)).toBeUndefined();
});


it('refuses a native replacement before granting resources and retains the accepted plugin', () => {
  const component = { render: vi.fn() };
  const native = { id: 'native', features: { view: { description: 'Feature declaration fixture.', plugin: { label: 'Native view', state: 'native/state', canvas: 'native/canvas' } } } };
  const registry = createFePackRegistry({ nativeDeclarations: [native] });
  const registration = { id: 'native', features: { view: { plugin: { label: 'Native view', state: createMachine({}), canvas: component } } } };
  const [accepted] = registry.registerPackFE(registration);
  native.features.view.plugin.label = 'Mutated caller';
  const bindSettings = vi.fn();
  expect(() => registry.replacePackFE({ ...registration, bindSettings,
    features: { view: { plugin: { ...registration.features.view.plugin, label: 'Changed binding' } } } })).toThrow('plugin.label');
  expect(bindSettings).not.toHaveBeenCalled();
  expect(registry.getRegisteredPlugins()).toEqual([accepted]);
  expect(component.render).not.toHaveBeenCalled();
});

it('owns editor names transactionally across native packs and retains accepted bindings on refusal', () => {
  const frontend = { tiptapPlugins: { tools: { extensions: { example: 'native/editor.ts#Example' } } } };
  const registry = createFePackRegistry({ nativeDeclarations: [{ id: 'first', ...frontend }, { id: 'second', ...frontend }] });
  const first = Extension.create({ name: 'example' });
  const second = Extension.create({ name: 'example' });
  registry.registerPackFE({ id: 'first', tiptapPlugins: { tools: { extensions: { example: first } } } });
  expect(() => registry.registerPackFE({ id: 'second', tiptapPlugins: { tools: { extensions: { example: second } } } }))
    .toThrow(/first\/tools.*second\/tools/);
  expect(registry.tiptapPlugins()).toHaveLength(1);
  expect(registry.tiptapPlugins()[0].binding.extensions!.example).toBe(first);
  const replacement = Extension.create({ name: 'wrong' });
  expect(() => registry.preparePackFE({ id: 'first', tiptapPlugins: { tools: { extensions: { example: replacement } } } }, undefined, true))
    .toThrow('tiptapPlugins.tools.extensions.example');
  expect(registry.tiptapPlugins()[0].binding.extensions!.example).toBe(first);
});

it('captures editor membership while preserving executable extension objects', () => {
  const registry = createFePackRegistry({ nativeDeclarations: [{ id: 'editor', tiptapPlugins: {
    tools: { extensions: { example: 'native/editor.ts#Example' } },
  } }] });
  const extension = Extension.create({ name: 'example' });
  const extensions = { example: extension };
  const tools = { extensions };
  registry.registerPackFE({ id: 'editor', tiptapPlugins: { tools } });
  extensions.example = Extension.create({ name: 'replacement' });
  tools.extensions = { example: Extension.create({ name: 'another' }) };
  expect(registry.tiptapPlugins()[0].binding.extensions!.example).toBe(extension);
  expect(Object.isFrozen(registry.tiptapPlugins()[0].binding.extensions)).toBe(true);
  expect(Object.isFrozen(extension)).toBe(false);
});
