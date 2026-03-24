import * as fs from 'node:fs'
import * as path from 'node:path'
import { repository } from '@/repository'
import { EARS } from '@/core/types'
import { toTitleCase } from '@/systems/library/utils'
import type { ExportedNote, ExportedNotes } from './export-types'

interface ImportResult {
  created: number
  skipped: number
  errors: string[]
}

export function importNotes(importDir: string): ImportResult {
  const jsonPath = path.join(importDir, 'exported-notes.json')

  if (fs.existsSync(jsonPath)) {
    return importNotesJson(jsonPath)
  }

  const entries = fs.readdirSync(importDir)
  const hasMdFiles = entries.some(e => e.endsWith('.md'))
  if (hasMdFiles) {
    return importNotesMarkdown(importDir)
  }

  return { created: 0, skipped: 0, errors: [`No exported-notes.json or .md files found in ${importDir}`] }
}

// ── JSON Import ──────────────────────────────────────────

function importNotesJson(jsonPath: string): ImportResult {
  const result: ImportResult = { created: 0, skipped: 0, errors: [] }

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

  importNoteNodes(parsed.notes as ExportedNote[], undefined, result)
  return result
}

function importNoteNodes(
  nodes: ExportedNote[],
  parentId: string | undefined,
  result: ImportResult,
): void {
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]
    if (!node || !node.type || !node.title) {
      result.errors.push(`Note at index ${i} is missing required fields`)
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
      })
      result.created++

      // Update fields not settable via create
      const updates: Record<string, any> = {}
      if (node.hideCompletedChildren) updates.hideCompletedChildren = true
      if (node.favorite) updates.favorite = true
      if (Object.keys(updates).length > 0) {
        repository.noteCommands.update(note.id as EARS.EntityId, updates)
      }

      // Recurse for children
      if (node.children && node.children.length > 0) {
        importNoteNodes(node.children, note.id, result)
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
  type: 'document' | 'tasklist' | 'task'
  icon: string | null
  favorite: boolean
  hideCompletedChildren: boolean
  body: string
} {
  const defaults = { type: 'document' as const, icon: null as string | null, favorite: false, hideCompletedChildren: false }

  const match = content.match(/^---\n([\s\S]*?)\n---\n\n?/)
  if (!match) return { ...defaults, body: content }

  const frontmatter = match[1]
  const body = content.slice(match[0].length)

  const typeMatch = frontmatter.match(/type:\s*(\w+)/)
  const iconMatch = frontmatter.match(/icon:\s*"([^"]*)"/)
  const favoriteMatch = frontmatter.match(/favorite:\s*true/)
  const hideMatch = frontmatter.match(/hideCompletedChildren:\s*true/)

  return {
    type: (typeMatch?.[1] as 'document' | 'tasklist' | 'task') ?? 'document',
    icon: iconMatch?.[1] ?? null,
    favorite: !!favoriteMatch,
    hideCompletedChildren: !!hideMatch,
    body,
  }
}

function parseTaskList(body: string, parentId: string, result: ImportResult): void {
  const lines = body.split('\n')

  // Stack tracks parent at each indent level: [{id, indent}]
  const parentStack: { id: string; indent: number }[] = [{ id: parentId, indent: -1 }]

  for (const line of lines) {
    const taskMatch = line.match(/^(\s*)- \[([ x])\] (.+)/)
    if (!taskMatch) continue

    const indent = taskMatch[1].length
    const completed = taskMatch[2] === 'x'
    const title = taskMatch[3].trim()

    // Pop stack until we find the right parent for this indent level
    while (parentStack.length > 1 && parentStack[parentStack.length - 1].indent >= indent) {
      parentStack.pop()
    }

    const currentParentId = parentStack[parentStack.length - 1].id

    try {
      const note = repository.noteCommands.create({
        title,
        content: '',
        parentId: currentParentId,
        noteType: 'task',
        completed,
      })
      result.created++

      // Push this task as potential parent for sub-tasks
      parentStack.push({ id: note.id, indent })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      result.errors.push(`Failed to create task "${title}": ${message}`)
      result.skipped++
    }
  }
}

function importNotesMarkdown(importDir: string): ImportResult {
  const result: ImportResult = { created: 0, skipped: 0, errors: [] }
  importMarkdownDir(importDir, undefined, result)
  return result
}

function importMarkdownDir(
  dir: string,
  parentId: string | undefined,
  result: ImportResult,
): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true })

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      // Subdirectory → document with children
      const name = toTitleCase(entry.name)

      try {
        // Check for index.md in subdirectory
        const indexPath = path.join(fullPath, 'index.md')
        let content = ''
        let icon: string | null = null
        let favorite = false
        let hideCompletedChildren = false

        if (fs.existsSync(indexPath)) {
          const raw = fs.readFileSync(indexPath, 'utf-8')
          const parsed = parseFrontmatter(raw)
          content = parsed.body
          icon = parsed.icon
          favorite = parsed.favorite
          hideCompletedChildren = parsed.hideCompletedChildren
        }

        const note = repository.noteCommands.create({
          title: name,
          content,
          icon,
          parentId,
          noteType: 'document',
        })
        result.created++

        const updates: Record<string, any> = {}
        if (favorite) updates.favorite = true
        if (hideCompletedChildren) updates.hideCompletedChildren = true
        if (Object.keys(updates).length > 0) {
          repository.noteCommands.update(note.id as EARS.EntityId, updates)
        }

        // Recurse for children (skip index.md)
        importMarkdownDir(fullPath, note.id, result)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        result.errors.push(`Failed to create note "${name}": ${message}`)
        result.skipped++
      }
    } else if (entry.name.endsWith('.md') && entry.name !== 'index.md') {
      const basename = entry.name.slice(0, -3)
      const name = toTitleCase(basename)

      try {
        const raw = fs.readFileSync(fullPath, 'utf-8')
        const parsed = parseFrontmatter(raw)

        if (parsed.type === 'tasklist') {
          const note = repository.noteCommands.create({
            title: name,
            content: '',
            icon: parsed.icon,
            parentId,
            noteType: 'tasklist',
          })
          result.created++

          const updates: Record<string, any> = {}
          if (parsed.favorite) updates.favorite = true
          if (parsed.hideCompletedChildren) updates.hideCompletedChildren = true
          if (Object.keys(updates).length > 0) {
            repository.noteCommands.update(note.id as EARS.EntityId, updates)
          }

          // Parse tasks from body
          parseTaskList(parsed.body, note.id, result)
        } else {
          const note = repository.noteCommands.create({
            title: name,
            content: parsed.body,
            icon: parsed.icon,
            parentId,
            noteType: parsed.type,
          })
          result.created++

          const updates: Record<string, any> = {}
          if (parsed.favorite) updates.favorite = true
          if (parsed.hideCompletedChildren) updates.hideCompletedChildren = true
          if (Object.keys(updates).length > 0) {
            repository.noteCommands.update(note.id as EARS.EntityId, updates)
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        result.errors.push(`Failed to import "${name}": ${message}`)
        result.skipped++
      }
    }
  }
}
