import { describe, expect, it, vi } from 'vitest';
import { createMachine } from 'xstate';
import { ManifestSchema, type PackManifest } from '@apackdev/sdk/build';
import { frontendBindingProblem } from '../../src/fe/declaration-binding.ts';

function fixture() {
  const component = { render: vi.fn() };
  const loadComponents = vi.fn();
  const bindSettings = vi.fn();
  const manifest: PackManifest = { id: 'notes-pack', name: 'Notes', version: '1.0.0',
    features: { notes: { plugin: { entry: 'src/plugin.ts', default: true }, designation: 'notes' },
      backend: { system: { entry: 'src/system.ts' } }, form: { settings: { schema: { type: 'object' }, defaults: {}, form: 'src/form.vue' } } },
    extensions: { settings: { preferences: { schema: { type: 'object' }, defaults: {}, form: 'src/preferences.vue' } },
      steps: { note: { node: 'src/node.ts#node', fe: 'src/step.ts#fe' }, trigger: { kind: 'trigger', node: 'src/trigger.ts#node' } },
      artifacts: { text: { icon: 'File', fe: 'src/text.vue' } }, blocks: { note: { kind: 'input', fe: 'src/block.vue' } },
      fe: { appExtensions: { toolbar: 'src/toolbar.vue' }, tiptapPlugins: 'src/editor.ts' },
      dsl: { notes: { prefix: 'n', entry: 'src/schema.ts', targets: ['monaco'], globals: { foo: 'Foo' } } } } };
  expect(ManifestSchema.safeParse(manifest).success).toBe(true);
  const registration = { id: manifest.id, bindSettings,
    features: { notes: { plugin: { label: 'Notes', state: createMachine({}) }, designation: 'notes', default: true }, form: { settingsForm: component } },
    settingsForms: { preferences: component }, steps: [{ type: 'note', node: {}, fe: { loadComponents } }, { type: 'trigger', kind: 'trigger', node: {} }],
    artifacts: [{ type: 'text', fe: { icon: component, component } }], blocks: [{ type: 'note', kind: 'input', fe: { component } }],
    appExtensions: { toolbar: component }, tiptapPlugins: [{ extensions: [] }],
    dslTypes: { notes: { prefix: 'n', schema: 'declare interface Foo {}', globals: { foo: 'Foo' } } },
  };
  return { manifest, registration, component, loadComponents, bindSettings };
}

describe('frontend declaration binding', () => {
  it('accepts the frontend facet without executing component or settings factories', () => {
    const { manifest, registration, component, loadComponents, bindSettings } = fixture();
    expect(frontendBindingProblem(manifest, registration)).toBeUndefined();
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
    expect(frontendBindingProblem({ id: 'empty', name: 'Empty', version: '1.0.0' }, { tiptapPlugins: [{}] })).toContain('tiptapPlugins');
  });
});
