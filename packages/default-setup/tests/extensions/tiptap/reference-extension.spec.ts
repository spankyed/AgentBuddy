import { afterEach, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { ReferenceNode } from '@apackdev/ui/components/tiptap/reference-node';
import { startFeTestRuntime, stopFeTestRuntime } from '@apackdev/sdk/testing';
import { ReferenceSuggestion } from '../../../src/extensions/tiptap/reference-extension.ts';
import { referenceSuggestionPluginKey } from '../../../src/extensions/tiptap/reference-plugin-key.ts';
import { isSuggestionActive } from '../../../src/extensions/tiptap/active-suggestions.ts';

let editor: Editor | undefined;
let dom: JSDOM | undefined;
afterEach(() => { editor?.destroy(); dom?.window.close(); stopFeTestRuntime(); vi.unstubAllGlobals(); });

it('adds reference suggestions alongside the host-owned reference node', () => {
  dom = new JSDOM('<!doctype html><html><body></body></html>');
  for (const key of ['window', 'document', 'DOMParser', 'HTMLElement', 'Node', 'MutationObserver', 'getComputedStyle'] as const)
    vi.stubGlobal(key, key === 'window' ? dom.window : dom.window[key]);
  startFeTestRuntime({ catalog: { status: () => 'ready', problem: () => undefined,
    references: () => [], frontend: () => [], artifacts: () => [], blocks: () => [], events: () => [], dsl: () => [], steps: () => [], subscribe: () => () => {} } });
  editor = new Editor({ element: document.createElement('div'), extensions: [StarterKit, ReferenceNode, ReferenceSuggestion] });
  expect(editor.schema.nodes.reference).toBeDefined();
  expect(referenceSuggestionPluginKey.getState(editor.state)?.active).toBe(false);
  editor.commands.insertContent('#');
  expect(referenceSuggestionPluginKey.getState(editor.state)).toMatchObject({ active: true, query: '' });
  expect(isSuggestionActive(editor.state)).toBe(true);
  editor.commands.insertContent(' ');
  expect(isSuggestionActive(editor.state)).toBe(false);
});
