import { usePluginState } from '#generated/fe.ts'
import type { ReferenceItem } from '@apackdev/sdk/fe/references'

export const useItems = () => usePluginState('library', (state): ReferenceItem[] => {
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
})
