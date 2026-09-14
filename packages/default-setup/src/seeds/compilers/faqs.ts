// Compiles src/seeds/faqs (the `faqs` seed entry in abuddy.json) for the Help tab: each file's first
// `# heading` is the question and the rest the answer, ordered by frontmatter `order`. Compiled, not
// seeded: loadFaqs reads faqs.seed.json.
import { compileMarkdownTree, type SeedCompileContext, type SeedRecord } from '@abuddy/sdk/build';
import type { CompiledFAQ } from '../../features/settings/be/faqs';

const HEADING_RE = /^#\s+(.+?)(?:\n|$)/;

export default function compileFaqs({ path }: SeedCompileContext): SeedRecord[] {
  const faqs: CompiledFAQ[] = [];
  for (const item of compileMarkdownTree(path, { recursive: false })) {
    const heading = item.body.match(HEADING_RE);
    if (!heading) continue;
    const { category, order } = item.frontmatter;
    faqs.push({
      id: item.filename,
      question: heading[1].trim(),
      answer: item.body.slice(heading[0].length).trim(),
      ...(category !== undefined && category !== null && { category: String(category) }),
      ...(typeof order === 'number' && { order }),
    });
  }
  faqs.sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity));
  return faqs.map((faq) => ({ ...faq }));
}
