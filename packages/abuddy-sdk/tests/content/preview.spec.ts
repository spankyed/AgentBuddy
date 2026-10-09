import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { compilePack } from '../../src/build/content-compiler.ts';
import { previewPackContent } from '../../src/content/preview.ts';
import type { ContentApplier } from '../../src/utils/apply.ts';
import { startTestRuntime, testPacks } from '../../src/testing/index.ts';

// The registered packs' appliers: the stand-in's, which the specs fill
startTestRuntime();

const noopApplier = (key: string): ContentApplier => ({ key, apply: () => ({ created: 0, updated: 0, skipped: 0 }) });

let root: string | undefined;
afterEach(() => {
  if (root) fs.rmSync(root, { recursive: true, force: true });
  root = undefined;
  testPacks.appliers.delete('demo');
  vi.restoreAllMocks();
});

async function compileDemo(): Promise<string> {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'content-preview-'));
  const write = (file: string, content: string) => {
    fs.mkdirSync(path.dirname(path.join(root!, file)), { recursive: true });
    fs.writeFileSync(path.join(root!, file), content);
  };
  write('glossary.json', JSON.stringify([{ term: 'Pack', description: 'A bundle' }, { term: 'Content', children: [{ term: 'Hook' }] }]));
  write('faqs.json', JSON.stringify([{ question: 'Why?' }]));
  vi.spyOn(console, 'log').mockImplementation(() => {});
  const out = path.join(root, 'dist');
  write('notes.json', JSON.stringify([{ term: 'Note' }]));
  write('abuddy.json', JSON.stringify({
    id: 'demo', name: 'Demo', version: '1.0.0',
    content: {
      formats: { terms: { format: 'json', entity: 'Term', identity: ['term'] }, records: { format: 'json' } },
      sources: {
        glossary: { path: 'glossary.json', format: 'terms' },
        notes: { path: 'notes.json', format: 'terms' },
      },
      artifacts: { faqs: { path: 'faqs.json', format: 'records' } },
    },
  }));
  await compilePack({ packDir: root, outputDir: out });
  return out;
}

describe('previewPackContent', () => {
  it("lists the written keys the compiling pack's appliers import, and their items, whatever the keys are", async () => {
    const out = await compileDemo();
    testPacks.appliers.set('demo', [noopApplier('glossary')]);

    expect(previewPackContent(out)).toEqual({
      directory: out,
      packId: 'demo',
      content: { glossary: [{ key: 'Pack', description: 'A bundle' }, { key: 'Content', childCount: 1 }] },
      unavailable: ['notes'],
    });
  });

  it("fails when the compiling pack registered no appliers (it isn't installed)", async () => {
    const out = await compileDemo();
    testPacks.appliers.set('other', [noopApplier('glossary')]);
    try {
      expect(() => previewPackContent(out)).toThrow(/Pack "demo" isn't installed/);
    } finally {
      testPacks.appliers.delete('other');
    }
  });

  it('fails for a directory without content.json', () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'content-preview-'));
    expect(() => previewPackContent(root!)).toThrow(/has no content\.json/);
  });
});
