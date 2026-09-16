import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { compilePack } from '../../src/build/seed-compiler.ts';
import { previewPackSeeds } from '../../src/seed/preview.ts';
import { registerSeeders, unregisterSeeders, type Seeder } from '../../src/utils/seed.ts';

const noopSeeder = (key: string): Seeder => ({ key, seed: () => ({ created: 0, updated: 0, skipped: 0 }) });

let root: string | undefined;
afterEach(() => {
  if (root) fs.rmSync(root, { recursive: true, force: true });
  root = undefined;
  unregisterSeeders('demo');
  vi.restoreAllMocks();
});

async function compileDemo(): Promise<string> {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-preview-'));
  const write = (file: string, content: string) => {
    fs.mkdirSync(path.dirname(path.join(root!, file)), { recursive: true });
    fs.writeFileSync(path.join(root!, file), content);
  };
  write('glossary.json', JSON.stringify([{ term: 'Pack', description: 'A bundle' }, { term: 'Seed', children: [{ term: 'Hook' }] }]));
  write('faqs.json', JSON.stringify([{ question: 'Why?' }]));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  const out = path.join(root, 'dist');
  write('notes.json', JSON.stringify([{ term: 'Note' }]));
  write('abuddy.json', JSON.stringify({
    id: 'demo', name: 'Demo', version: '1.0.0',
    seedFormats: { terms: { format: 'json', entity: 'Term', identity: ['term'] }, records: { format: 'json' } },
    boot: { seed: {
      glossary: { path: 'glossary.json', format: 'terms' },
      notes: { path: 'notes.json', format: 'terms' },
      faqs: { path: 'faqs.json', format: 'records' },
    } },
  }));
  await compilePack({ packDir: root, outputDir: out });
  return out;
}

describe('previewPackSeeds', () => {
  it("lists the seeded keys the compiling pack's seeders import, and their items, whatever the keys are", async () => {
    const out = await compileDemo();
    registerSeeders('demo', [noopSeeder('glossary')]);

    expect(previewPackSeeds(out)).toEqual({
      directory: out,
      packId: 'demo',
      seeds: { glossary: [{ key: 'Pack', description: 'A bundle' }, { key: 'Seed', childCount: 1 }] },
      unavailable: ['notes'],
    });
  });

  it("fails when the compiling pack registered no seeders (it isn't installed)", async () => {
    const out = await compileDemo();
    registerSeeders('other', [noopSeeder('glossary')]);
    try {
      expect(() => previewPackSeeds(out)).toThrow(/Pack "demo" isn't installed/);
    } finally {
      unregisterSeeders('other');
    }
  });

  it('fails for a directory without seeds.json', () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-preview-'));
    expect(() => previewPackSeeds(root!)).toThrow(/has no seeds\.json/);
  });
});
