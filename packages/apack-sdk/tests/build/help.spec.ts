import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { compileHelp } from '../../src/build/help.ts';
import { generatePackFiles } from '../../src/build/generate-entries.ts';
import type { PackManifest } from '../../src/build/manifest.ts';

const dirs: string[] = [];
afterEach(() => { for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true }); });
function fixture(files: Record<string, string>) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'apack-help-')); dirs.push(root);
  fs.mkdirSync(path.join(root, 'src/help'), { recursive: true });
  for (const [name, text] of Object.entries(files)) { const file = path.join(root, 'src/help', name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); }
  const manifest: PackManifest = { id: 'test-pack', name: 'Test', version: '1.0.0', features: { code: {} }, help: { path: 'src/help' } };
  return { root, manifest };
}
describe('Markdown help compilation', () => {
  it('bundles nested articles, metadata and resolved inline/reference links without a runtime loader', () => {
    const { root, manifest } = fixture({
      'start.md': '---\nid: welcome\nfeatures: [code]\norder: 1\n---\n# Welcome\n\n[Next](nested/next.md)\n\n[More][next]\n[next]: nested/next.md',
      'nested/next.md': '# Next\nDetails',
    });
    const articles = compileHelp(root, manifest);
    expect(articles.find(a => a.id === 'welcome')).toMatchObject({ title: 'Welcome', features: ['code'], order: 1 });
    expect(articles.find(a => a.id === 'welcome')!.body).toContain('https://help.apack.invalid/test-pack/nested%2Fnext');
    const files = generatePackFiles(manifest, { packRoot: root });
    expect(files['src/__generated__/pack-entry.ts']).toContain('"title":"Welcome"');
    fs.rmSync(path.join(root, 'src/help'), { recursive: true });
    expect(files['src/__generated__/pack-entry.ts']).toContain('Details');
  });
  it.each([
    ['empty H1', { 'a.md': '#  \nBody text' }, /H1/],
    ['missing H1', { 'a.md': 'No title' }, /H1/],
    ['duplicate ID', { 'a.md': '---\nid: same\n---\n# A', 'b.md': '---\nid: same\n---\n# B' }, /duplicate/],
    ['unknown feature', { 'a.md': '---\nfeatures: [missing]\n---\n# A' }, /features/],
    ['bad order', { 'a.md': '---\norder: later\n---\n# A' }, /order/],
    ['broken link', { 'a.md': '# A\n[Missing](missing.md)' }, /help link/],
  ])('rejects %s with an actionable source error', (_label, files, error) => {
    const { root, manifest } = fixture(files as Record<string, string>);
    expect(() => compileHelp(root, manifest)).toThrow(error as RegExp);
  });
  it('rejects absent directories and symlinks', () => {
    const { root, manifest } = fixture({});
    fs.symlinkSync(os.tmpdir(), path.join(root, 'src/help/escape'));
    expect(() => compileHelp(root, manifest)).toThrow(/symbolic/);
    fs.rmSync(path.join(root, 'src/help'), { recursive: true });
    expect(() => compileHelp(root, manifest)).toThrow(/must exist/);
  });
  it('preserves fenced examples instead of resolving their example links', () => {
    const { root, manifest } = fixture({ 'a.md': '# A\n```md\n[Example](missing.md)\n```' });
    expect(compileHelp(root, manifest)[0].body).toContain('[Example](missing.md)');
  });
});
