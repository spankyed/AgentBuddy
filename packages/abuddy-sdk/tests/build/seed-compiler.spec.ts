import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { compilePack, SEED_INDEX_FILE } from '../../src/build/seed-compiler.ts';
import type { CompilePackOptions } from '../../src/build/types.ts';
import type { PackManifest } from '../../src/build/manifest.ts';
import { buildPackConfigFromManifest } from '../../src/build/manifest-bridge.ts';
import type { SeedDependency } from '../../src/build/seeds/resolve.ts';

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

/** Compiles a pack whose abuddy.json has these seedFormats and boot.seed, as abuddy build does */
async function compile(
  seedFormats: Record<string, unknown>,
  seed: Record<string, unknown>,
  options: { dependencies?: ReadonlyMap<string, SeedDependency>; importModule?: CompilePackOptions['importModule']; manifest?: Record<string, unknown> } = {},
) {
  const manifest = { id: 'demo', name: 'Demo', version: '1.0.0', seedFormats, boot: { seed }, ...options.manifest } as unknown as PackManifest;
  return compilePack({
    packDir: root,
    outputDir: out,
    importModule: options.importModule,
    packConfig: await buildPackConfigFromManifest(manifest, root, { dependencies: options.dependencies }),
  });
}

const memosFormat = {
  format: 'markdown-tree', entity: 'Memo', identity: ['title', 'parent'], tree: { branch: 'index.md' }, media: 'media',
  fields: { title: { from: 'frontmatter.title', default: 'filename', type: 'string' }, pinned: { from: 'frontmatter.pinned', default: false }, body: { from: 'body' } },
};

describe('compilePack', () => {
  it("compiles an entry with its format's settings, copies media and indexes it", async () => {
    write('seeds/memos/first.md', '---\ntitle: 2024\npinned: true\n---\nHello ![pic](media/pic.png)\n');
    write('seeds/memos/group/index.md', '---\ntitle: Group\n---\nGroup body\n');
    write('seeds/memos/group/child-memo.md', 'Child body\n');
    write('seeds/memos/media/pic.png', 'PNG');
    const result = await compile({ memos: memosFormat }, { memos: { path: 'seeds/memos', format: 'memos' } });

    const { records } = read('memos.seed.json');
    expect(records.map((r: { title: string }) => r.title)).toEqual(['2024', 'Group']);
    expect(records[0]).toMatchObject({ entity: 'Memo', title: '2024', pinned: true, body: 'Hello ![pic](media/pic.png)\n', sourceHash: expect.stringMatching(/^[0-9a-f]{16}$/) });
    expect(records[1].children).toEqual([expect.objectContaining({ entity: 'Memo', title: 'child memo', pinned: false })]);
    expect(fs.readFileSync(path.join(out, 'media/memos/pic.png'), 'utf-8')).toBe('PNG');
    expect(read(SEED_INDEX_FILE)).toEqual({ version: 1, packId: 'demo', seeds: [{ key: 'memos', seeded: true, identity: ['title', 'parent'], count: 3, items: [{ key: '2024' }, { key: 'Group', childCount: 1 }] }] });
    expect(result.seeds).toEqual({ memos: 3 });
  });

  it("replaces its earlier output: a dropped key or media doesn't linger, other files in the dir stay", async () => {
    write('seeds/memos/first.md', 'Hello\n');
    write('seeds/memos/media/pic.png', 'PNG');
    await compile({ memos: memosFormat }, { memos: { path: 'seeds/memos', format: 'memos' } });
    fs.mkdirSync(path.join(out, 'runtime'));
    fs.writeFileSync(path.join(out, 'runtime/index.cjs'), '');
    fs.writeFileSync(path.join(out, 'notes.json'), '{}');

    fs.rmSync(path.join(root, 'seeds/memos/media'), { recursive: true });
    await compile({ memos: memosFormat }, { notes: { path: 'seeds/memos', format: 'memos' } });
    expect(fs.readdirSync(out).sort()).toEqual(['notes.json', 'notes.seed.json', 'runtime', SEED_INDEX_FILE]);

    // A failed compile leaves no seeds from the previous one
    write('seeds/items.json', JSON.stringify([{ entity: 'Other', name: 'x' }]));
    await expect(compile({ items: { format: 'json', entity: 'Item' } }, { items: { path: 'seeds/items.json', format: 'items' } })).rejects.toThrow(/isn't one of Item/);
    expect(fs.readdirSync(out).sort()).toEqual(['notes.json', 'runtime']);
  });

  it("compiles with the pack's own compiler module, which may leave sourceHash to the default", async () => {
    write('seeds/tags.txt', 'red\nblue\n');
    write('compile-tags.mjs', `import * as fs from 'node:fs';
export default ({ path, key }) => fs.readFileSync(path, 'utf-8').trim().split('\\n').map((name) => ({ entity: 'Tag', name, key }));`);
    const importModule = vi.fn((file: string) => import(file));
    await compile({ tags: { compiler: 'compile-tags.mjs', entity: 'Tag', identity: ['name'] } }, { tags: { path: 'seeds/tags.txt', format: 'tags' } }, { importModule });
    expect(importModule).toHaveBeenCalledWith(path.join(root, 'compile-tags.mjs'));
    expect(read('tags.seed.json').records).toEqual([
      { entity: 'Tag', name: 'red', key: 'tags', sourceHash: expect.stringMatching(/^[0-9a-f]{16}$/) },
      { entity: 'Tag', name: 'blue', key: 'tags', sourceHash: expect.stringMatching(/^[0-9a-f]{16}$/) },
    ]);
  });

  it("compiles this pack's sources with a dependency's format and its bundled compiler export", async () => {
    write('seeds/team/plan.md', '---\ntitle: Plan\n---\nShip\n');
    write('seeds/team.txt', 'red\n');
    write('deps/base-pack/build/seed-compilers.mjs', `import * as fs from 'node:fs';
export const tags = ({ path }) => fs.readFileSync(path, 'utf-8').trim().split('\\n').map((name) => ({ entity: 'Tag', name }));`);
    const base = { id: 'base-pack', name: 'Base', version: '1.0.0', seedFormats: { memos: memosFormat, tags: { compiler: 'src/seeds/compilers/tags.ts', entity: 'Tag', identity: ['name'] } } } as unknown as PackManifest;
    const dependencies = new Map([['base-pack', { manifest: base, buildDir: path.join(root, 'deps/base-pack/build') }]]);
    const importModule = vi.fn((file: string) => import(file));
    await compile({}, {
      team: { path: 'seeds/team', format: 'base-pack:memos' },
      colors: { path: 'seeds/team.txt', format: 'base-pack:tags' },
    }, { dependencies, importModule, manifest: { dependencies: { 'base-pack': '*' } } });

    expect(read('team.seed.json').records).toEqual([expect.objectContaining({ entity: 'Memo', title: 'Plan', body: 'Ship\n' })]);
    expect(importModule).toHaveBeenCalledWith(path.join(root, 'deps/base-pack/build/seed-compilers.mjs'));
    expect(read('colors.seed.json').records).toEqual([{ entity: 'Tag', name: 'red', sourceHash: expect.any(String) }]);
  });

  it("fails clearly when a dependency's compiler export or build dir is missing", async () => {
    write('seeds/team.txt', 'red\n');
    write('deps/base-pack/build/seed-compilers.mjs', 'export const other = () => [];');
    const base = { id: 'base-pack', name: 'Base', version: '1.0.0', seedFormats: { tags: { compiler: 'src/tags.ts', entity: 'Tag' } } } as unknown as PackManifest;
    const seed = { colors: { path: 'seeds/team.txt', format: 'base-pack:tags' } };
    const manifest = { dependencies: { 'base-pack': '*' } };
    await expect(compile({}, seed, { manifest, dependencies: new Map([['base-pack', { manifest: base, buildDir: path.join(root, 'deps/base-pack/build') }]]) }))
      .rejects.toThrow(/format "base-pack:tags" has no compiler export "tags"/);
    await expect(compile({}, seed, { manifest, dependencies: new Map([['base-pack', { manifest: base }]]) }))
      .rejects.toThrow(/format "base-pack:tags" compiles with a module, but its pack's build dir wasn't resolved/);
  });

  it("fails when a compiled record's entity isn't one the format declares", async () => {
    write('seeds/items.json', JSON.stringify([{ entity: 'Other', name: 'x' }]));
    await expect(compile({ items: { format: 'json', entity: 'Item' } }, { items: { path: 'seeds/items.json', format: 'items' } }))
      .rejects.toThrow(/Seed "items" records\[0\]: entity "Other" isn't one of Item/);
  });

  it('writes an entry whose format has no entity as unseeded', async () => {
    write('seeds/faqs.json', JSON.stringify([{ question: 'Why?' }]));
    await compile({ faqs: { format: 'json' } }, { faqs: { path: 'seeds/faqs.json', format: 'faqs' } });
    expect(read('faqs.seed.json').records).toEqual([{ question: 'Why?', sourceHash: expect.any(String) }]);
    expect(read(SEED_INDEX_FILE).seeds).toEqual([{ key: 'faqs', seeded: false, count: 1, items: [] }]);
  });

  it('compiles seed keys named like PackConfig fields as seeds', async () => {
    write('seeds/name.json', JSON.stringify([{ entity: 'Item', label: 'a' }]));
    write('seeds/setup.json', JSON.stringify([{ entity: 'Item', label: 'b' }]));
    // Through abuddy.json alone, as compilePack reads it without a packConfig
    write('abuddy.json', JSON.stringify({ id: 'demo', name: 'Demo', version: '1.0.0', seedFormats: { items: { format: 'json', entity: 'Item', identity: ['label'] } }, boot: { seed: {
      name: { path: 'seeds/name.json', format: 'items' },
      setup: { path: 'seeds/setup.json', format: 'items' },
    } } }));
    const result = await compilePack({ packDir: root, outputDir: out });
    expect(result.seeds).toEqual({ name: 1, setup: 1 });
    expect(read('name.seed.json').records[0].label).toBe('a');
    expect(read('setup.seed.json').records[0].label).toBe('b');
  });

  it('routes specialty keys to their SDK compilers', async () => {
    write('seeds/settings.json', JSON.stringify({ theme: 'dark' }));
    await compile({}, { settings: 'seeds/settings.json' });
    expect(read('settings.seed.json')).toEqual({ theme: 'dark' });
    expect(read(SEED_INDEX_FILE).seeds).toEqual([{ key: 'settings', seeded: true, count: 1, items: [{ key: 'default-settings', description: 'Application defaults' }] }]);
  });
});
