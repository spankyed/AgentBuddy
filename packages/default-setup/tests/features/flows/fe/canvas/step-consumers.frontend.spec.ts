import { afterEach, expect, it, vi } from 'vitest';
import { createApp, effectScope, h, nextTick, type App } from 'vue';
import { startFeTestRuntime, stopFeTestRuntime } from '@apackdev/sdk/testing';
import type { StepCatalogEntry, PackCatalogView } from '@apackdev/sdk/framework';
import type { StepFrontendBinding } from '@apackdev/sdk/fe';
import { getNodeConfig, getNodeClasses, getPaletteItems, isTriggerNode } from '@apackdev/ui/components/node-styles';
import { getDescriptor } from '@apackdev/ui/components/node-dimensions';
import NodePalette from '#features/flows/fe/canvas/components/NodePalette.vue';
import NodeTypeMenu from '#features/flows/fe/canvas/components/NodeTypeMenu.vue';
import { useNodeTypes } from '#features/flows/fe/canvas/nodes/index.ts';
import BaseNode from '@apackdev/ui/components/BaseNode';

const apps: App[] = [];
afterEach(() => { apps.splice(0).forEach(app => app.unmount()); document.body.replaceChildren(); stopFeTestRuntime(); });

function fixture() {
  const entry: StepCatalogEntry = { type: 'memo', packId: 'author', origin: 'installed', enabled: true,
    declarationRevision: 'declaration-one', buildRevision: 'build-one', declaration: {
      node: { label: 'Memo', defaults: { tags: ['draft'] } }, fe: {
        nodeConfig: { icon: 'File', category: 'data', connectionRules: { inputs: 1, outputs: 1 }, isImplemented: true },
        colorKey: 'blue', layout: { getHeight: 'src/layout.ts#getHeight', hasInput: false },
      },
    } };
  const icon = { render: () => h('span', { class: 'custom-icon' }, 'Icon') };
  const height = vi.fn(() => 100);
  const accepted: StepFrontendBinding = { packId: entry.packId, declaration: entry.declaration,
    declarationRevision: entry.declarationRevision, buildRevision: entry.buildRevision, runtimeRevision: 'runtime-one',
    binding: { type: entry.type, node: { label: 'Memo', defaults: { tags: ['draft'] } }, fe: { nodeConfig: {
      icon, category: 'data', connectionRules: { inputs: 1, outputs: 1 }, isImplemented: true,
    }, colorKey: 'blue', layout: { getHeight: height, hasInput: false } } } };
  const state: { status: ReturnType<PackCatalogView['status']>; entries: StepCatalogEntry[] } = { status: 'ready', entries: [entry] };
  const bindings = new Map([['memo', accepted]]);
  const catalogListeners = new Set<() => void>(); const bindingListeners = new Set<() => void>();
  startFeTestRuntime({
    catalog: { status: () => state.status, problem: () => undefined, references: () => [], frontend: () => [], artifacts: () => [], blocks: () => [], events: () => [], dsl: () => [], steps: () => state.entries,
      subscribe(listener) { catalogListeners.add(listener); return () => { catalogListeners.delete(listener); }; } },
    packs: { stepBindings: () => bindings,
      onChanged(listener: () => void) { bindingListeners.add(listener); return () => { bindingListeners.delete(listener); }; } } as never });
  const publish = (listeners = catalogListeners) => { for (const listener of listeners) listener(); };
  return { entry, accepted, icon, height, state, bindings, catalogListeners, bindingListeners, publish };
}

it('updates an already-mounted palette on declaration and binding changes, retaining unavailable metadata', async () => {
  const f = fixture(); const clicked = vi.fn();
  const root = document.createElement('div'); document.body.appendChild(root);
  const app = createApp(NodePalette, { onPaletteClick: clicked }); apps.push(app); app.mount(root);
  const button = () => root.querySelector('button')!;
  expect(button().textContent).toContain('Memo'); expect(button().draggable).toBe(true);
  expect(root.querySelector('.custom-icon')).not.toBeNull();
  f.bindings.clear(); f.publish(f.bindingListeners);
  // Creation rechecks readiness before Vue's next rendering turn.
  button().click(); expect(clicked).not.toHaveBeenCalled();
  await nextTick();
  expect(button().textContent).toContain('Memo'); expect(button().draggable).toBe(false);
  expect(root.querySelector('.custom-icon')).toBeNull();
  f.state.entries = [{ ...f.entry, declaration: { ...f.entry.declaration, node: { label: 'Replacement' },
    fe: { ...f.entry.declaration.fe!, colorKey: 'red' } }, buildRevision: 'build-two' }]; f.publish(); await nextTick();
  expect(button().textContent).toContain('Replacement'); expect(button().className).toContain('bg-red-900/60');
  expect(button().draggable).toBe(false);
  const replacement = { ...f.accepted, declaration: f.state.entries[0].declaration, buildRevision: 'build-two',
    binding: { ...f.accepted.binding, node: { label: 'Replacement' }, fe: { ...f.accepted.binding.fe!, colorKey: 'red' } } };
  f.bindings.set('memo', replacement); f.publish(f.bindingListeners); await nextTick();
  expect(button().draggable).toBe(true); button().click(); expect(clicked).toHaveBeenCalledWith('memo');
  f.state.status = 'disconnected'; f.publish(); await nextTick();
  expect(button().draggable).toBe(false); expect(root.querySelector('.custom-icon')).toBeNull();
  f.state.status = 'ready'; f.publish(); await nextTick(); expect(button().draggable).toBe(true);
  app.unmount(); apps.pop(); expect(f.catalogListeners.size).toBe(0); expect(f.bindingListeners.size).toBe(0);
});

it('keeps imperative presentation fresh, rejects inherited lookups and safely resolves color tokens', () => {
  const f = fixture();
  expect(getNodeConfig('memo')?.icon).toBe(f.icon); expect(getNodeClasses('memo')).toContain('bg-blue-900/60');
  f.state.status = 'disconnected';
  expect(getPaletteItems()).toMatchObject([{ type: 'memo', label: 'Memo', isDisabled: true }]);
  expect(getNodeConfig('memo')?.icon).not.toBe(f.icon);
  expect(getNodeConfig('toString')).toBeUndefined(); expect(getNodeConfig('__proto__')).toBeUndefined();
  f.state.entries = [{ ...f.entry, declaration: { ...f.entry.declaration, fe: { ...f.entry.declaration.fe!, colorKey: '__proto__' } } }];
  expect(getNodeConfig('memo')?.color).toBe('text-neutral-400'); expect(getNodeClasses('memo')).toContain('bg-neutral-700/60');
  f.state.entries = [{ ...f.entry, declaration: { ...f.entry.declaration, fe: { ...f.entry.declaration.fe!, nodeConfig: {
    ...f.entry.declaration.fe!.nodeConfig, connectionRules: { inputs: 0, outputs: -1 },
  } } } }];
  expect(isTriggerNode('memo')).toBe(false);
});

it('retains static layout flags without calling retired or replaced executable layouts', () => {
  const f = fixture(); const node = { id: 'm1', nodeType: 'memo' }; const descriptor = getDescriptor('memo');
  expect(descriptor.hasInput).toBe(false); expect(descriptor.getHeight(node, {})).toBe(100); expect(f.height).toHaveBeenCalledTimes(1);
  f.state.entries = [{ ...f.entry, enabled: false }];
  expect(getDescriptor('memo').hasInput).toBe(false); expect(descriptor.getHeight(node, {})).toBe(50);
  expect(f.height).toHaveBeenCalledTimes(1);
  f.state.entries = [f.entry]; const height = vi.fn(() => 180);
  f.bindings.set('memo', { ...f.accepted, binding: { ...f.accepted.binding, fe: { ...f.accepted.binding.fe!, layout: { getHeight: height, hasInput: false } } } });
  expect(descriptor.getHeight(node, {})).toBe(50); expect(height).not.toHaveBeenCalled();
  expect(getDescriptor('memo').getHeight(node, {})).toBe(180);
});


it('updates an already-open node menu instead of retaining its initial item list', async () => {
  const f = fixture(); const root = document.createElement('div'); document.body.appendChild(root);
  const app = createApp(NodeTypeMenu, { open: true }); apps.push(app); app.mount(root); await nextTick();
  expect(document.body.textContent).toContain('Memo');
  f.bindings.clear(); f.publish(f.bindingListeners); await nextTick();
  expect(document.body.textContent).not.toContain('Memo');
  f.bindings.set('memo', f.accepted); f.publish(f.bindingListeners); await nextTick();
  expect(document.body.textContent).toContain('Memo');
});

it('replaces custom node bindings in an open canvas and falls back when unavailable', () => {
  const f = fixture(); const component = { render: () => h('div', 'Custom node') };
  const declaration = { ...f.entry.declaration, fe: { ...f.entry.declaration.fe!, components: { node: 'src/Node.vue' } } };
  f.state.entries = [{ ...f.entry, declaration }];
  const accepted = { ...f.accepted, declaration, binding: { ...f.accepted.binding,
    fe: { ...f.accepted.binding.fe!, components: { node: component } } } };
  f.bindings.set('memo', accepted);
  const scope = effectScope(); const nodes = scope.run(() => useNodeTypes())!;
  expect(nodes.value.memo).toBe(component);
  f.bindings.clear(); f.publish(f.bindingListeners); expect(nodes.value.memo).toBe(BaseNode);
  const replacement = { render: () => h('div', 'Replacement') };
  f.bindings.set('memo', { ...accepted, binding: { ...accepted.binding,
    fe: { ...accepted.binding.fe!, components: { node: replacement } } } });
  f.publish(f.bindingListeners); expect(nodes.value.memo).toBe(replacement);
  scope.stop(); expect(f.catalogListeners.size).toBe(0); expect(f.bindingListeners.size).toBe(0);
});
