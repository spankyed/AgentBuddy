import { NotebookText, CircleCheck, ListChecks } from 'lucide-vue-next'
import { navigateToPlugin } from '@abuddy/sdk/fe'
import { id as notes } from './state'
import type { ContributionTypeConfig, CategoryConfig, CategoryItemsProvider, ContributionItem } from '@abuddy/sdk/fe/contributions'

export const NOTE_TYPE_TO_CONTRIBUTION_TYPE: Record<string, string> = {
  document: 'note',
  task: 'task',
  tasklist: 'tasklist',
}

export const contributionTypes: Record<string, ContributionTypeConfig> = {
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
    navigate: (_system: any, refId: string) => {
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
    navigate: (_system: any, refId: string) => {
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
    navigate: (_system: any, refId: string) => {
      navigateToPlugin(notes, { type: 'NOTE.OPEN', noteId: refId })
    },
  },
}

export const categories: CategoryConfig[] = [
  { id: 'notes', label: 'Notes', primaryIcon: NotebookText },
]

export const itemsProvider: CategoryItemsProvider = {
  category: 'notes',
  pluginId: notes,
  buildItems: (actorState: any): ContributionItem[] => {
    const allNotes = actorState?.context?.notes || []
    return allNotes
      .filter((n: any) => n.noteType in NOTE_TYPE_TO_CONTRIBUTION_TYPE)
      .map((n: any) => ({
        id: n.id,
        shortCode: n.id,
        label: n.title || n.id,
        type: NOTE_TYPE_TO_CONTRIBUTION_TYPE[n.noteType] as string,
      }))
  },
}
