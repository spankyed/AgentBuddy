import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it, vi } from 'vitest';
import { packFixture } from '@apackdev/sdk/testing/pack-fixture';
import { REPO_ROOT } from '@apackdev/host/build/packages-built';
import { readPackBuild } from '@apackdev/host/packs';
import { buildCommand } from '../../src/commands/build.ts';
import { inspectPack } from '../../src/commands/info.ts';

const roots: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  roots.splice(0).forEach(root => fs.rmSync(root, { recursive: true, force: true }));
});

it('builds explicit editor members and discovers a copied build without authored sources', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'apack-editor-declarations-'));
  roots.push(root);
  const extensions = {
    tiptapPlugins: { suggestions: {
      extensions: { mention: 'src/editor.ts#Mention' }, popups: { mentions: 'src/Popup.vue' },
      isSuggestionActive: 'src/editor.ts#isSuggestionActive',
    } },
    appExtensions: { welcome: 'src/Welcome.vue' },
  };
  packFixture({ at: root, nodeModules: path.join(REPO_ROOT, 'node_modules'),
    manifest: { id: 'editor-pack', name: 'Editor pack', features: {}, extensions }, files: {
      'src/editor.ts': `import { Extension } from '@tiptap/core';
import type { EditorState } from '@tiptap/pm/state';
export const Mention = Extension.create({ name: 'mention' });
export function isSuggestionActive(state: EditorState): boolean { return state.selection.empty; }`,
      'src/Popup.vue': '<template><div>Suggestions</div></template>',
      'src/Welcome.vue': '<template><div>Welcome</div></template>',
    } });
  vi.spyOn(process, 'cwd').mockReturnValue(root);
  await buildCommand([]);
  const built = readPackBuild(path.join(root, 'dist'));
  expect(built.snapshot.manifest.extensions).toEqual(extensions);
  expect(built.snapshot.provenance?.tiptapExtensions).toEqual({ mention: 'editor-pack' });
  const entry = fs.readFileSync(path.join(root, 'src/__generated__/pack-entry-fe.ts'), 'utf8');
  expect(entry).toContain('Mention as __editor_0');
  expect(entry).toContain('isSuggestionActive as __editor_2');
  expect(fs.existsSync(path.join(root, 'dist/runtime/fe.js'))).toBe(true);

  const installed = fs.mkdtempSync(path.join(os.tmpdir(), 'apack-editor-installed-'));
  roots.push(installed);
  fs.cpSync(path.join(root, 'dist'), path.join(installed, 'dist'), { recursive: true });
  fs.copyFileSync(path.join(root, 'apack.json'), path.join(installed, 'apack.json'));
  fs.rmSync(path.join(root, 'src'), { recursive: true });
  const report = await inspectPack(installed);
  expect(report.build.status).toBe('verified');
  expect(report.declared.tiptapPlugins).toEqual([
    { id: 'suggestions', extensions: ['mention'], popups: ['mentions'], isSuggestionActive: true },
  ]);
  expect(report.declared.appExtensions).toEqual(['welcome']);
  expect(fs.existsSync(path.join(installed, 'src'))).toBe(false);
});
