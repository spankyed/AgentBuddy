/**
 * Library Export Functions
 *
 * Exports all library items (collections, documents, symlinks).
 * Supports JSON (full-fidelity) and Markdown (flat, human-readable) formats.
 */

import { qx } from '@/core/ears/helpers/query'
import { EARS } from '@/core/types'
import { isRootCollection, findDocumentCollection } from './repository/helpers'
import { extractMediaRefs, copyMediaByRef } from '@/core/shared/media'
import { ensureDirectoryExists, createExportDir } from '@/core/shared/paths'
import type { ContentSection } from './types'
import type { ExportedItem } from './export-types'
import type { ExportFormat } from './export-types'
import { exportLibraryMarkdown } from './export-markdown'
import { countExportedItems } from './utils'
import { writeExportJson } from '@/core/shared/export'

function buildCollectionTree(collectionId: EARS.EntityId): ExportedItem {
  const entity = qx(collectionId).pickAll()[0]
  if (!entity) {
    return { type: 'collection', name: 'Unknown', children: [] }
  }

  const symlinkPath = entity.symlinkPath as string | undefined
  if (symlinkPath) {
    return {
      id: entity.id as string,
      type: 'symlink',
      name: entity.name as string,
      symlinkPath,
    }
  }

  const children: ExportedItem[] = []

  // Add child collections
  const childCollections = qx(collectionId)
    .linksTo(EARS.RelKind.PARENT_OF, EARS.Entity.Collection)
    .pickAll()

  for (const child of childCollections) {
    children.push(buildCollectionTree(child.id as EARS.EntityId))
  }

  // Add documents in this collection
  const documents = qx(collectionId)
    .linksTo(EARS.RelKind.CONTAINS, EARS.Entity.Document)
    .pickAll()

  for (const doc of documents) {
    children.push({
      id: doc.id as string,
      type: 'document',
      name: doc.name as string,
      content: (doc.content as ContentSection[]) || [],
      tags: (doc.tags as string[]) || [],
    })
  }

  return {
    id: entity.id as string,
    type: 'collection',
    name: entity.name as string,
    ...(entity.description ? { description: entity.description as string } : {}),
    children,
  }
}

/** Build the full export tree and count items. Shared by both JSON and Markdown exporters. */
export function buildExportTree(): { items: ExportedItem[]; itemCount: number } {
  const items: ExportedItem[] = []
  let itemCount = 0

  // Get all root collections
  const allCollections = qx(EARS.Entity.Collection).pickAll()
  for (const col of allCollections) {
    if (isRootCollection(col.id as EARS.EntityId)) {
      const item = buildCollectionTree(col.id as EARS.EntityId)
      items.push(item)
      itemCount += countExportedItems(item)
    }
  }

  // Get root-level documents (not in any collection)
  const allDocuments = qx(EARS.Entity.Document).pickAll()
  for (const doc of allDocuments) {
    const collectionId = findDocumentCollection(doc.id as EARS.EntityId)
    if (!collectionId) {
      items.push({
        id: doc.id as string,
        type: 'document',
        name: doc.name as string,
        content: (doc.content as ContentSection[]) || [],
        tags: (doc.tags as string[]) || [],
      })
      itemCount++
    }
  }

  return { items, itemCount }
}

function exportLibraryJson(outputDir: string): { filePath: string; itemCount: number; mediaCopied: number } {
  outputDir = createExportDir(outputDir, 'library')
  const { items, itemCount } = buildExportTree()

  const exportData = {
    version: 1,
    items,
  }

  const filePath = writeExportJson(outputDir, 'exported-library.json', exportData)

  // Copy referenced media files into outputDir/media/{entityId}/
  const mediaCopied = copyMediaByRef(collectMediaRefs(items), outputDir)

  return { filePath, itemCount, mediaCopied }
}

function collectMediaRefs(items: ExportedItem[]) {
  const refs: ReturnType<typeof extractMediaRefs> = []
  for (const item of items) {
    if (item.type === 'document') {
      for (const section of item.content) {
        if ((section.type === 'markdown' || section.type === 'text') && 'text' in section) {
          refs.push(...extractMediaRefs(section.text))
        }
      }
    } else if (item.type === 'collection') {
      refs.push(...collectMediaRefs(item.children))
    }
  }
  return refs
}

export function exportLibrary(outputDir: string, format: ExportFormat = 'markdown'): { filePath: string; itemCount: number; mediaCopied: number } {
  return format === 'json' ? exportLibraryJson(outputDir) : exportLibraryMarkdown(outputDir)
}
