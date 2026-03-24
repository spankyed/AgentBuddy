/**
 * Library Import Function
 *
 * Imports library items from an export directory. Auto-detects format:
 * - If exported-library.json exists → JSON import (full-fidelity)
 * - Otherwise scans for .md files → Markdown import (flat structure)
 *
 * Media files are copied to new entity directories and URLs rewritten.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { repository } from '@/repository'
import type { EARS } from '@/core/types'
import { restoreJsonMediaRefs, restoreMarkdownMediaRefs } from '@/core/helpers/media'
import type { ContentSection } from './types'
import type { ExportedLibrary } from './export-types'
import { toTitleCase, parseFrontmatter } from './utils'

interface ImportResult {
  created: number
  skipped: number
  mediaRestored: number
  errors: string[]
}

export function importLibrary(importDir: string): ImportResult {
  const jsonPath = path.join(importDir, 'exported-library.json')

  if (fs.existsSync(jsonPath)) {
    return importLibraryJson(importDir, jsonPath)
  }

  // Check for .md files
  const entries = fs.readdirSync(importDir)
  const hasMdFiles = entries.some(e => e.endsWith('.md'))
  if (hasMdFiles) {
    return importLibraryMarkdown(importDir)
  }

  return { created: 0, skipped: 0, mediaRestored: 0, errors: [`No exported-library.json or .md files found in ${importDir}`] }
}

// ── JSON Import ──────────────────────────────────────────────

function importLibraryJson(importDir: string, jsonPath: string): ImportResult {
  const result: ImportResult = { created: 0, skipped: 0, mediaRestored: 0, errors: [] }

  let parsed: any
  try {
    parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'))
  } catch {
    result.errors.push('Failed to parse exported-library.json')
    return result
  }

  const items = Array.isArray(parsed) ? parsed : parsed?.items
  if (!Array.isArray(items)) {
    result.errors.push('Invalid import data: expected an array of items')
    return result
  }

  const hasMedia = fs.existsSync(path.join(importDir, 'media'))

  processItems(items, undefined, result, importDir, hasMedia)
  return result
}

function processItems(
  items: any[],
  parentId: EARS.EntityId | undefined,
  result: ImportResult,
  importDir: string,
  hasMedia: boolean,
): void {
  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (!item || !item.type) {
      result.errors.push(`Item at index ${i} is missing a "type" field`)
      result.skipped++
      continue
    }

    switch (item.type) {
      case 'symlink':
        importSymlink(item, parentId, result, i)
        break
      case 'collection':
        importCollection(item, parentId, result, i, importDir, hasMedia)
        break
      case 'document':
        importDocument(item, parentId, result, i, importDir, hasMedia)
        break
      default:
        result.errors.push(`Item at index ${i} has unknown type "${item.type}"`)
        result.skipped++
    }
  }
}

function importSymlink(item: any, parentId: EARS.EntityId | undefined, result: ImportResult, index: number): void {
  if (!item.name || !item.symlinkPath) {
    result.errors.push(`Symlink at index ${index} is missing required fields (name, symlinkPath)`)
    result.skipped++
    return
  }

  if (!fs.existsSync(item.symlinkPath)) {
    result.errors.push(`Symlink "${item.name}": path does not exist: ${item.symlinkPath}`)
    result.skipped++
    return
  }

  try {
    repository.libraryCommands.createSymlinkCollection(item.name, item.symlinkPath, parentId)
    result.created++
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    result.errors.push(`Failed to create symlink "${item.name}": ${message}`)
    result.skipped++
  }
}

function importCollection(
  item: any,
  parentId: EARS.EntityId | undefined,
  result: ImportResult,
  index: number,
  importDir: string,
  hasMedia: boolean,
): void {
  if (!item.name) {
    result.errors.push(`Collection at index ${index} is missing required field "name"`)
    result.skipped++
    return
  }

  try {
    const collection = repository.libraryCommands.createCollection(item.name, item.description, parentId)
    result.created++

    // Recurse into children
    if (Array.isArray(item.children) && item.children.length > 0) {
      processItems(item.children, collection.id as EARS.EntityId, result, importDir, hasMedia)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    result.errors.push(`Failed to create collection "${item.name}": ${message}`)
    result.skipped++
  }
}

function importDocument(
  item: any,
  parentId: EARS.EntityId | undefined,
  result: ImportResult,
  index: number,
  importDir: string,
  hasMedia: boolean,
): void {
  if (!item.name) {
    result.errors.push(`Document at index ${index} is missing required field "name"`)
    result.skipped++
    return
  }

  try {
    const content: ContentSection[] = Array.isArray(item.content) ? item.content : []
    const tags: string[] = Array.isArray(item.tags) ? item.tags : []

    const document = repository.libraryCommands.createDocument(item.name, content, tags, parentId)
    result.created++

    if (!hasMedia) return

    // Restore media: copy files and rewrite URLs
    const newId = document.id
    let contentChanged = false

    for (const section of content) {
      if ((section.type === 'markdown' || section.type === 'text') && 'text' in section) {
        const restored = restoreJsonMediaRefs(section.text, newId, importDir)
        if (restored.mediaRestored > 0) {
          section.text = restored.content
          contentChanged = true
          result.mediaRestored += restored.mediaRestored
        }
      }
    }

    if (contentChanged) {
      repository.libraryCommands.updateDocument(
        newId as EARS.EntityId,
        item.name,
        content,
        tags,
      )
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    result.errors.push(`Failed to create document "${item.name}": ${message}`)
    result.skipped++
  }
}

// ── Markdown Import ──────────────────────────────────────────

function importLibraryMarkdown(importDir: string): ImportResult {
  const result: ImportResult = { created: 0, skipped: 0, mediaRestored: 0, errors: [] }
  const hasMedia = fs.existsSync(path.join(importDir, 'media'))

  importMarkdownDir(importDir, undefined, result, importDir, hasMedia)
  return result
}

function importMarkdownDir(
  dir: string,
  parentId: EARS.EntityId | undefined,
  result: ImportResult,
  rootImportDir: string,
  hasMedia: boolean,
): void {
  const entries = fs.readdirSync(dir, { withFileTypes: true })

  for (const entry of entries) {
    if (entry.name === 'media') continue
    const fullPath = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      // Subdirectory → collection
      const name = toTitleCase(entry.name)
      try {
        const collection = repository.libraryCommands.createCollection(name, undefined, parentId)
        result.created++
        importMarkdownDir(fullPath, collection.id as EARS.EntityId, result, rootImportDir, hasMedia)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        result.errors.push(`Failed to create collection "${name}": ${message}`)
        result.skipped++
      }
    } else if (entry.name.endsWith('.md')) {
      // .md file → document
      const basename = entry.name.slice(0, -3) // strip .md
      const name = toTitleCase(basename)

      try {
        const raw = fs.readFileSync(fullPath, 'utf-8')
        const { tags, body } = parseFrontmatter(raw)

        // Create content as a single markdown section
        const content: ContentSection[] = body.trim()
          ? [{ type: 'markdown', text: body }]
          : []

        const document = repository.libraryCommands.createDocument(name, content, tags, parentId)
        result.created++

        if (!hasMedia || content.length === 0) continue

        // Restore media: scan for media/{filename} refs, copy to new entity dir
        const newId = document.id
        let contentChanged = false
        const section = content[0] as { type: 'markdown'; text: string }

        const restored = restoreMarkdownMediaRefs(section.text, newId, rootImportDir)
        if (restored.mediaRestored > 0) {
          section.text = restored.content
          contentChanged = true
          result.mediaRestored += restored.mediaRestored
        }

        if (contentChanged) {
          repository.libraryCommands.updateDocument(
            newId as EARS.EntityId,
            name,
            content,
            tags,
          )
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        result.errors.push(`Failed to import "${name}": ${message}`)
        result.skipped++
      }
    }
  }
}
