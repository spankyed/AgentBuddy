import * as fs from 'fs'
import * as path from 'path'

const ROOT = path.resolve(import.meta.dirname, '..')
const FAQS_DIR = path.join(ROOT, 'src', 'faqs')
const OUTPUT_FILE = path.join(ROOT, 'dist', 'compiled-faq.json')

// Keep in sync with FAQItem in packages/api/src/systems/settings/types.ts
interface CompiledFAQ {
  id: string
  question: string
  answer: string
  category?: string
  order?: number
}

const FRONTMATTER_RE = /^---\n([\s\S]*?)\n---\n\n?/
const HEADING_RE = /^#\s+(.+?)(?:\n|$)/

function parseFaq(filename: string, raw: string): CompiledFAQ | null {
  const fmMatch = raw.match(FRONTMATTER_RE)
  const fm = fmMatch?.[1] ?? ''
  const body = fmMatch ? raw.slice(fmMatch[0].length) : raw

  const headingMatch = body.match(HEADING_RE)
  if (!headingMatch) return null

  const orderMatch = fm.match(/order:\s*(\d+)/)
  return {
    id: filename.replace(/\.md$/, ''),
    question: headingMatch[1].trim(),
    answer: body.slice(headingMatch[0].length).trim(),
    category: fm.match(/^category:\s*(.+?)\s*$/m)?.[1],
    order: orderMatch ? Number(orderMatch[1]) : undefined,
  }
}

export function compileFaq(): void {
  console.log(`Compiling faqs from: ${FAQS_DIR}`)

  const faqs: CompiledFAQ[] = []
  if (fs.existsSync(FAQS_DIR)) {
    const files = fs.readdirSync(FAQS_DIR)
      .filter(n => n.endsWith('.md'))
      .sort()

    for (const filename of files) {
      const raw = fs.readFileSync(path.join(FAQS_DIR, filename), 'utf-8')
      const faq = parseFaq(filename, raw)
      if (faq) faqs.push(faq)
      else console.warn(`  ! ${filename}: no '# ' heading found, skipping`)
    }
    faqs.sort((a, b) => (a.order ?? Infinity) - (b.order ?? Infinity))
  }

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true })
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(faqs, null, 2) + '\n')
  console.log(`Wrote ${faqs.length} faq(s) to ${path.relative(process.cwd(), OUTPUT_FILE)}`)
}
