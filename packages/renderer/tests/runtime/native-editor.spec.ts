import { afterEach, expect, it, vi } from 'vitest';
import { createApp, defineComponent, h, nextTick, onUnmounted, reactive, type App } from 'vue';
import type { ComponentExposed } from 'vue-component-type-helpers';
import { hostDeclaration } from '@apackdev/host/fe';
import { createNativeFrontendTestRegistry } from '@apackdev/host/fe/testing';
import { startFeTestRuntime, stopFeTestRuntime } from '@apackdev/sdk/testing';
import TiptapEditor from '@apackdev/ui/components/tiptap/TiptapEditor';
import { Extension, Mark, Node } from '@tiptap/core';
import { undoDepth } from '@tiptap/pm/history';
import { ReferenceNode } from '@apackdev/ui/components/tiptap/reference-node';

// Exercise the real host registration and editor; these canvases are outside the editor contract.
vi.mock('@/views/packs/canvas.vue', () => ({ default: { render: () => null } }));
vi.mock('@/views/settings/canvas/index.vue', () => ({ default: { render: () => null } }));
vi.mock('@/runtime/settings', () => ({ resetApp: vi.fn() }));
import { hostFrontend } from '@/views/packs/plugin';

let app: App | undefined;
afterEach(() => { app?.unmount(); app = undefined; stopFeTestRuntime(); document.body.replaceChildren(); vi.restoreAllMocks(); });

it('renders stored references with only the native host registered and refuses a competing owner', async () => {
  const registry = createNativeFrontendTestRegistry([hostDeclaration]);
  registry.registerFixture(hostFrontend);
  startFeTestRuntime({ packs: registry, catalog: {
    status: () => 'disconnected', problem: () => undefined, references: () => [], frontend: () => [], artifacts: () => [], blocks: () => [], dsl: () => [], events: () => [], steps: () => [], subscribe: () => () => {},
  } });
  expect(registry.hasPackFE('default-setup')).toBe(false);
  const root = document.createElement('div'); document.body.appendChild(root);
  app = createApp(TiptapEditor, { mode: 'viewer', modelValue: '[Saved memo](apack-ref://memo/Memo-saved)' });
  const mounted = app.mount(root);
  await vi.waitFor(() => expect(root.querySelector('.reference-pill')?.textContent).toBe('Saved memo'));
  const editor = (mounted as ComponentExposed<typeof TiptapEditor>).editor!;
  const markdown = () => (editor.storage as unknown as { markdown: { getMarkdown(): string } }).markdown.getMarkdown();
  expect(markdown()).toBe('[Saved memo](apack-ref://memo/Memo-saved)');
  expect(editor.getJSON().content?.[0].content?.[0]).toMatchObject({ type: 'reference', attrs: { refType: 'memo', refId: 'Memo-saved' } });
  expect(editor.getHTML()).toContain('apack-ref://memo/Memo-saved');
  expect(() => registry.registerFixture({ id: 'competing-pack', tiptapPlugins: {
    suggestions: { extensions: { reference: ReferenceNode } },
  } })).toThrow(/host\/references.*competing-pack\/suggestions/);
  expect(registry.hasPackFE('competing-pack')).toBe(false);
  expect(markdown()).toBe('[Saved memo](apack-ref://memo/Memo-saved)');
});

async function openEditor(content = 'Draft') {
  const registry = createNativeFrontendTestRegistry([hostDeclaration]);
  registry.registerFixture(hostFrontend);
  const subscribe = registry.onChanged;
  const unsubscribed = vi.fn();
  vi.spyOn(registry, 'onChanged').mockImplementation(listener => {
    const stop = subscribe(listener);
    return () => { unsubscribed(); stop(); };
  });
  startFeTestRuntime({ packs: registry, catalog: {
    status: () => 'ready', problem: () => undefined, references: () => [], frontend: () => [], artifacts: () => [], blocks: () => [], dsl: () => [], events: () => [], steps: () => [], subscribe: () => () => {},
  } });
  const root = document.createElement('div'); document.body.appendChild(root);
  const updates = vi.fn(); const subDocuments = vi.fn();
  const props = reactive({ mode: 'editor' as const, modelValue: content, entityId: 'first', 'onUpdate:modelValue': updates, 'onSubDocumentLinkDeleted': subDocuments, 'onSubDocumentLinkRestored': subDocuments });
  app = createApp({ render: () => h(TiptapEditor, { ...props, ref: 'input' }) });
  const mounted = app.mount(root);
  const exposed = () => mounted.$refs.input as ComponentExposed<typeof TiptapEditor>;
  await vi.waitFor(() => expect(exposed()?.editor).toBeDefined());
  await vi.waitFor(() => expect(exposed().editor?.isInitialized).toBe(true));
  return { registry, root, props, updates, exposed, unsubscribed, subDocuments };
}

it('adopts changed extensions in an open editor without losing pending edits or selection', async () => {
  const { registry, root, updates, exposed, subDocuments } = await openEditor();
  const first = exposed().editor!;
  first.commands.setTextSelection(3);
  first.commands.insertContent(' pending');
  first.commands.insertContent({ type: 'subDocumentLink', attrs: { noteId: 'child-note', title: 'Child', icon: null } });
  const subDocumentCount = subDocuments.mock.calls.length;
  first.view.dom.focus();
  expect(first.isFocused).toBe(true);
  const document = first.getJSON(); const selection = first.state.selection.toJSON();
  const updateCount = updates.mock.calls.length;
  expect(undoDepth(first.state)).toBeGreaterThan(0);
  registry.registerFixture({ id: 'unrelated' });
  await nextTick();
  expect(exposed().editor).toBe(first);
  expect(undoDepth(first.state)).toBeGreaterThan(0);

  const disposed = vi.fn(); const popupDisposed = vi.fn(); const predicate = vi.fn(() => true);
  const Popup = defineComponent({ setup() { onUnmounted(popupDisposed); return () => h('span', { 'data-popup': '' }, 'Live popup'); } });
  const Tools = Extension.create({ name: 'liveTools', onDestroy: disposed });
  registry.registerFixture({ id: 'tools', tiptapPlugins: { tools: {
    extensions: { liveTools: Tools }, popups: { example: Popup }, isSuggestionActive: predicate,
  } } });
  await vi.waitFor(() => expect(root.querySelector('[data-popup]')).not.toBeNull());
  const second = exposed().editor!;
  expect(second).not.toBe(first); expect(first.isDestroyed).toBe(true);
  expect(second.getJSON()).toEqual(document); expect(second.state.selection.toJSON()).toEqual(selection);
  await vi.waitFor(() => expect(window.document.activeElement).toBe(second.view.dom));
  expect(subDocuments).toHaveBeenCalledTimes(subDocumentCount);
  expect(undoDepth(second.state)).toBe(0);
  expect(updates).toHaveBeenCalledTimes(updateCount);
  second.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(predicate).toHaveBeenCalled();
  predicate.mockClear();
  registry.unregisterPackFE('tools');
  await vi.waitFor(() => expect(exposed().editor).toBeDefined());
  const third = exposed().editor!;
  expect(third).not.toBe(second); expect(second.isDestroyed).toBe(true);
  expect(disposed).toHaveBeenCalledTimes(1); expect(popupDisposed).toHaveBeenCalledTimes(1);
  expect(root.querySelector('[data-popup]')).toBeNull();
  third.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(predicate).not.toHaveBeenCalled();
  expect(third.getJSON()).toEqual(document); expect(updates).toHaveBeenCalledTimes(updateCount);
  expect(subDocuments).toHaveBeenCalledTimes(subDocumentCount);
});

it('retains unavailable document data, restores it on re-enable and accepts an explicit entity switch', async () => {
  const { registry, root, exposed, updates, props } = await openEditor();
  const Token = Node.create({ name: 'externalToken', inline: true, group: 'inline', atom: true,
    addAttributes: () => ({ id: { default: null } }), renderHTML: ({ node }) => ['span', { 'data-token': node.attrs.id }, 'Token'] });
  const registration = { id: 'tokens', tiptapPlugins: { tokens: { extensions: { externalToken: Token } } } };
  registry.registerFixture(registration);
  await vi.waitFor(() => expect(exposed().editor?.schema.nodes.externalToken).toBeDefined());
  exposed().editor!.commands.insertContent({ type: 'externalToken', attrs: { id: 'saved-token' } });
  const document = exposed().editor!.getJSON(); const count = updates.mock.calls.length;
  registry.unregisterPackFE('tokens');
  await vi.waitFor(() => expect(root.querySelector('[role=status]')?.textContent).toContain('unavailable editor contribution'));
  expect(exposed().editor).toBeUndefined(); expect(updates).toHaveBeenCalledTimes(count);
  registry.registerFixture(registration);
  await vi.waitFor(() => expect(exposed().editor?.schema.nodes.externalToken).toBeDefined());
  expect(exposed().editor!.getJSON()).toEqual(document); expect(updates).toHaveBeenCalledTimes(count);
  registry.unregisterPackFE('tokens');
  await vi.waitFor(() => expect(root.querySelector('[role=status]')).not.toBeNull());
  props.entityId = 'second'; props.modelValue = 'Another document';
  await vi.waitFor(() => expect(exposed().editor?.getText()).toBe('Another document'));
  expect(root.querySelector('[role=status]')).toBeNull();
  expect(updates).toHaveBeenCalledTimes(count);
});

it('updates popup and predicate bindings without resetting document history', async () => {
  const { registry, root, exposed } = await openEditor();
  const editor = exposed().editor!;
  editor.commands.insertContent(' unsaved');
  const history = undoDepth(editor.state); const selection = editor.state.selection.toJSON();
  const disposed = vi.fn(); const oldPredicate = vi.fn(() => true); const nextPredicate = vi.fn(() => true);
  const Popup = defineComponent({ setup() { onUnmounted(disposed); return () => h('span', { 'data-popup': '' }, 'First'); } });
  const NextPopup = defineComponent({ setup: () => () => h('span', { 'data-popup': '' }, 'Second') });
  registry.registerFixture({ id: 'popups', tiptapPlugins: { suggestions: { popups: { example: Popup }, isSuggestionActive: oldPredicate } } });
  await vi.waitFor(() => expect(root.querySelector('[data-popup]')?.textContent).toBe('First'));
  editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(oldPredicate).toHaveBeenCalled(); oldPredicate.mockClear();
  registry.replaceFixture({ id: 'popups', tiptapPlugins: { suggestions: { popups: { example: NextPopup }, isSuggestionActive: nextPredicate } } });
  await vi.waitFor(() => expect(root.querySelector('[data-popup]')?.textContent).toBe('Second'));
  expect(exposed().editor).toBe(editor); expect(disposed).toHaveBeenCalledTimes(1);
  expect(undoDepth(editor.state)).toBe(history); expect(editor.state.selection.toJSON()).toEqual(selection);
  editor.view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  expect(oldPredicate).not.toHaveBeenCalled(); expect(nextPredicate).toHaveBeenCalled();
});

it('publishes only the latest contribution generation during rapid replacement and unmount', async () => {
  const { registry, exposed, unsubscribed } = await openEditor();
  const initial = exposed().editor!;
  const created = vi.fn(); const stopped = vi.fn();
  const First = Extension.create({ name: 'firstTools', onBeforeCreate: created });
  const Latest = Extension.create({ name: 'latestTools', onBeforeCreate: created, onDestroy: stopped });
  registry.registerFixture({ id: 'rapid', tiptapPlugins: { tools: { extensions: { firstTools: First } } } });
  registry.replaceFixture({ id: 'rapid', tiptapPlugins: { tools: { extensions: { latestTools: Latest } } } });
  await vi.waitFor(() => expect(exposed().editor?.extensionManager.extensions.some(extension => extension.name === 'latestTools')).toBe(true));
  expect(initial.isDestroyed).toBe(true); expect(created).toHaveBeenCalledTimes(1);
  const accepted = exposed().editor!;
  registry.unregisterPackFE('rapid');
  app!.unmount(); app = undefined;
  await nextTick();
  expect(accepted.isDestroyed).toBe(true); expect(stopped).toHaveBeenCalledTimes(1);
  expect(unsubscribed).toHaveBeenCalledTimes(1);
  registry.registerFixture({ id: 'after-unmount', tiptapPlugins: { tools: { extensions: { firstTools: First } } } });
  await nextTick(); expect(created).toHaveBeenCalledTimes(1);
});

it('refuses an attribute-dropping schema replacement and restores the original document', async () => {
  const { registry, root, exposed, updates } = await openEditor();
  const Token = Node.create({ name: 'externalToken', inline: true, group: 'inline', atom: true,
    addAttributes: () => ({ identity: { default: null } }), renderHTML: () => ['span', {}, 'Token'] });
  const register = (token: typeof Token) => ({ id: 'tokens', tiptapPlugins: { tokens: { extensions: { externalToken: token } } } });
  registry.registerFixture(register(Token));
  await vi.waitFor(() => expect(exposed().editor?.schema.nodes.externalToken).toBeDefined());
  exposed().editor!.commands.insertContent({ type: 'externalToken', attrs: { identity: 'keep-this-id' } });
  const document = exposed().editor!.getJSON(); const count = updates.mock.calls.length;
  registry.replaceFixture(register(Token.extend({ addAttributes: () => ({}) })));
  await vi.waitFor(() => expect(root.querySelector('[role=status]')).not.toBeNull());
  expect(exposed().editor).toBeUndefined(); expect(updates).toHaveBeenCalledTimes(count);
  registry.replaceFixture(register(Token));
  await vi.waitFor(() => expect(exposed().editor).toBeDefined());
  expect(exposed().editor!.getJSON()).toEqual(document); expect(updates).toHaveBeenCalledTimes(count);
});

it('retires an extension when its qualified group changes even if its object is reused', async () => {
  const { registry, exposed } = await openEditor();
  const retired = vi.fn();
  const Tools = Extension.create({ name: 'groupTools', onDestroy: retired });
  registry.registerFixture({ id: 'tools', tiptapPlugins: { first: { extensions: { groupTools: Tools } } } });
  await vi.waitFor(() => expect(exposed().editor?.extensionManager.extensions.some(extension => extension.name === 'groupTools')).toBe(true));
  const original = exposed().editor!; const document = original.getJSON();
  registry.replaceFixture({ id: 'tools', tiptapPlugins: { second: { extensions: { groupTools: Tools } } } });
  await vi.waitFor(() => expect(exposed().editor).toBeDefined());
  expect(exposed().editor).not.toBe(original); expect(retired).toHaveBeenCalledTimes(1);
  expect(exposed().editor!.getJSON()).toEqual(document);
});

it('finishes editor retirement after a throwing extension cleanup and keeps the pane usable', async () => {
  const { registry, root, exposed } = await openEditor();
  const Broken = Extension.create({ name: 'brokenCleanup', onDestroy() { throw new Error('Extension cleanup failed'); } });
  registry.registerFixture({ id: 'broken', tiptapPlugins: { tools: { extensions: { brokenCleanup: Broken } } } });
  await vi.waitFor(() => expect(exposed().editor?.extensionManager.extensions.some(extension => extension.name === 'brokenCleanup')).toBe(true));
  const original = exposed().editor!; const document = original.getJSON();
  registry.unregisterPackFE('broken');
  await vi.waitFor(() => expect(exposed().editor).toBeDefined());
  expect(original.isDestroyed).toBe(true); expect(exposed().editor).not.toBe(original);
  expect(exposed().editor!.getJSON()).toEqual(document);
  await vi.waitFor(() => expect(root.querySelectorAll('.ProseMirror')).toHaveLength(1));
});

it('preserves pending formatting attributes and refuses a replacement that would drop them', async () => {
  const { registry, root, exposed, updates } = await openEditor();
  const Format = Mark.create({ name: 'externalFormat', addAttributes: () => ({ identity: { default: null } }),
    renderHTML: () => ['span', {}, 0] });
  const register = (format: typeof Format) => ({ id: 'format', tiptapPlugins: { format: { extensions: { externalFormat: format } } } });
  registry.registerFixture(register(Format));
  await vi.waitFor(() => expect(exposed().editor?.schema.marks.externalFormat).toBeDefined());
  exposed().editor!.commands.setTextSelection(2);
  exposed().editor!.commands.setMark('externalFormat', { identity: 'pending-style' });
  const document = exposed().editor!.getJSON(); const count = updates.mock.calls.length;
  registry.replaceFixture(register(Format.extend({ addAttributes: () => ({}) })));
  await vi.waitFor(() => expect(root.querySelector('[role=status]')).not.toBeNull());
  expect(exposed().editor).toBeUndefined(); expect(updates).toHaveBeenCalledTimes(count);
  registry.replaceFixture(register(Format));
  await vi.waitFor(() => expect(exposed().editor).toBeDefined());
  expect(exposed().editor!.getJSON()).toEqual(document);
  expect(exposed().editor!.state.storedMarks?.map(mark => mark.toJSON())).toEqual([
    { type: 'externalFormat', attrs: { identity: 'pending-style' } },
  ]);
  expect(updates).toHaveBeenCalledTimes(count);
});
