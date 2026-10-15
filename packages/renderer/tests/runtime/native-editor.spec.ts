import { afterEach, expect, it, vi } from 'vitest';
import { createApp, type App } from 'vue';
import type { ComponentExposed } from 'vue-component-type-helpers';
import { createFePackRegistry, hostDeclaration } from '@apackdev/host/fe';
import { startFeTestRuntime, stopFeTestRuntime } from '@apackdev/sdk/testing';
import TiptapEditor from '@apackdev/ui/components/tiptap/TiptapEditor';
import { ReferenceNode } from '@apackdev/ui/components/tiptap/reference-node';

// Exercise the real host registration and editor; these canvases are outside the editor contract.
vi.mock('@/views/packs/canvas.vue', () => ({ default: { render: () => null } }));
vi.mock('@/views/settings/canvas/index.vue', () => ({ default: { render: () => null } }));
vi.mock('@/runtime/settings', () => ({ resetApp: vi.fn() }));
import { hostFrontend } from '@/views/packs/plugin';

let app: App | undefined;
afterEach(() => { app?.unmount(); app = undefined; stopFeTestRuntime(); document.body.replaceChildren(); });

it('renders stored references with only the native host registered and refuses a competing owner', async () => {
  const registry = createFePackRegistry({ nativeDeclarations: [hostDeclaration] });
  registry.registerPackFE(hostFrontend);
  startFeTestRuntime({ packs: registry, catalog: {
    status: () => 'disconnected', problem: () => undefined, references: () => [], frontend: () => [], subscribe: () => () => {},
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
  expect(() => registry.registerPackFE({ id: 'competing-pack', tiptapPlugins: {
    suggestions: { extensions: { reference: ReferenceNode } },
  } })).toThrow(/host\/references.*competing-pack\/suggestions/);
  expect(registry.hasPackFE('competing-pack')).toBe(false);
  expect(markdown()).toBe('[Saved memo](apack-ref://memo/Memo-saved)');
});
