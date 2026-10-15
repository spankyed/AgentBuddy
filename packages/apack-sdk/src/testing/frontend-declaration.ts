import type { PackFERegistration, PluginDefinition } from '../fe/index.ts';
import type { NativePackDeclaration } from '../framework/pack-catalog.ts';
import type { PluginDeclaration } from '../framework/plugin-declaration.ts';
import type { StepFrontendDeclaration } from '../framework/step-frontend-declaration.ts';
import type { StepFEFacet } from '../steps/types.ts';
import type { StepEntry } from '../build/manifest.ts';

/** Declare an authored frontend fixture before admitting its runtime stand-ins; never calls its code. */
export function nativeFrontendDeclarationFixture(fixture: PackFERegistration): NativePackDeclaration {
  const component = 'fixtures/frontend.ts#Component';
  const form = (name: string) => ({ schema: { type: 'object' }, defaults: {}, form: `fixtures/${name}.vue` });
  return {
    id: fixture.id,
    ...(fixture.settingsForms && { settings: Object.fromEntries(Object.keys(fixture.settingsForms).map(id => [id, form(id)])) }),
    features: Object.fromEntries(Object.entries(fixture.features ?? {}).map(([id, feature]) => {
      if (feature.default && !feature.plugin) throw new Error(`Native feature fixture "${id}" claims a default without a plugin`);
      const references = feature.references;
      return [id, {
        description: `Frontend fixture for ${id}.`,
        ...(feature.designation !== undefined && { designation: feature.designation }),
        ...(feature.settingsForm !== undefined && { settings: form(id) }),
        ...(feature.plugin && { plugin: { ...pluginDeclaration(feature.plugin), ...(feature.default && { default: true }) } }),
        ...(references && { references: {
          types: Object.fromEntries(Object.entries(references.types).map(([name, value]) => [name,
            { category: value.category, icon: 'Box', svgElements: value.svgElements, navigate: 'fixtures/navigation.ts#navigate' }])),
          categories: Object.fromEntries(Object.entries(references.categories).map(([name, value]) => [name,
            { label: value.label, icon: 'Box', useItems: 'fixtures/references.ts#useItems' }])),
        } }),
      }];
    })),
    ...(fixture.steps && { steps: Object.fromEntries(fixture.steps.map(step => {
      if (step.node === undefined) throw new Error(`Native step fixture "${fixture.id}/${step.type}" needs declared node data`);
      const fe = step.fe;
      return [step.type, { node: step.node, ...(step.kind !== undefined && { kind: step.kind }),
        ...(fe && { fe: frontendDeclaration(fe) }),
      } satisfies StepEntry];
    })) }),
    ...(fixture.artifacts && { artifacts: Object.fromEntries(fixture.artifacts.map(value => [value.type,
      { icon: 'File', ...(value.fe?.component !== undefined && { fe: 'fixtures/artifact.vue' }) }])) }),
    ...(fixture.blocks && { blocks: Object.fromEntries(fixture.blocks.map(value => [value.type,
      { ...(value.kind !== undefined && { kind: value.kind }), ...(value.fe !== undefined && { fe: 'fixtures/block.vue' }) }])) }),
    ...(fixture.dslTypes && { dsl: Object.fromEntries(Object.entries(fixture.dslTypes).map(([id, value]) => [id,
      { entry: 'fixtures/types.ts', targets: ['monaco'], globals: value.globals, prefix: value.prefix }])) }),
    ...(fixture.appExtensions && { appExtensions: Object.fromEntries(Object.keys(fixture.appExtensions).map(id => [id, 'fixtures/extension.vue'])) }),
    ...(fixture.tiptapPlugins && { tiptapPlugins: Object.fromEntries(Object.entries(fixture.tiptapPlugins).map(([id, value]) => [id, {
      ...(value.extensions && { extensions: Object.fromEntries(Object.keys(value.extensions).map(name => [name, component])) }),
      ...(value.popups && { popups: Object.fromEntries(Object.keys(value.popups).map(name => [name, 'fixtures/popup.vue'])) }),
      ...(value.isSuggestionActive !== undefined && { isSuggestionActive: 'fixtures/editor.ts#isSuggestionActive' }),
    }])) }),
  };
}

function pluginDeclaration(plugin: PluginDefinition): PluginDeclaration {
  return {
    label: plugin.label, state: 'fixtures/frontend.ts#State',
    ...(plugin.icon !== undefined && { icon: 'Box' }),
    ...(plugin.canvas !== undefined && { canvas: 'fixtures/canvas.vue' }),
    ...(plugin.panel !== undefined && { panel: 'fixtures/panel.vue' }),
    ...(plugin.chat !== undefined && { chat: 'fixtures/chat.vue' }),
    ...(plugin.isPinned !== undefined && { isPinned: plugin.isPinned }),
    ...(plugin.hotkeys !== undefined && { hotkeys: plugin.hotkeys }),
    ...(plugin.options !== undefined && { options: plugin.options }),
    ...(plugin.fallbackPanel !== undefined && { fallbackPanel: { label: plugin.fallbackPanel.label,
      toggle: plugin.fallbackPanel.toggle, isShown: 'fixtures/frontend.ts#isShown' } }),
  };
}

function frontendDeclaration(fe: StepFEFacet): StepFrontendDeclaration {
  const component = 'fixtures/frontend.ts#Component';
  return {
    nodeConfig: { ...fe.nodeConfig, icon: 'Box' },
    ...(fe.colorKey !== undefined && { colorKey: fe.colorKey }),
    ...(fe.handlePrefix !== undefined && { handlePrefix: fe.handlePrefix }),
    ...(fe.components && { components: Object.fromEntries(Object.keys(fe.components).map(name => [name, component])) }),
    ...(fe.layout && { layout: {
      ...(fe.layout.getHeight !== undefined && { getHeight: 'fixtures/layout.ts#getHeight' }),
      ...(fe.layout.getPorts !== undefined && { getPorts: 'fixtures/layout.ts#getPorts' }),
      ...(fe.layout.hasInput !== undefined && { hasInput: fe.layout.hasInput }),
      ...(fe.layout.usesExitCount !== undefined && { usesExitCount: fe.layout.usesExitCount }),
    } }),
  };
}
