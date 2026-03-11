import * as fs from 'fs'
import * as path from 'path'
import type { ExportedItem, ExportedLibrary } from '@/systems/library/export-types'

const LIBRARY_DIR = path.join(import.meta.dirname, 'library')
const COMPILED_DIR = path.join(import.meta.dirname, 'compiled')
const OUTPUT_FILE = path.join(COMPILED_DIR, 'compiled-library.json')

function toTitleCase(str: string): string {
  return str
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

function walkDirectory(dir: string): ExportedItem[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
  const items: ExportedItem[] = []

  for (const entry of entries) {
    if (entry.name === 'media') continue

    const fullPath = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      items.push({
        type: 'collection',
        name: toTitleCase(entry.name),
        children: walkDirectory(fullPath),
      })
    } else if (entry.name.endsWith('.md')) {
      const name = toTitleCase(entry.name.replace(/\.md$/, ''))
      const text = fs.readFileSync(fullPath, 'utf-8')
      items.push({
        type: 'document',
        name,
        content: [{ type: 'markdown', text }],
        tags: ['scratchpad'],
      })
    }
  }

  return items
}

export function compileLibrary(): void {
  console.log(`Compiling library docs from: ${LIBRARY_DIR}`)

  if (!fs.existsSync(LIBRARY_DIR)) {
    console.error('Library directory not found:', LIBRARY_DIR)
    process.exit(1)
  }

  const items = walkDirectory(LIBRARY_DIR)

  // Copy media directory if it exists
  const mediaSrc = path.join(LIBRARY_DIR, 'media')
  if (fs.existsSync(mediaSrc)) {
    const mediaDest = path.join(COMPILED_DIR, 'media')
    fs.cpSync(mediaSrc, mediaDest, { recursive: true })
    console.log(`  Copied media/ to compiled/media/`)
  }

  const output: ExportedLibrary = { version: 1, items }

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true })
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2) + '\n')

  const docCount = countDocs(items)
  console.log(`\nWrote ${docCount} library doc(s) to ${path.relative(process.cwd(), OUTPUT_FILE)}`)
}

function countDocs(items: ExportedItem[]): number {
  return items.reduce((sum, item) => {
    if (item.type === 'collection') return sum + countDocs(item.children)
    return sum + 1
  }, 0)
}

// Run directly
compileLibrary()
