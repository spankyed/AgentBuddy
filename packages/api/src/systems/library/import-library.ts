/**
 * Library Import Function
 *
 * Imports library items from a portable JSON tree, recreating collections,
 * documents, and symlink collections. Validates symlink paths exist on disk.
 */

import * as fs from 'node:fs'
import { repository } from '@/repository'
import type { EARS } from '@/core/types'

interface ImportResult {
  created: number
  skipped: number
  errors: string[]
}

export function importLibrary(items: any[]): ImportResult {
  const result: ImportResult = { created: 0, skipped: 0, errors: [] }
  processItems(items, undefined, result)
  return result
}

function processItems(items: any[], parentId: EARS.EntityId | undefined, result: ImportResult): void {
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
        importCollection(item, parentId, result, i)
        break
      case 'document':
        importDocument(item, parentId, result, i)
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

function importCollection(item: any, parentId: EARS.EntityId | undefined, result: ImportResult, index: number): void {
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
      processItems(item.children, collection.id as EARS.EntityId, result)
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    result.errors.push(`Failed to create collection "${item.name}": ${message}`)
    result.skipped++
  }
}

function importDocument(item: any, parentId: EARS.EntityId | undefined, result: ImportResult, index: number): void {
  if (!item.name) {
    result.errors.push(`Document at index ${index} is missing required field "name"`)
    result.skipped++
    return
  }

  try {
    repository.libraryCommands.createDocument(
      item.name,
      Array.isArray(item.content) ? item.content : [],
      Array.isArray(item.tags) ? item.tags : [],
      parentId,
    )
    result.created++
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    result.errors.push(`Failed to create document "${item.name}": ${message}`)
    result.skipped++
  }
}
