import { History, Library, Folder, NotebookText, CircleCheck, ListChecks } from 'lucide-vue-next'
import type { Component } from 'vue'
import { navigateToPlugin } from '@/core/utils/navigate'

type SvgElement = ['path', { d: string }] | ['rect', Record<string, string>] | ['circle', Record<string, string>]

export interface RefTypeConfig {
  protocol: string
  category: ReferenceCategory
  plugin: string
  icon: Component
  svgElements: SvgElement[]
  navigate: (system: any, refId: string) => void
}

export const REF_TYPES = {
  thread: {
    protocol: 'thread',
    category: 'threads',
    plugin: 'threads',
    icon: History,
    svgElements: [
      ['path', { d: 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8' }],
      ['path', { d: 'M3 3v5h5' }],
      ['path', { d: 'M12 7v5l4 2' }],
    ],
    navigate: (_system: any, refId: string) => {
      navigateToPlugin('threads', { type: 'SELECT_THREAD', id: refId })
    },
  },
  document: {
    protocol: 'doc',
    category: 'documents',
    plugin: 'library',
    icon: Library,
    svgElements: [
      ['path', { d: 'm16 6 4 14' }],
      ['path', { d: 'M12 6v14' }],
      ['path', { d: 'M8 8v12' }],
      ['path', { d: 'M4 4v16' }],
    ],
    navigate: (_system: any, refId: string) => {
      navigateToPlugin('library', { type: 'EDIT_DOCUMENT', documentId: refId })
    },
  },
  folder: {
    protocol: 'folder',
    category: 'documents',
    plugin: 'library',
    icon: Folder,
    svgElements: [
      ['path', { d: 'M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z' }],
    ],
    navigate: (_system: any, refId: string) => {
      navigateToPlugin('library', { type: 'NAVIGATE_TO_FOLDER', folderId: refId })
    },
  },
  note: {
    protocol: 'note',
    category: 'notes',
    plugin: 'notes',
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
      navigateToPlugin('notes', { type: 'NOTE.OPEN', noteId: refId })
    },
  },
  task: {
    protocol: 'task',
    category: 'notes',
    plugin: 'notes',
    icon: CircleCheck,
    svgElements: [
      ['circle', { cx: '12', cy: '12', r: '10' }],
      ['path', { d: 'm9 12 2 2 4-4' }],
    ],
    navigate: (_system: any, refId: string) => {
      navigateToPlugin('notes', { type: 'NOTE.OPEN', noteId: refId })
    },
  },
  tasklist: {
    protocol: 'tasklist',
    category: 'notes',
    plugin: 'notes',
    icon: ListChecks,
    svgElements: [
      ['path', { d: 'm3 17 2 2 4-4' }],
      ['path', { d: 'm3 7 2 2 4-4' }],
      ['path', { d: 'M13 6h8' }],
      ['path', { d: 'M13 12h8' }],
      ['path', { d: 'M13 18h8' }],
    ],
    navigate: (_system: any, refId: string) => {
      navigateToPlugin('notes', { type: 'NOTE.OPEN', noteId: refId })
    },
  },
} as const satisfies Record<string, RefTypeConfig>

export type ReferenceRefType = keyof typeof REF_TYPES

export type ReferenceCategory = 'threads' | 'documents' | 'notes'

export const PROTOCOL_TO_TYPE: Record<string, ReferenceRefType> = Object.fromEntries(
  Object.entries(REF_TYPES).map(([type, cfg]) => [cfg.protocol, type as ReferenceRefType])
) as Record<string, ReferenceRefType>

export const ALL_PROTOCOLS: string[] = Object.values(REF_TYPES).map((cfg) => cfg.protocol)

export function categoryOfType(type: ReferenceRefType): ReferenceCategory {
  return REF_TYPES[type].category
}

export const CATEGORIES: { id: ReferenceCategory; label: string; primaryIcon: Component }[] = [
  { id: 'threads', label: 'Threads', primaryIcon: History },
  { id: 'documents', label: 'Library', primaryIcon: Library },
  { id: 'notes', label: 'Notes', primaryIcon: NotebookText },
]

export const NOTE_TYPE_TO_REF_TYPE: Record<string, ReferenceRefType> = {
  document: 'note',
  task: 'task',
  tasklist: 'tasklist',
}
