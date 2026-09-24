import { Library, Folder } from 'lucide-vue-next'

import { openPlugin, usePluginState } from '@/__generated__/fe'
import { id as library } from './state'
import type { ReferenceTypeConfig, CategoryConfig, CategoryItemsProvider, ReferenceItem } from '@abuddy/sdk/fe/references'

export const referenceTypes: Record<string, ReferenceTypeConfig> = {
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
    navigate: (refId: string) => {
      openPlugin(library, { type: 'EDIT_DOCUMENT', documentId: refId })
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
    navigate: (refId: string) => {
      openPlugin(library, { type: 'NAVIGATE_TO_FOLDER', folderId: refId })
    },
  },
}

export const categories: CategoryConfig[] = [
  { id: 'documents', label: 'Library', primaryIcon: Library },
]

export const itemsProvider: CategoryItemsProvider = {
  category: 'documents',
  // The plugin's state, as it changes
  useItems: () => usePluginState('library', (state): ReferenceItem[] => {
    const index = state.index

    const docItems: ReferenceItem[] = index.documents.map((d: any) => ({
      id: d.id,
      shortCode: d.shortCode || d.id,
      label: d.name || d.shortCode || d.id,
      type: 'document' as const,
    }))

    const folderItems: ReferenceItem[] = index.folders.map((f: any) => ({
      id: f.id,
      shortCode: f.id,
      label: f.name || f.id,
      type: 'folder' as const,
    }))

    return [...folderItems, ...docItems]
  }),
}
