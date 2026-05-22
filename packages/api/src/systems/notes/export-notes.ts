import * as fs from 'node:fs'
import * as path from 'node:path'
import { repository } from '@/repository'
import { qx } from '@/core/ears/helpers/query'
import { EARS } from '@/core/types'
import { ensureDirectoryExists, createExportDir } from '@/core/shared/paths'
import { extractMediaRefs, rewriteMediaUrls, copyMediaByRef, copyFlatMedia } from '@/core/shared/media'
import { toSlug, uniqueFilename, writeExportJson, writeExportFile } from '@/core/shared/export'
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
      id: note.id,
      type: note.noteType,
      title: note.title,
      content: note.content,
      icon: note.icon,
      completed: note.completed,
      hideCompletedChildren: note.hideCompletedChildren ?? false,
      favorite: note.favorite ?? false,
      displayOrder: note.displayOrder,
      ...(note.savedDisplayOrder != null ? { savedDisplayOrder: note.savedDisplayOrder } : {}),
      children,
    }
  }

  // Root notes: no parent
  const rootNotes = allNotes
    .filter((n: NoteEntity) => !hasParent.has(n.id))
    .sort((a: NoteEntity, b: NoteEntity) => a.displayOrder - b.displayOrder)

  const notes = rootNotes.map(buildNode)
  return { notes, itemCount }
}

function collectNoteMediaRefs(notes: ExportedNote[]): ReturnType<typeof extractMediaRefs> {
  const refs: ReturnType<typeof extractMediaRefs> = []
  for (const note of notes) {
    refs.push(...extractMediaRefs(note.content))
    if (note.children.length > 0) {
      refs.push(...collectNoteMediaRefs(note.children))
    }
  }
  return refs
}

function exportNotesJson(outputDir: string): { filePath: string; itemCount: number; mediaCopied: number } {
  outputDir = createExportDir(outputDir, 'notes')
  const { notes, itemCount } = buildNoteTree()

  const exportData = {
    version: 1,
    notes,
  }

  const filePath = writeExportJson(outputDir, 'exported-notes.json', exportData)

  // Copy referenced media files into outputDir/media/{entityId}/
  const mediaCopied = copyMediaByRef(collectNoteMediaRefs(notes), outputDir)

  return { filePath, itemCount, mediaCopied }
}

function escapeQuotes(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function buildNoteFrontmatter(note: ExportedNote): string {
  const fields: string[] = []
  if (note.id) fields.push(`id: "${escapeQuotes(note.id)}"`)
  if (note.title) fields.push(`title: "${escapeQuotes(note.title)}"`)
  fields.push(`type: ${note.type}`)
  if (note.icon) fields.push(`icon: "${escapeQuotes(note.icon)}"`)
  if (note.favorite) fields.push(`favorite: true`)
  if (note.hideCompletedChildren) fields.push(`hideCompletedChildren: true`)
  if (note.completed) fields.push(`completed: true`)
  if (note.displayOrder !== undefined) fields.push(`displayOrder: ${note.displayOrder}`)
  if (note.savedDisplayOrder !== undefined) fields.push(`savedDisplayOrder: ${note.savedDisplayOrder}`)
  return `---\n${fields.join('\n')}\n---\n\n`
}

function collectAndMapNoteMedia(
  notes: ExportedNote[],
  mediaFilenameMap: Map<string, string>,
  usedMediaNames: Set<string>,
): void {
  for (const note of notes) {
    const refs = extractMediaRefs(note.content)
    for (const ref of refs) {
      const key = `${ref.entityId}/${ref.filename}`
      if (mediaFilenameMap.has(key)) continue
      const flat = uniqueFilename(ref.filename, usedMediaNames)
      usedMediaNames.add(flat)
      mediaFilenameMap.set(key, flat)
    }
    if (note.children.length > 0) {
      collectAndMapNoteMedia(note.children, mediaFilenameMap, usedMediaNames)
    }
  }
}

function writeNoteMarkdown(
  note: ExportedNote,
  dir: string,
  usedNames: Set<string>,
  mediaFilenameMap: Map<string, string>,
): void {
  const slug = toSlug(note.title || 'untitled')

  const content = rewriteMediaUrls(note.content, mediaFilenameMap)

  if (note.children.length > 0) {
    // Has children → create subdirectory
    const dirName = uniqueFilename(slug, usedNames)
    usedNames.add(dirName)
    const subDir = path.join(dir, dirName)
    ensureDirectoryExists(subDir)

    // Write the parent note as index.md
    const frontmatter = buildNoteFrontmatter(note)
    writeExportFile(subDir, 'index.md', frontmatter + content)

    // Write children
    const childUsedNames = new Set<string>(['index.md'])
    for (const child of note.children) {
      writeNoteMarkdown(child, subDir, childUsedNames, mediaFilenameMap)
    }
  } else {
    const filename = uniqueFilename(`${slug}.md`, usedNames)
    usedNames.add(filename)
    const frontmatter = buildNoteFrontmatter(note)
    writeExportFile(dir, filename, frontmatter + content)
  }
}

function exportNotesMarkdown(outputDir: string): { filePath: string; itemCount: number; mediaCopied: number } {
  outputDir = createExportDir(outputDir, 'notes')
  const { notes, itemCount } = buildNoteTree()

  // First pass: collect all media refs and build a flat filename map
  const mediaFilenameMap = new Map<string, string>()
  const usedMediaNames = new Set<string>()
  collectAndMapNoteMedia(notes, mediaFilenameMap, usedMediaNames)

  // Second pass: write files with rewritten media URLs
  const usedNames = new Set<string>()
  for (const note of notes) {
    writeNoteMarkdown(note, outputDir, usedNames, mediaFilenameMap)
  }

  // Copy media files to flat media/ folder
  const mediaCopied = copyFlatMedia(mediaFilenameMap, outputDir)

  return { filePath: outputDir, itemCount, mediaCopied }
}

export function exportNotes(outputDir: string, format: NotesExportFormat): { filePath: string; itemCount: number; mediaCopied: number } {
  return format === 'json' ? exportNotesJson(outputDir) : exportNotesMarkdown(outputDir)
}
