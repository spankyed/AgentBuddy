import * as fs from 'fs'
import * as path from 'path'
import type { ExportedItem, ExportedLibrary } from '../defs/default-setup-defs'
import { toDisplayName, countDocs, parseMarkdownSections, parseFrontmatter } from './library-utils'

const ROOT = path.resolve(import.meta.dirname, '..')
const LIBRARY_DIR = path.join(ROOT, 'src', 'library')
const COMPILED_DIR = path.join(ROOT, 'dist')
const OUTPUT_FILE = path.join(COMPILED_DIR, 'compiled-library.json')

function walkDirectory(dir: string): ExportedItem[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
  const items: ExportedItem[] = []

  for (const entry of entries) {
    if (entry.name === 'media' || entry.name === '_meta.md') continue

    const fullPath = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      let name = toDisplayName(entry.name)
      let description: string | undefined
      const metaPath = path.join(fullPath, '_meta.md')
      if (fs.existsSync(metaPath)) {
        const meta = parseFrontmatter(fs.readFileSync(metaPath, 'utf-8'))
        if (meta.name) name = meta.name
        description = meta.description
      }
      items.push({
        type: 'collection',
        name,
        ...(description && { description }),
        children: walkDirectory(fullPath),
      })
    } else if (entry.name.endsWith('.md')) {
      const text = fs.readFileSync(fullPath, 'utf-8')
      const { tags, name: fmName, body } = parseFrontmatter(text)
      const name = fmName || toDisplayName(entry.name.replace(/\.md$/, ''))
      items.push({
        type: 'document',
        name,
        content: parseMarkdownSections(body || text),
        tags: tags.length ? tags : ['default'],
      })
    }
  }

  return items
}

export function compileLibrary(): void {
  console.log(`Compiling library docs from: ${LIBRARY_DIR}`)

  if (!fs.existsSync(LIBRARY_DIR)) {
    console.log(`Library directory not found: ${LIBRARY_DIR}`)
    console.log(`\nWrote 0 library doc(s) to ${path.relative(process.cwd(), OUTPUT_FILE)}\n`)
    fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true })
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify([], null, 2))
    return
  }

  const items = walkDirectory(LIBRARY_DIR)

  // Copy media directory if it exists
  const mediaSrc = path.join(LIBRARY_DIR, 'media')
  if (fs.existsSync(mediaSrc)) {
    const mediaDest = path.join(COMPILED_DIR, 'media')
    fs.cpSync(mediaSrc, mediaDest, { recursive: true })
    console.log(`  Copied media/ to dist/media/`)
  }

  const output: ExportedLibrary = { version: 1, items }

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true })
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2) + '\n')

  const docCount = countDocs(items)
  console.log(`\nWrote ${docCount} library doc(s) to ${path.relative(process.cwd(), OUTPUT_FILE)}`)
}
