import * as fs from 'fs';
import * as path from 'path';
import type { CompiledFAQ } from './dsl-types';

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n\n?/;
const HEADING_RE = /^#\s+(.+?)(?:\n|$)/;

function parseFaq(filename: string, raw: string): CompiledFAQ | null {
  const fmMatch = raw.match(FRONTMATTER_RE);
  const fm = fmMatch?.[1] ?? '';
  const body = fmMatch ? raw.slice(fmMatch[0].length) : raw;

  const headingMatch = body.match(HEADING_RE);
  if (!headingMatch) return null;

  const orderMatch = fm.match(/order:\s*(\d+)/);
  return {
    id: filename.replace(/\.md$/, ''),
    question: headingMatch[1].trim(),
    answer: body.slice(headingMatch[0].length).trim(),
    category: fm.match(/^category:\s*(.+?)\s*$/m)?.[1],
    order: orderMatch ? Number(orderMatch[1]) : undefined,
  };
}

export function compileFaqFromDir(faqsDir: string): CompiledFAQ[] {
  if (!fs.existsSync(faqsDir)) return [];

  const files = fs.readdirSync(faqsDir).filter(n => n.endsWith('.md')).sort();
  const faqs: CompiledFAQ[] = [];

  for (const filename of files) {
    const raw = fs.readFileSync(path.join(faqsDir, filename), 'utf-8');
    const faq = parseFaq(filename, raw);
    if (faq) faqs.push(faq);
  }

  faqs.sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));
  return faqs;
}
