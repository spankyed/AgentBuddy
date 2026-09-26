// The faqs seed format's compiler (src/seeds/_compilers/faqs.ts): markdown files into Help tab FAQs.
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { SeedCompileContext } from '@abuddy/sdk/build';
import compileFaqs from '../../src/seeds/_compilers/faqs';

const PACK_DIR = path.resolve(import.meta.dirname, '../..');

const dirs: string[] = [];
afterEach(() => {
  for (const dir of dirs.splice(0)) fs.rmSync(dir, { recursive: true, force: true });
});

function faqsDir(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'faqs-compiler-'));
  dirs.push(dir);
  for (const [name, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
    fs.writeFileSync(path.join(dir, name), text);
  }
  return dir;
}

function compile(dir: string) {
  return compileFaqs({ key: 'faqs', path: dir, packDir: PACK_DIR, format: {} } as unknown as SeedCompileContext);
}

describe('faqs compiler', () => {
  it("takes the first heading as the question and the rest as the answer, with frontmatter's category and order", () => {
    const dir = faqsDir({
      'enable-tts.md': '---\ncategory: settings\norder: 2\n---\n# How do I enable TTS?\n\nAllow accessibility.\n\n## More\nDetails\n',
    });
    expect(compile(dir)).toEqual([
      { id: 'enable-tts', question: 'How do I enable TTS?', answer: 'Allow accessibility.\n\n## More\nDetails', category: 'settings', order: 2 },
    ]);
  });

  it('orders by order, leaving unordered FAQs last in file name order', () => {
    const dir = faqsDir({
      'a-unordered.md': '# A?\nA',
      'b-second.md': '---\norder: 2\n---\n# B?\nB',
      'c-unordered.md': '# C?\nC',
      'd-first.md': '---\norder: 1\n---\n# D?\nD',
    });
    expect(compile(dir).map((faq) => faq.id)).toEqual(['d-first', 'b-second', 'a-unordered', 'c-unordered']);
  });

  it('leaves out category and order when frontmatter has none, and stringifies a non-string category', () => {
    const dir = faqsDir({
      'plain.md': '# Plain?\nAnswer',
      'numbered.md': '---\ncategory: 2024\norder: soon\n---\n# Numbered?\nAnswer',
      'empty.md': '---\ncategory:\n---\n# Empty?\nAnswer',
    });
    const byId = Object.fromEntries(compile(dir).map((faq) => [faq.id, faq]));
    expect(byId.plain).toEqual({ id: 'plain', question: 'Plain?', answer: 'Answer' });
    expect(byId.numbered).toEqual({ id: 'numbered', question: 'Numbered?', answer: 'Answer', category: '2024' });
    expect(byId.empty).toEqual({ id: 'empty', question: 'Empty?', answer: 'Answer' });
  });

  it('skips files without a leading heading, non-markdown files and subdirectories', () => {
    const dir = faqsDir({
      'no-heading.md': 'Just text\n# Late heading?\n',
      'notes.txt': '# Not markdown?\n',
      'nested/deep.md': '# Nested?\nAnswer',
      'kept.md': '# Kept?\nAnswer',
    });
    expect(compile(dir).map((faq) => faq.id)).toEqual(['kept']);
  });

  it('reads a missing directory as no FAQs', () => {
    expect(compile(path.join(os.tmpdir(), 'faqs-compiler-missing'))).toEqual([]);
  });

  it('fails on malformed frontmatter, naming the file', () => {
    const dir = faqsDir({ 'broken.md': '---\ncategory: [unclosed\n---\n# Broken?\n' });
    expect(() => compile(dir)).toThrow(/broken\.md: invalid frontmatter/);
  });

  it('fails on frontmatter that is not a mapping', () => {
    const dir = faqsDir({ 'list.md': '---\n- a\n- b\n---\n# List?\n' });
    expect(() => compile(dir)).toThrow(/list\.md: frontmatter must be a YAML mapping/);
  });

  it("compiles every one of default-setup's own FAQs", () => {
    const source = path.join(PACK_DIR, 'src/seeds/faqs');
    const files = fs.readdirSync(source).filter((name) => name.endsWith('.md'));
    const faqs = compile(source);
    expect(faqs.map((faq) => faq.id).sort()).toEqual(files.map((name) => name.replace(/\.md$/, '')).sort());
    for (const faq of faqs) {
      expect(faq.question).not.toBe('');
      expect(faq.answer).not.toBe('');
    }
  });
});
