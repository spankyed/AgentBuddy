import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compilePack, SEED_INDEX_FILE } from '../../src/build/seed-compiler.ts';
import type { PackConfig } from '../../src/build/types.ts';

let root: string;
let out: string;
beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'abuddy-seed-compiler-'));
  out = path.join(root, 'dist');
  vi.spyOn(console, 'log').mockImplementation(() => {});
});
afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function write(file: string, content: string): void {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), content);
}

const read = (file: string) => JSON.parse(fs.readFileSync(path.join(out, file), 'utf-8'));
const compile = (seeds: PackConfig['seeds']) => compilePack({ packDir: root, outputDir: out, packConfig: { name: 'demo', seeds } });

describe('compilePack', () => {
  it('compiles a markdown-tree entry into records, copies its media and indexes it', async () => {
    write('seeds/memos/first.md', '---\ntitle: 2024\npinned: true\n---\nHello ![pic](media/pic.png)\n');
    write('seeds/memos/group/index.md', '---\ntitle: Group\n---\nGroup body\n');
    write('seeds/memos/group/child-memo.md', 'Child body\n');
    write('seeds/memos/media/pic.png', 'PNG');
    const result = await compile({
      memos: {
        path: 'seeds/memos', format: 'markdown-tree', entity: 'Memo', identity: ['title', 'parent'],
        tree: { branch: 'index.md' }, media: 'media',
        fields: { title: { from: 'frontmatter.title', default: 'filename', type: 'string' }, pinned: { from: 'frontmatter.pinned', default: false }, body: { from: 'body' } },
      },
    });

    const { records } = read('memos.seed.json');
    expect(records.map((r: { title: string }) => r.title)).toEqual(['2024', 'Group']);
    expect(records[0]).toMatchObject({ entity: 'Memo', title: '2024', pinned: true, body: 'Hello ![pic](media/pic.png)\n', sourceHash: expect.stringMatching(/^[0-9a-f]{16}$/) });
    expect(records[1].children).toEqual([expect.objectContaining({ entity: 'Memo', title: 'child memo', pinned: false })]);
    expect(fs.readFileSync(path.join(out, 'media/memos/pic.png'), 'utf-8')).toBe('PNG');
    expect(read(SEED_INDEX_FILE)).toEqual({ version: 1, seeds: [{ key: 'memos', seeded: true, identity: ['title', 'parent'], count: 3 }] });
    expect(result.seeds).toEqual({ memos: 3 });
  });

  it('compiles an entry with a pack compiler module, which may leave sourceHash to the default', async () => {
    write('seeds/tags.txt', 'red\nblue\n');
    write('compile-tags.mjs', `import * as fs from 'node:fs';
export default ({ path, key }) => fs.readFileSync(path, 'utf-8').trim().split('\\n').map((name) => ({ entity: 'Tag', name, key }));`);
    const importModule = vi.fn((file: string) => import(file));
    await compilePack({ packDir: root, outputDir: out, importModule, packConfig: { name: 'demo', seeds: {
      tags: { path: 'seeds/tags.txt', compiler: 'compile-tags.mjs', entity: 'Tag', identity: ['name'] },
    } } });
    expect(importModule).toHaveBeenCalledWith(path.join(root, 'compile-tags.mjs'));
    expect(read('tags.seed.json').records).toEqual([
      { entity: 'Tag', name: 'red', key: 'tags', sourceHash: expect.stringMatching(/^[0-9a-f]{16}$/) },
      { entity: 'Tag', name: 'blue', key: 'tags', sourceHash: expect.stringMatching(/^[0-9a-f]{16}$/) },
    ]);
  });

  it("fails when a compiled record's entity isn't one the entry declares", async () => {
    write('seeds/items.json', JSON.stringify([{ entity: 'Other', name: 'x' }]));
    await expect(compile({ items: { path: 'seeds/items.json', format: 'json', entity: 'Item' } }))
      .rejects.toThrow(/Seed "items" records\[0\]: entity "Other" isn't one of Item/);
  });

  it('writes a compile-only entry as unseeded', async () => {
    write('seeds/faqs.json', JSON.stringify([{ question: 'Why?' }]));
    await compile({ faqs: { path: 'seeds/faqs.json', format: 'json' } });
    expect(read('faqs.seed.json').records).toEqual([{ question: 'Why?', sourceHash: expect.any(String) }]);
    expect(read(SEED_INDEX_FILE).seeds).toEqual([{ key: 'faqs', seeded: false, count: 1 }]);
  });

  it('compiles seed keys named like PackConfig fields as seeds', async () => {
    write('seeds/name.json', JSON.stringify([{ entity: 'Item', label: 'a' }]));
    write('seeds/setup.json', JSON.stringify([{ entity: 'Item', label: 'b' }]));
    // Through abuddy.json, as abuddy build compiles it
    write('abuddy.json', JSON.stringify({ id: 'demo', name: 'Demo', version: '1.0.0', boot: { seed: {
      name: { path: 'seeds/name.json', format: 'json', entity: 'Item', identity: ['label'] },
      setup: { path: 'seeds/setup.json', format: 'json', entity: 'Item', identity: ['label'] },
    } } }));
    const result = await compilePack({ packDir: root, outputDir: out });
    expect(result.seeds).toEqual({ name: 1, setup: 1 });
    expect(read('name.seed.json').records[0].label).toBe('a');
    expect(read('setup.seed.json').records[0].label).toBe('b');
  });

  it('routes specialty keys to their SDK compilers', async () => {
    write('seeds/settings.json', JSON.stringify({ theme: 'dark' }));
    await compile({ settings: 'seeds/settings.json' });
    expect(read('settings.seed.json')).toEqual({ theme: 'dark' });
    expect(read(SEED_INDEX_FILE).seeds).toEqual([{ key: 'settings', seeded: true, count: 1 }]);
  });
});
