// The library view's own helpers. The tree's mechanics — a child's parent, a new child's place among
// mixed siblings, a folder's path — are the SDK's now, beside the entities (`@apackdev/sdk/repositories`),
// and re-exported here because this feature's queries name them.
import type { ContentSection } from '#features/library/be/types.ts';

export {
  collectionPath as getCollectionPath,
  displayOrderOf as getDisplayOrder,
  nextDisplayOrder as getNextDisplayOrder,
  parentCollectionOf as findParentCollection,
  collectionOfDocument as findDocumentCollection,
} from '@apackdev/sdk/repositories';
import { parentCollectionOf } from '@apackdev/sdk/repositories';
import type { EARS } from '#generated/ears.ts';

export const isRootCollection = (id: EARS.EntityId): boolean => !parentCollectionOf(id);

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
