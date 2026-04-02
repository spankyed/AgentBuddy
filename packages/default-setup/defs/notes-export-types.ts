/**
 * Notes export types – Vendored from AgentBuddy
 * Source: packages/api/src/systems/notes/export-types.ts
 */

export interface ExportedNote {
  type: 'document' | 'tasklist' | 'task'
  title: string
  content: string
  icon: string | null
  completed: boolean
  hideCompletedChildren: boolean
  favorite: boolean
  children: ExportedNote[]
}

export interface ExportedNotes {
  version: number
  notes: ExportedNote[]
}
