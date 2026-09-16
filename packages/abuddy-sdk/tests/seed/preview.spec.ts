import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { compilePack } from '../../src/build/seed-compiler.ts';
import { previewPackSeeds } from '../../src/seed/preview.ts';

let root: string | undefined;
afterEach(() => {
  if (root) fs.rmSync(root, { recursive: true, force: true });
  root = undefined;
  vi.restoreAllMocks();
});

describe('previewPackSeeds', () => {
  it("lists a compiled directory's seeded keys and items from its seeds.json, whatever the keys are", async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-preview-'));
    const write = (file: string, content: string) => {
      fs.mkdirSync(path.dirname(path.join(root!, file)), { recursive: true });
      fs.writeFileSync(path.join(root!, file), content);
    };
    write('glossary.json', JSON.stringify([{ term: 'Pack', description: 'A bundle' }, { term: 'Seed', children: [{ term: 'Hook' }] }]));
    write('faqs.json', JSON.stringify([{ question: 'Why?' }]));
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const out = path.join(root, 'dist');
    write('abuddy.json', JSON.stringify({
      id: 'demo', name: 'Demo', version: '1.0.0',
      seedFormats: { terms: { format: 'json', entity: 'Term', identity: ['term'] }, records: { format: 'json' } },
      boot: { seed: { glossary: { path: 'glossary.json', format: 'terms' }, faqs: { path: 'faqs.json', format: 'records' } } },
    }));
    await compilePack({ packDir: root, outputDir: out });

    expect(previewPackSeeds(out)).toEqual({
      directory: out,
      packId: 'demo',
      seeds: { glossary: [{ key: 'Pack', description: 'A bundle' }, { key: 'Seed', childCount: 1 }] },
    });
  });

  it('fails for a directory without seeds.json', () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-preview-'));
    expect(() => previewPackSeeds(root!)).toThrow(/has no seeds\.json/);
  });
});
