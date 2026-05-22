import * as fs from 'node:fs'
import * as path from 'node:path'
import { repository } from '@/repository'
import { EARS } from '@/core/types'
import { hasIdCollision, findWhere } from '@/core/helpers/repository'
import { qx } from '@/core/ears/helpers/query'
import { restoreJsonMediaRefs, restoreMarkdownMediaRefs } from '@/core/helpers/media'
import { toDisplayName } from '@/core/helpers/display-name'
import type { ExportedNote, ExportedNotes } from './export-types'
import type { NoteEntity } from './types'

interface ImportResult {
  created: number
  updated: number
  skipped: number
  mediaRestored: number
  errors: string[]
}

/**
 * Find an existing note by title within a given parent (or at root level).
 */
function findExistingNote(title: string, parentId: string | undefined): NoteEntity | undefined {
  const candidates = findWhere<NoteEntity>(EARS.Entity.Note, 'title', title)
  return candidates.find(note => {
    const parents = qx(note.id).linksTo(EARS.RelKind.CONTAINS, EARS.Entity.Note, false).ids()
    const noteParentId = parents.length > 0 ? parents[0] : undefined
    return noteParentId === parentId
  })
}

function applyNoteUpdates(
  noteId: string,
  opts: { favorite?: boolean; hideCompletedChildren?: boolean; content?: string },
): void {
  const updates: Record<string, any> = {}
  if (opts.favorite) updates.favorite = true
  if (opts.hideCompletedChildren) updates.hideCompletedChildren = true
  if (opts.content !== undefined) updates.content = opts.content
  if (Object.keys(updates).length > 0) {
    repository.noteCommands.update(noteId as EARS.EntityId, updates)
  }
}

export function importNotes(importDir: string): ImportResult {
  const jsonPath = path.join(importDir, 'exported-notes.json')

  if (fs.existsSync(jsonPath)) {
    return importNotesJson(jsonPath)
  }

  const entries = fs.readdirSync(importDir, { withFileTypes: true })
  const hasMdFiles = entries.some(e => e.name.endsWith('.md'))
  const hasSubdirs = entries.some(e => e.isDirectory() && e.name !== 'media' && !e.name.startsWith('.'))
  if (hasMdFiles || hasSubdirs) {
    return importNotesMarkdown(importDir)
  }

  return { created: 0, updated: 0, skipped: 0, mediaRestored: 0, errors: [`No exported-notes.json or .md files found in ${importDir}`] }
}

// ── JSON Import ──────────────────────────────────────────

/** Import notes from an in-memory ExportedNotes object (no media restoration). */
export function importNotesFromData(data: ExportedNotes): ImportResult {
  const result: ImportResult = { created: 0, updated: 0, skipped: 0, mediaRestored: 0, errors: [] }
  if (!data?.notes || !Array.isArray(data.notes)) {
    result.errors.push('Invalid import data: expected object with "notes" array')
    return result
  }
  importNoteNodes(data.notes, undefined, result, '', false)
  return result
}

function importNotesJson(jsonPath: string): ImportResult {
  const result: ImportResult = { created: 0, updated: 0, skipped: 0, mediaRestored: 0, errors: [] }
  const importDir = path.dirname(jsonPath)
  const hasMedia = fs.existsSync(path.join(importDir, 'media'))

  let parsed: any
  try {
    parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'))
  } catch {
    result.errors.push('Failed to parse exported-notes.json')
    return result
  }

  if (!parsed?.notes || !Array.isArray(parsed.notes)) {
    result.errors.push('Invalid import data: expected object with "notes" array')
    return result
  }

  importNoteNodes(parsed.notes as ExportedNote[], undefined, result, importDir, hasMedia)
  return result
}

function importNoteNodes(
  nodes: ExportedNote[],
  parentId: string | undefined,
  result: ImportResult,
  importDir: string,
  hasMedia: boolean,
): void {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]
    if (!node || !node.type || !node.title) {
      result.errors.push(`Note at index ${i} is missing required fields`)
      result.skipped++
      continue
    }

    // Check for existing note with same title at the same level
    const existing = findExistingNote(node.title, parentId)
    if (existing) {
      try {
        repository.noteCommands.update(existing.id, {
          content: node.content || '',
          icon: node.icon,
          completed: node.completed ?? false,
          displayOrder: node.displayOrder ?? i,
        })
        applyNoteUpdates(existing.id as string, {
          favorite: node.favorite,
          hideCompletedChildren: node.hideCompletedChildren,
        })
        if (node.savedDisplayOrder != null) {
          repository.noteCommands.update(existing.id, { savedDisplayOrder: node.savedDisplayOrder })
        }
        result.updated++

        // Recurse for children using existing note's ID
        if (node.children && node.children.length > 0) {
          importNoteNodes(node.children, existing.id as string, result, importDir, hasMedia)
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        result.errors.push(`Failed to update note "${node.title}": ${message}`)
        result.skipped++
      }
      continue
    }

    // Skip entity if its ID already exists in the database
    if (hasIdCollision(node.id)) {
      result.errors.push(`Skipped note "${node.title}": entity ID already exists (${node.id})`)
      result.skipped++
      continue
    }

    try {
      const note = repository.noteCommands.create({
        title: node.title,
        content: node.content || '',
        icon: node.icon,
        parentId,
        noteType: node.type,
        completed: node.completed ?? false,
        displayOrder: node.displayOrder ?? i,
        id: node.id,
      })
      result.created++

      // Restore media and apply fields not settable via create
      let restoredContent: string | undefined
      if (hasMedia && note.id) {
        const restored = restoreJsonMediaRefs(note.content, note.id, importDir)
        result.mediaRestored += restored.mediaRestored
        restoredContent = restored.mediaRestored > 0 ? restored.content : undefined
      }
      applyNoteUpdates(note.id, {
        favorite: node.favorite,
        hideCompletedChildren: node.hideCompletedChildren,
        content: restoredContent,
      })
      if (node.savedDisplayOrder != null) {
        repository.noteCommands.update(note.id as EARS.EntityId, { savedDisplayOrder: node.savedDisplayOrder })
      }

      // Recurse for children
      if (node.children && node.children.length > 0) {
        importNoteNodes(node.children, note.id, result, importDir, hasMedia)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      result.errors.push(`Failed to create note "${node.title}": ${message}`)
      result.skipped++
    }
  }
}

// ── Markdown Import ──────────────────────────────────────

function parseFrontmatter(content: string): {
  id?: string
  title?: string
  type: 'document' | 'tasklist' | 'task'
  icon: string | null
  favorite: boolean
  hideCompletedChildren: boolean
  completed: boolean
  displayOrder?: number
  savedDisplayOrder?: number
  body: string
} {
  const defaults = { type: 'document' as const, icon: null as string | null, favorite: false, hideCompletedChildren: false, completed: false }

  const match = content.match(/^---\n([\s\S]*?)\n---\n\n?/)
  if (!match) return { ...defaults, body: content }

  const frontmatter = match[1]
  const body = content.slice(match[0].length)

  const unescape = (s: string) => s.replace(/\\"/g, '"').replace(/\\\\/g, '\\')
  const idMatch = frontmatter.match(/id:\s*"((?:[^"\\]|\\.)*)"/)
  const titleMatch = frontmatter.match(/title:\s*"((?:[^"\\]|\\.)*)"/)
  const typeMatch = frontmatter.match(/type:\s*(\w+)/)
  const iconMatch = frontmatter.match(/icon:\s*"((?:[^"\\]|\\.)*)"/)
  const favoriteMatch = frontmatter.match(/favorite:\s*true/)
  const hideMatch = frontmatter.match(/hideCompletedChildren:\s*true/)
  const completedMatch = frontmatter.match(/completed:\s*true/)
  const displayOrderMatch = frontmatter.match(/displayOrder:\s*(\d+)/)
  const savedDisplayOrderMatch = frontmatter.match(/savedDisplayOrder:\s*(\d+)/)

  return {
    id: idMatch?.[1] ? unescape(idMatch[1]) : undefined,
    title: titleMatch?.[1] ? unescape(titleMatch[1]) : undefined,
    type: (typeMatch?.[1] as 'document' | 'tasklist' | 'task') ?? 'document',
    icon: iconMatch?.[1] ? unescape(iconMatch[1]) : null,
    favorite: !!favoriteMatch,
    hideCompletedChildren: !!hideMatch,
    completed: !!completedMatch,
    displayOrder: displayOrderMatch ? parseInt(displayOrderMatch[1], 10) : undefined,
    savedDisplayOrder: savedDisplayOrderMatch ? parseInt(savedDisplayOrderMatch[1], 10) : undefined,
    body,
  }
}

function importNotesMarkdown(importDir: string): ImportResult {
  const result: ImportResult = { created: 0, updated: 0, skipped: 0, mediaRestored: 0, errors: [] }
  const hasMedia = fs.existsSync(path.join(importDir, 'media'))
  importMarkdownDir(importDir, undefined, result, importDir, hasMedia)
  return result
}

function importMarkdownDir(
  dir: string,
  parentId: string | undefined,
  result: ImportResult,
  rootImportDir: string,
  hasMedia: boolean,
): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true })

  for (const entry of entries) {
    if (entry.name === 'media') continue
    const fullPath = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      // Subdirectory → document with children
      let name = toDisplayName(entry.name)

      try {
        // Check for index.md in subdirectory
        const indexPath = path.join(fullPath, 'index.md')
        let content = ''
        let icon: string | null = null
        let favorite = false
        let hideCompletedChildren = false
        let noteType: 'document' | 'tasklist' | 'task' = 'document'
        let completed = false
        let oldId: string | undefined
        let displayOrder: number | undefined
        let savedDisplayOrder: number | undefined

        if (fs.existsSync(indexPath)) {
          const raw = fs.readFileSync(indexPath, 'utf-8')
          const parsed = parseFrontmatter(raw)
          content = parsed.body
          icon = parsed.icon
          favorite = parsed.favorite
          hideCompletedChildren = parsed.hideCompletedChildren
          noteType = parsed.type
          completed = parsed.completed
          oldId = parsed.id
          displayOrder = parsed.displayOrder
          savedDisplayOrder = parsed.savedDisplayOrder
          if (parsed.title) name = parsed.title
        }

        // Skip entity if its ID already exists in the database
        if (hasIdCollision(oldId)) {
          result.errors.push(`Skipped note "${name}": entity ID already exists (${oldId})`)
          result.skipped++
          continue
        }

        const note = repository.noteCommands.create({
          title: name,
          content,
          icon,
          parentId,
          noteType,
          completed,
          displayOrder,
          id: oldId,
        })
        result.created++

        let restoredContent: string | undefined
        if (hasMedia && content) {
          const restored = restoreMarkdownMediaRefs(content, note.id, rootImportDir)
          result.mediaRestored += restored.mediaRestored
          restoredContent = restored.mediaRestored > 0 ? restored.content : undefined
        }
        applyNoteUpdates(note.id, {
          favorite,
          hideCompletedChildren,
          content: restoredContent,
        })
        if (savedDisplayOrder != null) {
          repository.noteCommands.update(note.id as EARS.EntityId, { savedDisplayOrder })
        }

        // Recurse for children (skip index.md)
        importMarkdownDir(fullPath, note.id, result, rootImportDir, hasMedia)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        result.errors.push(`Failed to create note "${name}": ${message}`)
        result.skipped++
      }
    } else if (entry.name.endsWith('.md') && entry.name !== 'index.md') {
      const basename = entry.name.slice(0, -3)
      let name = toDisplayName(basename)

      try {
        const raw = fs.readFileSync(fullPath, 'utf-8')
        const parsed = parseFrontmatter(raw)
        name = parsed.title || name

        // Skip entity if its ID already exists in the database
        if (hasIdCollision(parsed.id)) {
          result.errors.push(`Skipped note "${name}": entity ID already exists (${parsed.id})`)
          result.skipped++
          continue
        }

        const note = repository.noteCommands.create({
          title: name,
          content: parsed.body,
          icon: parsed.icon,
          parentId,
          noteType: parsed.type,
          completed: parsed.completed,
          displayOrder: parsed.displayOrder,
          id: parsed.id,
        })
        result.created++

        let restoredContent: string | undefined
        if (hasMedia && parsed.body) {
          const restored = restoreMarkdownMediaRefs(parsed.body, note.id, rootImportDir)
          result.mediaRestored += restored.mediaRestored
          restoredContent = restored.mediaRestored > 0 ? restored.content : undefined
        }
        applyNoteUpdates(note.id, {
          favorite: parsed.favorite,
          hideCompletedChildren: parsed.hideCompletedChildren,
          content: restoredContent,
        })
        if (parsed.savedDisplayOrder != null) {
          repository.noteCommands.update(note.id as EARS.EntityId, { savedDisplayOrder: parsed.savedDisplayOrder })
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        result.errors.push(`Failed to import "${name}": ${message}`)
        result.skipped++
      }
    }
  }
}
