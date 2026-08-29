import { qx } from '@/core/ears/helpers/query'
import { tx } from '@/core/ears/helpers/transaction'
import { edgeStore } from '@/core/ears/helpers/edge-store'
import { EARS } from '@/core/types'
import type { ContentSection } from '../types'

// ================ Helper Functions ================

export const findParentCollection = (childId: EARS.EntityId): EARS.EntityId | null => 
  qx(EARS.Entity.Collection).pickAll().find(col => 
    qx(col.id as EARS.EntityId).linksTo(EARS.RelKind.PARENT_OF, EARS.Entity.Collection).ids().includes(childId)
  )?.id as EARS.EntityId || null

export const isRootCollection = (id: EARS.EntityId): boolean => !findParentCollection(id)

export const findDocumentCollection = (docId: EARS.EntityId): EARS.EntityId | null =>
  qx(EARS.Entity.Collection).pickAll().find(col =>
    qx(col.id as EARS.EntityId).linksTo(EARS.RelKind.CONTAINS, EARS.Entity.Document).ids().includes(docId)
  )?.id as EARS.EntityId || null

export const getDisplayOrder = (item: any): number => {
  const d = item?.displayOrder
  return Array.isArray(d) ? d[0] || 0 : (d as number) || 0
}

export const getItemsForReordering = (folderId: EARS.EntityId | null) => {
  if (folderId === null) {
    return [
      ...qx(EARS.Entity.Collection).pickAll()
        .filter(c => isRootCollection(c.id as EARS.EntityId))
        .map(c => ({ id: c.id as EARS.EntityId, displayOrder: getDisplayOrder(c), type: 'folder' as const })),
      ...qx(EARS.Entity.Document).pickAll()
        .filter(d => !findDocumentCollection(d.id as EARS.EntityId))
        .map(d => ({ id: d.id as EARS.EntityId, displayOrder: getDisplayOrder(d), type: 'document' as const }))
    ]
  }
  return [
    ...qx(folderId).linksTo(EARS.RelKind.PARENT_OF, EARS.Entity.Collection).pickAll()
      .map(c => ({ id: c.id as EARS.EntityId, displayOrder: getDisplayOrder(c), type: 'folder' as const })),
    ...qx(folderId).linksTo(EARS.RelKind.CONTAINS, EARS.Entity.Document).pickAll()
      .map(d => ({ id: d.id as EARS.EntityId, displayOrder: getDisplayOrder(d), type: 'document' as const }))
  ]
}

// Tags are now stored as string arrays on entities, not as separate entities
// This function is no longer needed but kept for reference
// export const createTagsForEntity = (entityId: EARS.EntityId, tagNames: string[]) =>
//   tagNames.forEach(name => {
//     const tagId = `Tag-${uuid()}` as EARS.EntityId
//     tx(tagId).put('name', name)
//     tx(entityId).link(EARS.RelKind.HAS, tagId)
//   })

// Tags are now managed in settings, not as entities
// export const removeAllTagsFromEntity = (entityId: EARS.EntityId) =>
//   qx(entityId).linksTo(EARS.RelKind.HAS, EARS.Entity.Tag).pickAll().forEach(tag => {
//     edgeStore.unlink({ sourceEntity: entityId, relationType: EARS.RelKind.HAS, targetEntity: tag.id as EARS.EntityId })
//     tx(tag.id as EARS.EntityId).destroy()
//   })

export function getNextDisplayOrder(parentId: EARS.EntityId | null): number {
  const items = getItemsForReordering(parentId)
  return Math.max(0, ...items.map(i => i.displayOrder)) + 1000
}

export function getCollectionPath(collectionId: EARS.EntityId): string[] {
  const path: string[] = []
  let currentId: EARS.EntityId | null = collectionId
  while (currentId) {
    const collection = qx(currentId).pickAll()[0]
    if (collection) path.unshift(collection.name as string)
    currentId = findParentCollection(currentId)
  }
  return path
}

export const formatFileSize = (bytes: number): string => {
  if (bytes === 0) return '0 B'
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Math.round(bytes / Math.pow(k, i) * 10) / 10 + ' ' + sizes[i]
}

export const getContentLength = (content: ContentSection[] | undefined | null): number => {
  if (!content || !Array.isArray(content)) return 0
  return content.reduce((length, section) =>
    length + (section.type === 'markdown' || section.type === 'text' ? section.text.length :
    section.type === 'field' ? section.fields.reduce((acc, field) => acc + field.key.length + field.value.length, 0) :
    section.type === 'list' ? section.items.reduce((acc, item) => acc + item.length, 0) : 0), 0)
}