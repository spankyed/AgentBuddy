import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import { ReferenceNode } from '../../../src/extensions/tiptap/reference-node.ts';

const navigation = vi.hoisted(() => ({ thread: vi.fn(), document: vi.fn() }));
vi.mock('../../../src/extensions/tiptap/reference-config.ts', () => ({
  REFERENCE_TYPES: {
    thread: { protocol: 'thread', category: 'threads', svgElements: [], navigate: navigation.thread },
    document: { protocol: 'doc', category: 'documents', svgElements: [], navigate: navigation.document },
  },
  CATEGORIES: [], ALL_PROTOCOLS: ['thread', 'doc'],
}));

const editors: Editor[] = [];
let dom: JSDOM;
beforeEach(() => {
  dom = new JSDOM('<!doctype html><html><body></body></html>');
  // Keep Node's TextEncoder/Uint8Array realm intact for the pack's esbuild harness.
  for (const key of ['window', 'document', 'DOMParser', 'HTMLElement', 'Node', 'MutationObserver', 'MouseEvent', 'getComputedStyle'] as const)
    vi.stubGlobal(key, key === 'window' ? dom.window : dom.window[key]);
});
afterEach(() => { for (const editor of editors.splice(0)) editor.destroy(); dom.window.close(); vi.unstubAllGlobals(); vi.clearAllMocks(); });
const editor = (content: object | string) => {
  const element = document.createElement('div'); document.body.appendChild(element);
  const instance = new Editor({ element, editable: false, extensions: [StarterKit, Markdown, ReferenceNode], content });
  editors.push(instance); return instance;
};
const reference = (id: string | null, refType = 'thread', label = 'Friendly label', shortCode = 'T-12') => ({
  type: 'reference', attrs: { refType, refId: id, shortCode, label },
});
const content = (...references: ReturnType<typeof reference>[]) => ({ type: 'doc', content: [{ type: 'paragraph', content: references }] });
const attrs = (instance: Editor) => {
  const found: Record<string, unknown>[] = [];
  instance.state.doc.descendants(node => { if (node.type.name === 'reference') found.push(node.attrs); });
  return found;
};
const markdown = (instance: Editor): string => (instance.storage as unknown as { markdown: { getMarkdown(): string } }).markdown.getMarkdown();

it.each([['thread', 'Thread-first', 'T-12'], ['document', 'Document-first', 'DOC-12']])(
  'keeps the %s entity id through HTML and Markdown instead of its display code', (type, id, code) => {
    const original = editor(content(reference(id, type, 'Friendly label', code)));
    const protocol = type === 'thread' ? 'thread' : 'doc';
    expect(original.getHTML()).toContain(`href="${protocol}://${id}"`);
    expect(attrs(editor(original.getHTML()))).toMatchObject([{ refId: id, shortCode: code, label: 'Friendly label' }]);
    expect(markdown(original)).toBe(`[Friendly label](${protocol}://${id})`);
    const restored = editor(markdown(original));
    expect(attrs(restored)).toMatchObject([{ refId: id, label: 'Friendly label' }]);
    restored.view.dom.querySelector('.reference-pill')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(type === 'thread' ? navigation.thread : navigation.document).toHaveBeenCalledWith(id);
  },
);

it('keeps distinct ids when two references share a short code', () => {
  const original = editor(content(reference('Thread-one'), reference('Thread-two')));
  expect(attrs(editor(markdown(original))).map(value => value.refId)).toEqual(['Thread-one', 'Thread-two']);
});

it('encodes targets once and escapes punctuation in visible Markdown labels', () => {
  const id = 'Thread-a/#value %'; const label = 'A [label] with \\ punctuation';
  const original = editor(content(reference(id, 'thread', label)));
  expect(markdown(original)).toContain(`thread://${encodeURIComponent(id)}`);
  expect(attrs(editor(markdown(original)))).toMatchObject([{ refId: id, label }]);
  expect(attrs(editor(original.getHTML()))).toMatchObject([{ refId: id, label }]);
});

it.each(['thread://', 'thread://Thread-%ZZ'])('refuses an empty or malformed encoded target %s', href => {
  expect(attrs(editor(`<p><a href="${href}">Bad reference</a></p>`))).toEqual([]);
});

it('does not turn unknown types or missing ids into thread links or navigation', () => {
  const original = editor(content(reference('Thread-one', 'unknown'), reference(null)));
  expect(original.getHTML()).not.toContain('href=');
  expect(markdown(original)).not.toContain('thread://');
  for (const node of original.view.dom.querySelectorAll('.reference-pill')) node.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  expect(navigation.thread).not.toHaveBeenCalled();
});

it('delivers the updated target from an existing node view', () => {
  const original = editor(content(reference('Thread-one')));
  const view = original.view.dom.querySelector('.reference-pill')!;
  original.commands.setNodeSelection(1);
  original.commands.updateAttributes('reference', { refId: 'Thread-two', label: 'Updated label' });
  expect(original.view.dom.querySelector('.reference-pill')).toBe(view);
  expect(view.textContent).toBe('Updated label');
  view.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  expect(navigation.thread).toHaveBeenCalledWith('Thread-two');
});
