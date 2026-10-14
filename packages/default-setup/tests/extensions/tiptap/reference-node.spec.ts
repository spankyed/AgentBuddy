import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from 'tiptap-markdown';
import { ReferenceNode } from '../../../src/extensions/tiptap/reference-node.ts';

import { startFeTestRuntime, stopFeTestRuntime } from '@apackdev/sdk/testing';
import { resolveName } from '@apackdev/sdk/ids';
import type { ReferenceCatalogEntry } from '@apackdev/sdk/framework';
import type { ReferenceBinding, ReferenceTypeConfig } from '@apackdev/sdk/fe/references';

const navigation = { thread: vi.fn(), document: vi.fn() };
const listeners = new Set<() => void>();
let entries: ReferenceCatalogEntry[];
let bindings: Map<string, ReferenceBinding<ReferenceTypeConfig>>;
let ready: boolean;
function addType(name: string, protocol: string, navigate = vi.fn()) {
  const featureRef = resolveName('links', name + '-pack');
  entries.push({ packId: name + '-pack', featureRef, origin: 'native', enabled: true, declaration: {
    types: { [name]: { protocol, category: 'links', icon: 'Link', svgElements: [], navigate: 'src/links.ts#open' } }, categories: {},
  } });
  bindings.set(name, { featureRef, binding: { protocol, category: 'links', icon: {}, svgElements: [], navigate } });
  return navigate;
}

const editors: Editor[] = [];
let dom: JSDOM;
beforeEach(() => {
  entries = []; bindings = new Map(); ready = true;
  addType('thread', 'thread', navigation.thread); addType('document', 'doc', navigation.document);
  startFeTestRuntime({ application: {} as never, settings: {} as never, secrets: {} as never, client: {} as never,
    catalog: { status: () => ready ? 'ready' : 'disconnected', problem: () => undefined, references: () => entries,
      subscribe(listener) { listeners.add(listener); return () => { listeners.delete(listener); }; } },
    packs: { referenceTypes: () => bindings } as never });
  dom = new JSDOM('<!doctype html><html><body></body></html>');
  // Keep Node's TextEncoder/Uint8Array realm intact for the pack's esbuild harness.
  for (const key of ['window', 'document', 'DOMParser', 'HTMLElement', 'Node', 'MutationObserver', 'MouseEvent', 'getComputedStyle'] as const)
    vi.stubGlobal(key, key === 'window' ? dom.window : dom.window[key]);
});
afterEach(() => { for (const editor of editors.splice(0)) editor.destroy(); dom.window.close(); stopFeTestRuntime(); expect(listeners.size).toBe(0); vi.unstubAllGlobals(); vi.clearAllMocks(); });
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

it('parses a new external protocol in an already-created editor without starting or rebuilding it', () => {
  const opened = editor('<p>Open before contribution</p>');
  const navigate = addType('memo', 'memo');
  opened.commands.setContent('<p><a href="memo://Memo-one">Memo</a></p>');
  expect(attrs(opened)).toMatchObject([{ refType: 'memo', refId: 'Memo-one' }]);
  expect(markdown(opened)).toBe('[Memo](memo://Memo-one)');
  expect(navigate).not.toHaveBeenCalled();
  opened.view.dom.querySelector('.reference-pill')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  expect(navigate).toHaveBeenCalledWith('Memo-one');
});

it('refreshes an existing node icon and uses current eligible navigation, disposing its listener', () => {
  const opened = editor(content(reference('Thread-one')));
  const pill = opened.view.dom.querySelector('.reference-pill')!;
  entries = entries.map(entry => entry.packId === 'thread-pack' ? { ...entry, declaration: { ...entry.declaration,
    types: { thread: { ...entry.declaration.types.thread, svgElements: [['path', { d: 'M2 4h8' }]] } } } } : entry);
  const notified = [...listeners];
  for (const listener of notified) listener();
  expect(pill.querySelector('path')?.getAttribute('d')).toBe('M2 4h8');
  ready = false;
  pill.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  expect(navigation.thread).not.toHaveBeenCalled();
  expect(opened.getHTML()).toContain('thread://Thread-one');
  ready = true; bindings.delete('thread');
  pill.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  expect(navigation.thread).not.toHaveBeenCalled();
});

it('retired node views release navigation handlers as well as declaration listeners', () => {
  const opened = editor(content(reference('Thread-one')));
  const retired = opened.view.dom.querySelector('.reference-pill')!;
  opened.commands.setContent('<p>Reference removed</p>');
  expect(listeners.size).toBe(0);
  retired.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  expect(navigation.thread).not.toHaveBeenCalled();
});
