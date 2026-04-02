import * as fs from 'fs'
import * as path from 'path'
import type { ExportedNote, ExportedNotes } from '../defs/default-setup-defs'
import { toTitleCase } from './library-utils'

const ROOT = path.resolve(import.meta.dirname, '..')
const NOTES_DIR = path.join(ROOT, 'src', 'notes')
const COMPILED_DIR = path.join(ROOT, 'dist')
const OUTPUT_FILE = path.join(COMPILED_DIR, 'compiled-notes.json')

interface Frontmatter {
  type: 'document' | 'tasklist' | 'task'
  icon: string | null
  favorite: boolean
  hideCompletedChildren: boolean
  completed: boolean
}

const DEFAULTS: Frontmatter = {
  type: 'document',
  icon: null,
  favorite: false,
  hideCompletedChildren: false,
  completed: false,
}

function parseFrontmatter(content: string): { meta: Frontmatter; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n\n?/)
  if (!match) return { meta: { ...DEFAULTS }, body: content }

  const fm = match[1]
  const body = content.slice(match[0].length)

  const typeMatch = fm.match(/type:\s*(\w+)/)
  const iconMatch = fm.match(/icon:\s*"([^"]*)"/)
  const favoriteMatch = fm.match(/favorite:\s*true/)
  const hideMatch = fm.match(/hideCompletedChildren:\s*true/)
  const completedMatch = fm.match(/completed:\s*true/)

  return {
    meta: {
      type: (typeMatch?.[1] as Frontmatter['type']) ?? 'document',
      icon: iconMatch?.[1] ?? null,
      favorite: !!favoriteMatch,
      hideCompletedChildren: !!hideMatch,
      completed: !!completedMatch,
    },
    body,
  }
}

function walkDirectory(dir: string): ExportedNote[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
  const notes: ExportedNote[] = []

  for (const entry of entries) {
    if (entry.name === 'media') continue
    const fullPath = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      // Directory = parent note; check for index.md
      const indexPath = path.join(fullPath, 'index.md')
      let meta = { ...DEFAULTS }
      let body = ''

      if (fs.existsSync(indexPath)) {
        const parsed = parseFrontmatter(fs.readFileSync(indexPath, 'utf-8'))
        meta = parsed.meta
        body = parsed.body
      }

      notes.push({
        ...meta,
        title: toTitleCase(entry.name),
        content: body,
        children: walkDirectory(fullPath),
      })
    } else if (entry.name.endsWith('.md') && entry.name !== 'index.md') {
      const raw = fs.readFileSync(fullPath, 'utf-8')
      const { meta, body } = parseFrontmatter(raw)

      notes.push({
        ...meta,
        title: toTitleCase(entry.name.replace(/\.md$/, '')),
        content: body,
        children: [],
      })
    }
  }

  return notes
}

function countNotes(notes: ExportedNote[]): number {
  return notes.reduce((sum, note) => sum + 1 + countNotes(note.children), 0)
}

export function compileNotes(): void {
  console.log(`Compiling notes from: ${NOTES_DIR}`)

  if (!fs.existsSync(NOTES_DIR)) {
    console.error('Notes directory not found:', NOTES_DIR)
    process.exit(1)
  }

  const notes = walkDirectory(NOTES_DIR)

  // Copy media directory if it exists
  const mediaSrc = path.join(NOTES_DIR, 'media')
  if (fs.existsSync(mediaSrc)) {
    const mediaDest = path.join(COMPILED_DIR, 'media')
    fs.cpSync(mediaSrc, mediaDest, { recursive: true })
    console.log(`  Copied media/ to dist/media/`)
  }

  const output: ExportedNotes = { version: 1, notes }

  fs.mkdirSync(path.dirname(OUTPUT_FILE), { recursive: true })
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2) + '\n')

  const noteCount = countNotes(notes)
  console.log(`\nWrote ${noteCount} note(s) to ${path.relative(process.cwd(), OUTPUT_FILE)}`)
}
