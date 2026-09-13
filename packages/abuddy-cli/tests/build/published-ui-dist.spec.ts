import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { PACKAGES_BUILT, REPO_ROOT } from '../helpers/published-packages';

/** @abuddy/ui's build: compiled modules only, and each module's state defined once. */
const UI_DIST = path.join(REPO_ROOT, 'packages', 'abuddy-ui', 'dist');
const walk = (dir: string) => fs.readdirSync(dir, { recursive: true, encoding: 'utf-8' }).map((file) => path.join(dir, file));

describe.skipIf(!PACKAGES_BUILT)('@abuddy/ui dist', () => {
  it('ships compiled modules, not SFC source', () => {
    const files = walk(UI_DIST).map((file) => path.relative(UI_DIST, file));
    expect(files.filter((file) => file.endsWith('.vue'))).toEqual([]);
    expect(files).toContain('components/tiptap/TiptapEditor.js');
  });

  it('ships CSS with no relative @import left to resolve', () => {
    const unresolved = walk(UI_DIST)
      .filter((file) => file.endsWith('.css'))
      .filter((file) => /@import\s+(url\()?["']\.{1,2}\//.test(fs.readFileSync(file, 'utf-8')))
      .map((file) => path.relative(UI_DIST, file));
    expect(unresolved).toEqual([]);
  });

  it('defines a module several entries import in exactly one file', () => {
    // monaco-config's module state, used by SimpleMonacoEditor, UnifiedMonacoEditor and its own export
    const definitions = walk(UI_DIST)
      .filter((file) => file.endsWith('.js'))
      .filter((file) => /\bregisteredDslLibs = \/\* @__PURE__ \*\/ new Set\(|\bregisteredDslLibs = new Set\(/.test(fs.readFileSync(file, 'utf-8')))
      .map((file) => path.relative(UI_DIST, file));
    expect(definitions).toEqual(['components/monaco-config.js']);
  });
});
