import { describe, expect, it } from 'vitest';
import { ManifestSchema } from '../../src/framework/declaration-schema.ts';
import { _pluginTargets, type PluginDeclaration } from '../../src/framework/plugin-declaration.ts';

const parse = (plugin: unknown) => ManifestSchema.safeParse({ id: 'fixture-pack', name: 'Fixture', version: '1.0.0', features: { notes: { description: 'Feature declaration fixture.', plugin } } });
const plugin: PluginDeclaration = { label: 'Notes', state: 'src/state.ts#machine', icon: { entry: 'src/icon.vue' },
  canvas: { routes: { entry: 'src/list.vue', view: { entry: 'src/view.vue', load: 'lazy' } } },
  panel: 'src/panel.vue', chat: 'src/chat.vue', isPinned: true, hotkeys: [{ action: 'open', global: false }],
  options: { headerClass: 'notes' }, fallbackPanel: { label: 'Inspect', toggle: { type: 'INSPECT' }, isShown: 'src/predicate.ts#isShown' } };

describe('declarative plugins', () => {
  it('retains routed, lazy and custom component references as data', () => {
    const parsed = parse(plugin);
    expect(parsed.success).toBe(true);
    if (!parsed.success) throw parsed.error;
    expect(parsed.data.features!.notes.plugin).toEqual(plugin);
    expect(_pluginTargets(plugin)).toEqual([
      ['state', 'src/state.ts#machine'], ['icon', 'src/icon.vue'], ['canvas.routes.entry', 'src/list.vue'],
      ['canvas.routes.view', 'src/view.vue'], ['panel', 'src/panel.vue'], ['chat', 'src/chat.vue'],
      ['fallbackPanel.isShown', 'src/predicate.ts#isShown'],
    ]);
  });
  it.each([
    { label: ' ', state: 'src/state.ts' }, { label: 'Notes', state: 'src/state.ts#bad-name' },
    { label: 'Notes', entry: 'src/plugin.ts' }, { ...plugin, canvas: { routes: {} } },
    { ...plugin, panel: { entry: 'src/panel.vue', load: 'eager' } },
    { ...plugin, options: { undeclared: true } },
    { ...plugin, canvas: { routes: JSON.parse('{"__proto__":"src/ghost.vue","view":"src/view.vue"}') } },
  ])('refuses ambiguous or invalid plugin declarations (%j)', declaration => {
    expect(parse(declaration).success).toBe(false);
  });
});
