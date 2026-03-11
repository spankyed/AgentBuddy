/**
 * Library Export Function
 *
 * Exports all library items (collections, documents, symlinks) as a portable
 * nested JSON tree, stripping internal fields.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import { qx } from '@/core/ears/helpers/query'
import { EARS } from '@/core/types'
import { repository } from '@/repository'
import { isRootCollection, findDocumentCollection } from './repository/helpers'
import { extractMediaRefs, resolveMedia } from '@/core/helpers/media'
import type { ContentSection } from './types'

interface ExportedDocument {
  type: 'document'
  name: string
  content: ContentSection[]
  tags: string[]
}

interface ExportedCollection {
  type: 'collection'
  name: string
  description?: string
  children: ExportedItem[]
}

interface ExportedSymlink {
  type: 'symlink'
  name: string
  symlinkPath: string
}

type ExportedItem = ExportedDocument | ExportedCollection | ExportedSymlink

function buildCollectionTree(collectionId: EARS.EntityId): ExportedItem {
  const entity = qx(collectionId).pickAll()[0]
  if (!entity) {
    return { type: 'collection', name: 'Unknown', children: [] }
  }

  const symlinkPath = entity.symlinkPath as string | undefined
  if (symlinkPath) {
    return {
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
      type: 'document',
      name: doc.name as string,
      content: (doc.content as ContentSection[]) || [],
      tags: (doc.tags as string[]) || [],
    })
  }

  return {
    type: 'collection',
    name: entity.name as string,
    ...(entity.description ? { description: entity.description as string } : {}),
    children,
  }
}

export function exportLibrary(outputDir: string): { filePath: string; itemCount: number; mediaCopied: number } {
  const items: ExportedItem[] = []
  let itemCount = 0

  // Get all root collections
  const allCollections = qx(EARS.Entity.Collection).pickAll()
  for (const col of allCollections) {
    if (isRootCollection(col.id as EARS.EntityId)) {
      const item = buildCollectionTree(col.id as EARS.EntityId)
      items.push(item)
      itemCount += countItems(item)
    }
  }

  // Get root-level documents (not in any collection)
  const allDocuments = qx(EARS.Entity.Document).pickAll()
  for (const doc of allDocuments) {
    const collectionId = findDocumentCollection(doc.id as EARS.EntityId)
    if (!collectionId) {
      items.push({
        type: 'document',
        name: doc.name as string,
        content: (doc.content as ContentSection[]) || [],
        tags: (doc.tags as string[]) || [],
      })
      itemCount++
    }
  }

  const exportData = {
    version: 1,
    items,
  }

  const filePath = path.join(outputDir, 'exported-library.json')

  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true })
  }

  fs.writeFileSync(filePath, JSON.stringify(exportData, null, 2))

  // Copy referenced media files into outputDir/media/
  const mediaRefs = collectMediaRefs(items)
  let mediaCopied = 0
  for (const ref of mediaRefs) {
    const resolved = resolveMedia(ref)
    if (!resolved) continue
    const destDir = path.join(outputDir, 'media', ref.entityId)
    if (!fs.existsSync(destDir)) {
      fs.mkdirSync(destDir, { recursive: true })
    }
    fs.copyFileSync(resolved.filePath, path.join(destDir, ref.filename))
    mediaCopied++
  }

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

function countItems(item: ExportedItem): number {
  if (item.type === 'document' || item.type === 'symlink') return 1
  // collection: count self + recurse children
  return 1 + item.children.reduce((sum, child) => sum + countItems(child), 0)
}
