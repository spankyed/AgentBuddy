// The notes plugin's contract: the state it publishes and what other plugins may send it.
//
// A leaf: it imports no machine, no other feature and nothing from `#generated/*` but `types` and `ears`, which is
// what lets codegen read the contract without resolving the machine — whose own imports cycle back through
// `#generated/events`. `abuddy.json` names it at `features[].plugin.contract`.
import type { NavHistory, PluginInbox } from '@abuddy/sdk/fe'
import type { NoteDTO } from '@/__generated__/types'

export interface NotesContext {
  notes: NoteDTO[]
  currentNoteId: string | null
  currentNote: NoteDTO | null
  expandedNodeIds: string[]
  taskExpandedNodeIds: string[]
  pendingSubDocumentInsert: { cursorPos: number } | null
  lastSubDocumentInsertChildId: string | null
  searchResults: NoteDTO[]
  selectedNoteIds: string[]
  selectedTaskId: string | null
  selectedTask: NoteDTO | null
  settings: { tasklistPanelPosition: 'left' | 'right'; showCollapseIcon: boolean }
  notesImport: { status: 'idle' | 'importing' | 'success' | 'error'; errors: string[]; importedCount: number }
  notesExport: { status: 'idle' | 'exporting' | 'success' | 'error'; errors: string[]; filePath: string; itemCount: number }
  showTrash: boolean
  trashedNotes: NoteDTO[]
  noteScrollPositions: Record<string, number>
  panelSearchActive: boolean
  navHistory: NavHistory<string | null>
  viewedNoteId: string | null
}

/** Where an editor link to a note, task or task list lands */
export type NotesInboxEvent = { type: 'NOTE.OPEN'; noteId: string }

export type Contract = {
  state: NotesContext
  inbox: PluginInbox<{ pack: NotesInboxEvent }>
}
