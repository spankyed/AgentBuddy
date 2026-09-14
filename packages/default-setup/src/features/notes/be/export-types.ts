export interface ExportedNote {
  id?: string
  type: 'document' | 'tasklist' | 'task'
  title: string
  content: string
  icon: string | null
  completed: boolean
  hideCompletedChildren: boolean
  favorite: boolean
  displayOrder?: number
  savedDisplayOrder?: number
  children: ExportedNote[]
}

export interface ExportedNotes {
  version: number
  notes: ExportedNote[]
}

export type NotesExportFormat = 'markdown' | 'json'
