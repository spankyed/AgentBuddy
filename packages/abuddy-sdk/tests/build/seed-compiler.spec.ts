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

  it('gives empty frontmatter values the default', async () => {
    write('seeds/memos/blank.md', '---\ntitle:\npinned:\n---\nBlank\n');
    write('seeds/memos/empty-string.md', '---\ntitle: ""\n---\nEmpty\n');
    await compile({ memos: memosFormat }, { memos: { path: 'seeds/memos', format: 'memos' } });
    const { records } = read('memos.seed.json');
    expect(records.map((r: { title: string; pinned: boolean }) => [r.title, r.pinned])).toEqual([['blank', false], ['empty string', false]]);
  });

  it("skips only the format's media directory: a notes folder named media is seeded", async () => {
    write('seeds/memos/media/index.md', '---\ntitle: Media notes\n---\n');
    write('seeds/memos/media/clip.md', 'Clip\n');
    write('seeds/memos/assets/pic.png', 'PNG');
    write('seeds/memos/assets/stray.md', 'Not a memo\n');
    await compile({ memos: { ...memosFormat, media: 'assets' } }, { memos: { path: 'seeds/memos', format: 'memos' } });
    const { records } = read('memos.seed.json');
    expect(records.map((r: { title: string; children?: Array<{ title: string }> }) => [r.title, r.children?.map((c) => c.title)]))
      .toEqual([['Media notes', ['clip']]]);
    expect(fs.readdirSync(path.join(out, 'media/memos'))).toEqual(['pic.png', 'stray.md']);

    // Without a media directory, nothing is skipped
    await compile({ memos: { ...memosFormat, media: undefined } }, { memos: { path: 'seeds/memos', format: 'memos' } });
    expect(read('memos.seed.json').records.map((r: { title: string }) => r.title)).toEqual(['assets', 'Media notes']);
  });

  it('reads frontmatter with CRLF line endings or a byte order mark', async () => {
    write('seeds/memos/crlf.md', '---\r\ntitle: Windows\r\npinned: true\r\n---\r\nBody\r\n');
    write('seeds/memos/bom.md', '\uFEFF---\ntitle: Marked\n---\nBody\n');
    await compile({ memos: memosFormat }, { memos: { path: 'seeds/memos', format: 'memos' } });
    expect(read('memos.seed.json').records.map((r: { title: string; pinned: boolean; body: string }) => [r.title, r.pinned, r.body]))
      .toEqual([['Marked', false, 'Body\n'], ['Windows', true, 'Body\r\n']]);
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
    // Built before it bundled its seed compilers (or the bundle failed)
    await expect(compile({}, seed, { manifest, dependencies: new Map([['base-pack', { manifest: base, buildDir: path.join(root, 'deps/unbuilt/build') }]]) }))
      .rejects.toThrow(/format "base-pack:tags" compiles with base-pack's seed compilers, but .*deps\/unbuilt\/build\/seed-compilers\.mjs doesn't exist: build base-pack first/);
  });

  it("fails, naming the record, when a compiler module's output isn't an array of records", async () => {
    write('seeds/tags.txt', 'red\n');
    const tags = (body: string) => {
      write('compile-tags.mjs', `export default () => (${body});`);
      return compile({ tags: { compiler: 'compile-tags.mjs', entity: 'Tag' } }, { tags: { path: 'seeds/tags.txt', format: 'tags' } }, {
        // A fresh module each time: the import cache would return the first
        importModule: (file: string) => import(`${file}?v=${Math.random()}`),
      });
    };
    await expect(tags(`{ records: [] }`)).rejects.toThrow(/tags: compiler "tags" \(.*compile-tags\.mjs\) returned bad records: output is object, not an array of records/);
    await expect(tags(`[{ entity: 'Tag', name: 'a' }, 'b', null]`)).rejects.toThrow(/output\[1\] is string, not a record object[\s\S]*output\[2\] is null, not a record object/);
    await expect(tags(`[{ entity: 1, sourceHash: 2, children: [{ entity: 'Tag' }, 3] }]`))
      .rejects.toThrow(/output\[0\]\.entity isn't a string[\s\S]*output\[0\]\.sourceHash isn't a string[\s\S]*output\[0\]\.children\[1\] is number, not a record object/);
    await expect(tags(`[{ entity: 'Tag', name: 'a', children: [] }]`)).resolves.toBeDefined();
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
    write('seeds/prompts/greet.ts', `export const meta = { label: 'Greet', description: 'Says hello' };\nexport function template() { return 'Hello'; }\n`);
    await compile({}, { prompts: 'seeds/prompts' });
    expect(read('prompts.seed.json').records).toEqual([expect.objectContaining({ label: 'Greet' })]);
    expect(read(SEED_INDEX_FILE).seeds).toEqual([{ key: 'prompts', seeded: true, identity: ['label'], count: 1, items: [{ key: 'Greet', description: 'Says hello' }] }]);
  });

  it("indexes an entry whose format seeds no entity as seeded when the pack's seeder seeds it", async () => {
    write('seeds/theme.json', JSON.stringify([{ name: 'defaults', description: 'Theme defaults', theme: 'dark' }]));
    const seedFormats = { theme: { format: 'json' } };
    await compile(seedFormats, { theme: { path: 'seeds/theme.json', format: 'theme', seeder: 'src/seeds/theme.ts' } });
    expect(read('theme.seed.json').records).toEqual([expect.objectContaining({ name: 'defaults', theme: 'dark' })]);
    expect(read(SEED_INDEX_FILE).seeds).toEqual([{ key: 'theme', seeded: true, count: 1, items: [{ key: 'defaults', description: 'Theme defaults' }] }]);

    // Without the seeder, the same entry is compiled for pack code to read, and not seeded
    await compile(seedFormats, { theme: { path: 'seeds/theme.json', format: 'theme' } });
    expect(read(SEED_INDEX_FILE).seeds).toEqual([{ key: 'theme', seeded: false, count: 1, items: [] }]);
  });
});
