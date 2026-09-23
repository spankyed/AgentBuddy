import { NotebookText, CircleCheck, ListChecks } from 'lucide-vue-next'
import { usePluginState } from '@abuddy/sdk/fe'
import { navigateToPlugin } from '@/__generated__/fe'
import { NOTE_TYPE_TO_REFERENCE_TYPE, NOTES } from './public'
import { id as notes } from './state'
import type { ReferenceTypeConfig, CategoryConfig, CategoryItemsProvider, ReferenceItem } from '@abuddy/sdk/fe/references'


export const referenceTypes: Record<string, ReferenceTypeConfig> = {
  note: {
    protocol: 'note',
    category: 'notes',
    plugin: notes,
    icon: NotebookText,
    svgElements: [
      ['path', { d: 'M2 6h4' }],
      ['path', { d: 'M2 10h4' }],
      ['path', { d: 'M2 14h4' }],
      ['path', { d: 'M2 18h4' }],
      ['rect', { width: '16', height: '20', x: '4', y: '2', rx: '2' }],
      ['path', { d: 'M9.5 8h5' }],
      ['path', { d: 'M9.5 12H16' }],
      ['path', { d: 'M9.5 16H14' }],
    ],
    navigate: (refId: string) => {
      navigateToPlugin(notes, { type: 'NOTE.OPEN', noteId: refId })
    },
  },
  task: {
    protocol: 'task',
    category: 'notes',
    plugin: notes,
    icon: CircleCheck,
    svgElements: [
      ['circle', { cx: '12', cy: '12', r: '10' }],
      ['path', { d: 'm9 12 2 2 4-4' }],
    ],
    navigate: (refId: string) => {
      navigateToPlugin(notes, { type: 'NOTE.OPEN', noteId: refId })
    },
  },
  tasklist: {
    protocol: 'tasklist',
    category: 'notes',
    plugin: notes,
    icon: ListChecks,
    svgElements: [
      ['path', { d: 'm3 17 2 2 4-4' }],
      ['path', { d: 'm3 7 2 2 4-4' }],
      ['path', { d: 'M13 6h8' }],
      ['path', { d: 'M13 12h8' }],
      ['path', { d: 'M13 18h8' }],
    ],
    navigate: (refId: string) => {
      navigateToPlugin(notes, { type: 'NOTE.OPEN', noteId: refId })
    },
  },
}

export const categories: CategoryConfig[] = [
  { id: 'notes', label: 'Notes', primaryIcon: NotebookText },
]

export const itemsProvider: CategoryItemsProvider = {
  category: 'notes',
  // The plugin's state, as it changes
  useItems: () => usePluginState(NOTES, (actorState: any): ReferenceItem[] => {
    const allNotes = actorState?.context?.notes || []
    return allNotes
      .filter((n: any) => n.noteType in NOTE_TYPE_TO_REFERENCE_TYPE)
      .map((n: any) => ({
        id: n.id,
        shortCode: n.id,
        label: n.title || n.id,
        type: NOTE_TYPE_TO_REFERENCE_TYPE[n.noteType] as string,
      }))
  }),
}
