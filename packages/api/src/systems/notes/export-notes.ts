import * as fs from 'node:fs'
import * as path from 'node:path'
import { repository } from '@/repository'
import { qx } from '@/core/ears/helpers/query'
import { EARS } from '@/core/types'
import { ensureDirectoryExists } from '@/core/helpers/paths'
import { toSlug, uniqueFilename } from '@/systems/library/utils'
import type { NoteEntity } from './types'
import type { ExportedNote, NotesExportFormat } from './export-types'

function buildNoteTree(): { notes: ExportedNote[]; itemCount: number } {
  const allNotes = repository.noteQueries.all()

  // Build parent→children map
  const childrenMap = new Map<string, NoteEntity[]>()
  const hasParent = new Set<string>()

  for (const note of allNotes) {
    const parentIds = qx(note.id).linksTo(EARS.RelKind.CONTAINS, EARS.Entity.Note, false).ids()
    if (parentIds.length > 0) {
      hasParent.add(note.id)
      const parentId = parentIds[0]
      if (!childrenMap.has(parentId)) childrenMap.set(parentId, [])
      childrenMap.get(parentId)!.push(note)
    }
  }

  // Sort children by displayOrder
  for (const children of childrenMap.values()) {
    children.sort((a, b) => a.displayOrder - b.displayOrder)
  }

  let itemCount = 0

  function buildNode(note: NoteEntity): ExportedNote {
    itemCount++
    const children = (childrenMap.get(note.id) || []).map(buildNode)
    return {
      type: note.noteType,
      title: note.title,
      content: note.content,
      icon: note.icon,
      completed: note.completed,
      hideCompletedChildren: note.hideCompletedChildren ?? false,
      favorite: note.favorite ?? false,
      children,
    }
  }

  // Root notes: no parent
  const rootNotes = allNotes
    .filter(n => !hasParent.has(n.id))
    .sort((a, b) => a.displayOrder - b.displayOrder)

  const notes = rootNotes.map(buildNode)
  return { notes, itemCount }
}

function exportNotesJson(outputDir: string): { filePath: string; itemCount: number } {
  const { notes, itemCount } = buildNoteTree()

  const exportData = {
    version: 1,
    notes,
  }

  const filePath = path.join(outputDir, 'exported-notes.json')
  ensureDirectoryExists(outputDir)
  fs.writeFileSync(filePath, JSON.stringify(exportData, null, 2))

  return { filePath, itemCount }
}

function renderTasksMarkdown(children: ExportedNote[], indent: number): string {
  const lines: string[] = []
  const prefix = '  '.repeat(indent)

  for (const child of children) {
    if (child.type === 'task') {
      const checkbox = child.completed ? '[x]' : '[ ]'
      lines.push(`${prefix}- ${checkbox} ${child.title}`)
      if (child.content.trim()) {
        for (const line of child.content.split('\n')) {
          lines.push(`${prefix}  ${line}`)
        }
      }
      if (child.children.length > 0) {
        lines.push(renderTasksMarkdown(child.children, indent + 1))
      }
    }
  }

  return lines.join('\n')
}

function buildNoteFrontmatter(note: ExportedNote): string {
  const fields: string[] = []
  fields.push(`type: ${note.type}`)
  if (note.icon) fields.push(`icon: "${note.icon}"`)
  if (note.favorite) fields.push(`favorite: true`)
  if (note.hideCompletedChildren) fields.push(`hideCompletedChildren: true`)
  return `---\n${fields.join('\n')}\n---\n\n`
}

function writeNoteMarkdown(
  note: ExportedNote,
  dir: string,
  usedNames: Set<string>,
): void {
  const slug = toSlug(note.title || 'untitled')

  if (note.type === 'tasklist') {
    const filename = uniqueFilename(`${slug}.md`, usedNames)
    usedNames.add(filename)
    const frontmatter = buildNoteFrontmatter(note)
    const body = renderTasksMarkdown(note.children, 0)
    fs.writeFileSync(path.join(dir, filename), frontmatter + body)
  } else {
    // Document
    if (note.children.length > 0) {
      // Has children → create subdirectory
      const dirName = uniqueFilename(slug, usedNames)
      usedNames.add(dirName)
      const subDir = path.join(dir, dirName)
      ensureDirectoryExists(subDir)

      // Write the parent document as index.md
      const frontmatter = buildNoteFrontmatter(note)
      fs.writeFileSync(path.join(subDir, 'index.md'), frontmatter + note.content)

      // Write children
      const childUsedNames = new Set<string>(['index.md'])
      for (const child of note.children) {
        writeNoteMarkdown(child, subDir, childUsedNames)
      }
    } else {
      const filename = uniqueFilename(`${slug}.md`, usedNames)
      usedNames.add(filename)
      const frontmatter = buildNoteFrontmatter(note)
      fs.writeFileSync(path.join(dir, filename), frontmatter + note.content)
    }
  }
}

function exportNotesMarkdown(outputDir: string): { filePath: string; itemCount: number } {
  const { notes, itemCount } = buildNoteTree()

  ensureDirectoryExists(outputDir)

  const usedNames = new Set<string>()
  for (const note of notes) {
    writeNoteMarkdown(note, outputDir, usedNames)
  }

  return { filePath: outputDir, itemCount }
}

export function exportNotes(outputDir: string, format: NotesExportFormat): { filePath: string; itemCount: number } {
  return format === 'json' ? exportNotesJson(outputDir) : exportNotesMarkdown(outputDir)
}
