/**
 * Library Import Function
 *
 * Imports library items from an export directory containing exported-library.json
 * and an optional media/ folder. Recreates collections, documents, and symlink
 * collections. Media files are copied to new entity directories and URLs rewritten.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { repository } from '@/repository'
import type { EARS } from '@/core/types'
import { extractMediaRefs } from '@/core/helpers/media'
import { getMediaPath } from '@/core/helpers/paths'
import type { ContentSection } from './types'
import type { ExportedLibrary } from './export-types'

interface ImportResult {
  created: number
  skipped: number
  mediaRestored: number
  errors: string[]
}

export function importLibrary(importDir: string): ImportResult {
  const result: ImportResult = { created: 0, skipped: 0, mediaRestored: 0, errors: [] }

  const jsonPath = path.join(importDir, 'exported-library.json')
  if (!fs.existsSync(jsonPath)) {
    result.errors.push(`exported-library.json not found in ${importDir}`)
    return result
  }

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
        const refs = extractMediaRefs(section.text)
        for (const ref of refs) {
          const srcFile = path.join(importDir, 'media', ref.entityId, ref.filename)
          if (!fs.existsSync(srcFile)) continue

          const destDir = path.join(getMediaPath(), newId)
          if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true })
          }
          fs.copyFileSync(srcFile, path.join(destDir, ref.filename))
          result.mediaRestored++

          // Rewrite media URL from old entity ID to new ID
          section.text = section.text.split(`media://${ref.entityId}/`).join(`media://${newId}/`)
          contentChanged = true
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
