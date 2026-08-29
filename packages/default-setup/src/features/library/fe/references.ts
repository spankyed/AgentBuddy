import { Library, Folder } from 'lucide-vue-next'
import { navigateToPlugin } from '@/core/utils/navigate'
import { id as library } from './state'
import type { RefTypeConfig, CategoryConfig, CategoryItemsProvider, ReferenceItem } from '@/registries/reference-types'

function flattenCollections(colls: any[]): any[] {
  const result: any[] = []
  for (const c of colls) {
    result.push(c)
    if (c.childCollections?.length) {
      result.push(...flattenCollections(c.childCollections))
    }
  }
  return result
}

export const refTypes: Record<string, RefTypeConfig> = {
  document: {
    protocol: 'doc',
    category: 'documents',
    plugin: library,
    icon: Library,
    svgElements: [
      ['path', { d: 'm16 6 4 14' }],
      ['path', { d: 'M12 6v14' }],
      ['path', { d: 'M8 8v12' }],
      ['path', { d: 'M4 4v16' }],
    ],
    navigate: (_system: any, refId: string) => {
      navigateToPlugin(library, { type: 'EDIT_DOCUMENT', documentId: refId })
    },
  },
  folder: {
    protocol: 'folder',
    category: 'documents',
    plugin: library,
    icon: Folder,
    svgElements: [
      ['path', { d: 'M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z' }],
    ],
    navigate: (_system: any, refId: string) => {
      navigateToPlugin(library, { type: 'NAVIGATE_TO_FOLDER', folderId: refId })
    },
  },
}

export const categories: CategoryConfig[] = [
  { id: 'documents', label: 'Library', primaryIcon: Library },
]

export const itemsProvider: CategoryItemsProvider = {
  category: 'documents',
  pluginId: library,
  buildItems: (actorState: any): ReferenceItem[] => {
    const documents = actorState?.context?.documents || []
    const collections = actorState?.context?.collections || []

    const docItems: ReferenceItem[] = documents.map((d: any) => ({
      id: d.id,
      shortCode: d.shortCode || d.id,
      label: d.name || d.shortCode || d.id,
      type: 'document' as const,
    }))

    const folderItems: ReferenceItem[] = flattenCollections(collections).map((c: any) => ({
      id: c.id,
      shortCode: c.id,
      label: c.name || c.id,
      type: 'folder' as const,
    }))

    return [...folderItems, ...docItems]
  },
}
