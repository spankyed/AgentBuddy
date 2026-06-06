import { assign, setup, type ActorRefFrom } from 'xstate'
import breadcrumb, { breadcrumbList } from '@/core/breadcrumb'
import { safeEvents } from '@/core/types/safe-events'
import {
  targetIs,
  type TrailClickEvent,
} from '@/core/actors/route-trailer'
import type {
  OutgoingNotesEvents,
  NoteDTO,
} from '@app/api'
import { trpc } from '@/core/trpc'
import { Trash2 } from 'lucide-vue-next'
import { contextMenuFn } from '@/core/context-menu'
import { type NavHistory, createNavHistory, pushNavHistory, goBack, goForward, canGoBack, canGoForward } from '@/core/utils/nav-history'

export const id = 'notes'
export type NotesState = ActorRefFrom<typeof notesState>

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

type SystemEvent = OutgoingNotesEvents
  | { type: 'NOTES_IMPORTED'; count: number; errors?: string[] }
  | { type: 'NOTES_IMPORT_FAILED'; errors: string[] }
  | { type: 'NOTES_EXPORTED'; filePath: string; itemCount: number }
  | { type: 'NOTES_EXPORT_FAILED'; errors: string[] }

type UIEvent =
  | { type: 'NOTE.SELECT'; noteId: string }
  | { type: 'NOTE.OPEN'; noteId: string }
  | { type: 'NOTE.CREATE'; parentId?: string; title?: string; content?: string; displayOrder?: number }
  | { type: 'NOTE.CREATE_TASKLIST'; parentId?: string }
  | { type: 'NOTE.DELETE'; noteId: string }
  | { type: 'NOTE.SOFT_DELETE'; noteId: string }
  | { type: 'NOTE.RESTORE'; noteId: string }
  | { type: 'NOTE.UPDATE_CONTENT'; noteId: string; content: string }
  | { type: 'NOTE.UPDATE_TITLE'; noteId: string; title: string }
  | { type: 'NOTE.UPDATE_ICON'; noteId: string; icon: string | null }
  | { type: 'NOTE.TOGGLE_EXPAND'; nodeId: string }
  | { type: 'NOTE.LINK_CLICKED'; noteId: string }
  | { type: 'NOTE.REQUEST_DOCUMENT_INSERT'; parentId: string; cursorPos: number }
  | { type: 'NOTE.SEARCH'; query: string }
  | { type: 'NOTE.TOGGLE_SELECT'; noteId: string }
  | { type: 'NOTE.RANGE_SELECT'; noteIds: string[] }
  | { type: 'NOTE.CLEAR_SELECTION' }
  | { type: 'NOTE.MOVE'; noteIds: string[]; newParentId: string | null }
  | { type: 'NOTE.REORDER'; noteId: string; newParentId: string | null; newIndex: number }
  | { type: 'TASK.SELECT'; taskId: string }
  | { type: 'TASK.DESELECT' }
  | { type: 'TASK.CREATE'; parentId: string }
  | { type: 'TASK.DELETE'; taskId: string }
  | { type: 'TASK.TOGGLE_COMPLETE'; taskId: string }
  | { type: 'TASK.UPDATE_CONTENT'; taskId: string; content: string }
  | { type: 'TASK.UPDATE_TITLE'; taskId: string; title: string }
  | { type: 'TASK.TOGGLE_SHOW_COMPLETED' }
  | { type: 'TASK.TOGGLE_HIDE_COMPLETED_CHILDREN'; nodeId: string }
  | { type: 'TASK.TOGGLE_EXPAND'; nodeId: string }
  | { type: 'NOTE.TOGGLE_FAVORITE'; noteId: string }
  | { type: 'VIEW_WELCOME' }
  | { type: 'NOTES.IMPORT'; directory: string }
  | { type: 'NOTES.RESET_IMPORT_STATUS' }
  | { type: 'NOTES.EXPORT'; directory: string; format: 'markdown' | 'json' }
  | { type: 'NOTES.RESET_EXPORT_STATUS' }
  | { type: 'NOTE.SHOW_TRASH' }
  | { type: 'NOTE.HIDE_TRASH' }
  | { type: 'NOTE.PERMANENTLY_DELETE'; noteId: string }
  | { type: 'NOTE.EMPTY_TRASH' }
  | { type: 'NOTE.SAVE_SCROLL'; noteId: string; scrollTop: number }
  | { type: 'NOTE.TOGGLE_PANEL_SEARCH' }
  | { type: 'NAVIGATE_BACK' }
  | { type: 'NAVIGATE_FORWARD' }

type SettingsEvent =
  | { type: 'NOTES_SETTINGS_UPDATED'; settings: { tasklistPanelPosition: 'left' | 'right'; showCollapseIcon: boolean } }

export type NotesEvents = UIEvent | SystemEvent | TrailClickEvent | SettingsEvent
const typeOf = safeEvents<NotesEvents>()

function findNearestTaskList(notes: NoteDTO[], noteId: string): NoteDTO | null {
  let currentId: string | null = noteId
  while (currentId) {
    const note = notes.find(n => n.id === currentId)
    if (!note || !note.parentId) return null
    const parent = notes.find(n => n.id === note.parentId)
    if (!parent) return null
    if (parent.noteType === 'tasklist') return parent
    currentId = parent.id
  }
  return null
}

function getAncestorChain(notes: NoteDTO[], noteId: string): NoteDTO[] {
  const chain: NoteDTO[] = []
  let currentId: string | null = noteId

  while (currentId) {
    const note = notes.find(n => n.id === currentId)
    if (!note || !note.parentId) break
    const parent = notes.find(n => n.id === note.parentId)
    if (!parent) break
    chain.unshift(parent)
    currentId = parent.id
  }

  return chain
}

const notesState = setup({
  types: {
    context: {} as NotesContext,
    events: {} as NotesEvents,
  },
  actions: {
    setPluginData: assign(({ event }) => {
      const ev = typeOf('NOTES_CONNECTED', event)
      return {
        notes: ev.data.notes,
        settings: ev.data.settings,
      }
    }),

    selectNote: assign(({ event, context }) => {
      const noteId = (event as { noteId: string }).noteId
      const note = context.notes.find(n => n.id === noteId) || null
      const isHistoryNav = '_historyNav' in event

      // If selecting a note inside a tasklist, open the tasklist with this note selected
      if (note && note.noteType !== 'tasklist') {
        const taskList = findNearestTaskList(context.notes, noteId)
        if (taskList) {
          const ancestorIds = getAncestorChain(context.notes, taskList.id).map(n => n.id)
          const taskAncestors = getAncestorChain(context.notes, noteId)
          const taskListIndex = taskAncestors.findIndex(a => a.id === taskList.id)
          const intermediateIds = taskAncestors.slice(taskListIndex + 1).map(a => a.id)
          return {
            currentNoteId: taskList.id,
            currentNote: taskList,
            viewedNoteId: noteId,
            selectedNoteIds: [],
            selectedTaskId: noteId,
            selectedTask: note,
            expandedNodeIds: [...new Set([...context.expandedNodeIds, ...ancestorIds])],
            taskExpandedNodeIds: [...new Set([...context.taskExpandedNodeIds, ...intermediateIds, taskList.id])],
            ...(!isHistoryNav && { navHistory: pushNavHistory(context.navHistory, taskList.id) }),
          }
        }
      }

      const ancestorIds = getAncestorChain(context.notes, noteId).map(n => n.id)
      return {
        currentNoteId: noteId,
        currentNote: note,
        viewedNoteId: noteId,
        selectedNoteIds: [],
        selectedTaskId: null,
        selectedTask: null,
        expandedNodeIds: [...new Set([...context.expandedNodeIds, ...ancestorIds, noteId])],
        ...(!isHistoryNav && { navHistory: pushNavHistory(context.navHistory, noteId) }),
      }
    }),

    openNote: assign(({ event, context }) => {
      const noteId = (event as { noteId: string }).noteId
      const note = context.notes.find(n => n.id === noteId) || null
      const ancestorIds = getAncestorChain(context.notes, noteId).map(n => n.id)
      return {
        currentNoteId: noteId,
        currentNote: note,
        viewedNoteId: noteId,
        selectedNoteIds: [],
        selectedTaskId: null,
        selectedTask: null,
        expandedNodeIds: [...new Set([...context.expandedNodeIds, ...ancestorIds, noteId])],
        navHistory: pushNavHistory(context.navHistory, noteId),
      }
    }),

    sendViewNote: ({ context }) => {
      const noteId = context.viewedNoteId ?? context.currentNoteId
      if (noteId) {
        trpc.bus.send.mutate({
          systemId: id,
          type: 'VIEW_NOTE',
          id: noteId,
        })
      }
    },

    sendCreateNote: ({ event }) => {
      const ev = typeOf('NOTE.CREATE', event)
      trpc.bus.send.mutate({
        systemId: id,
        type: 'CREATE_NOTE',
        title: ev.title ?? 'Untitled',
        content: ev.content,
        parentId: ev.parentId,
        displayOrder: ev.displayOrder,
      })
    },

    sendDeleteNote: ({ event }) => {
      const ev = typeOf('NOTE.DELETE', event)
      trpc.bus.send.mutate({
        systemId: id,
        type: 'DELETE_NOTE',
        id: ev.noteId,
      })
    },

    sendSoftDeleteTask: ({ event }) => {
      const ev = typeOf('TASK.DELETE', event)
      trpc.bus.send.mutate({
        systemId: id,
        type: 'DELETE_NOTE',
        id: ev.taskId,
      })
    },

    sendSoftDeleteNote: ({ event }) => {
      const ev = typeOf('NOTE.SOFT_DELETE', event)
      trpc.bus.send.mutate({
        systemId: id,
        type: 'SOFT_DELETE_NOTE',
        id: ev.noteId,
      })
    },

    sendRestoreNote: ({ event }) => {
      const ev = typeOf('NOTE.RESTORE', event)
      trpc.bus.send.mutate({
        systemId: id,
        type: 'RESTORE_NOTE',
        id: ev.noteId,
      })
    },

    addRestoredNote: assign(({ context, event }) => {
      const ev = typeOf('NOTE_RESTORED', event)
      const exists = context.notes.some(n => n.id === ev.note.id)
      return {
        notes: exists ? context.notes : [...context.notes, ev.note],
        trashedNotes: context.trashedNotes.filter(n => n.id !== ev.note.id),
      }
    }),

    updateLocalContent: assign(({ context, event }) => {
      const ev = typeOf('NOTE.UPDATE_CONTENT', event)
      return {
        notes: context.notes.map(n =>
          n.id === ev.noteId ? { ...n, content: ev.content } : n
        ),
      }
    }),

    sendUpdateContent: ({ event }) => {
      const ev = typeOf('NOTE.UPDATE_CONTENT', event)
      trpc.bus.send.mutate({
        systemId: id,
        type: 'UPDATE_NOTE',
        id: ev.noteId,
        content: ev.content,
      })
    },

    updateLocalTitle: assign(({ context, event }) => {
      const ev = typeOf('NOTE.UPDATE_TITLE', event)
      const updatedNotes = context.notes.map(n =>
        n.id === ev.noteId ? { ...n, title: ev.title } : n
      )
      return {
        notes: updatedNotes,
        currentNote:
          context.currentNoteId === ev.noteId && context.currentNote
            ? { ...context.currentNote, title: ev.title }
            : context.currentNote,
      }
    }),

    sendUpdateTitle: ({ event }) => {
      const ev = typeOf('NOTE.UPDATE_TITLE', event)
      trpc.bus.send.mutate({
        systemId: id,
        type: 'UPDATE_NOTE',
        id: ev.noteId,
        title: ev.title,
      })
    },

    updateLocalIcon: assign(({ context, event }) => {
      const ev = typeOf('NOTE.UPDATE_ICON', event)
      const updatedNotes = context.notes.map(n =>
        n.id === ev.noteId ? { ...n, icon: ev.icon } : n
      )
      return {
        notes: updatedNotes,
        currentNote:
          context.currentNoteId === ev.noteId && context.currentNote
            ? { ...context.currentNote, icon: ev.icon }
            : context.currentNote,
      }
    }),

    sendUpdateIcon: ({ event }) => {
      const ev = typeOf('NOTE.UPDATE_ICON', event)
      trpc.bus.send.mutate({
        systemId: id,
        type: 'UPDATE_NOTE',
        id: ev.noteId,
        icon: ev.icon,
      })
    },

    toggleFavoriteLocal: assign(({ context, event }) => {
      const ev = typeOf('NOTE.TOGGLE_FAVORITE', event)
      const newFavorite = !context.notes.find(n => n.id === ev.noteId)?.favorite
      const updatedNotes = context.notes.map(n =>
        n.id === ev.noteId ? { ...n, favorite: newFavorite } : n
      )
      return {
        notes: updatedNotes,
        currentNote:
          context.currentNoteId === ev.noteId && context.currentNote
            ? { ...context.currentNote, favorite: newFavorite }
            : context.currentNote,
        selectedTask:
          context.selectedTaskId === ev.noteId && context.selectedTask
            ? { ...context.selectedTask, favorite: newFavorite }
            : context.selectedTask,
      }
    }),

    sendToggleFavorite: ({ event, context }) => {
      const ev = typeOf('NOTE.TOGGLE_FAVORITE', event)
      const note = context.notes.find(n => n.id === ev.noteId)
      if (!note) return
      trpc.bus.send.mutate({
        systemId: id,
        type: 'UPDATE_NOTE',
        id: ev.noteId,
        favorite: note.favorite,
      })
    },

    addCreatedNote: assign(({ context, event }) => {
      const ev = typeOf('NOTE_CREATED', event)
      const updatedNotes = [...context.notes, ev.note]
      const ancestorIds = getAncestorChain(updatedNotes, ev.note.id).map(n => n.id)
      return {
        notes: updatedNotes,
        currentNoteId: ev.note.id,
        currentNote: ev.note,
        selectedTaskId: null,
        selectedTask: null,
        expandedNodeIds: [...new Set([...context.expandedNodeIds, ...ancestorIds])],
        navHistory: pushNavHistory(context.navHistory, ev.note.id),
      }
    }),

    handleSubDocumentInsertCreated: assign(({ context, event }) => {
      const ev = typeOf('NOTE_CREATED', event)
      // Only handle if there's a pending sub-document insert and the new note has a parent
      if (!context.pendingSubDocumentInsert || !ev.note.parentId) return {}
      const validParentId = context.selectedTaskId ?? context.currentNoteId
      if (ev.note.parentId !== validParentId) return {}

      // Clear pending flag and store the created child's ID so the canvas
      // component can insert the link without guessing by timestamp
      return {
        notes: [...context.notes, ev.note],
        pendingSubDocumentInsert: null,
        lastSubDocumentInsertChildId: ev.note.id,
      }
    }),

    updateNoteInList: assign(({ context, event }) => {
      const ev = typeOf('NOTE_UPDATED', event)
      const updatedNotes = context.notes.map(n =>
        n.id === ev.note.id ? ev.note : n
      )
      return {
        notes: updatedNotes,
        currentNote: context.currentNoteId === ev.note.id ? ev.note : context.currentNote,
        selectedTask: context.selectedTaskId === ev.note.id ? ev.note : context.selectedTask,
      }
    }),

    removeDeletedNote: assign(({ context, event }) => {
      const ev = typeOf('NOTE_DELETED', event)
      const updatedNotes = context.notes.filter(n => n.id !== ev.noteId)
      const wasCurrentNote = context.currentNoteId === ev.noteId
      const wasSelectedTask = context.selectedTaskId === ev.noteId
      return {
        notes: updatedNotes,
        currentNoteId: wasCurrentNote ? null : context.currentNoteId,
        currentNote: wasCurrentNote ? null : context.currentNote,
        selectedNoteIds: context.selectedNoteIds.filter(id => id !== ev.noteId),
        selectedTaskId: wasSelectedTask ? null : context.selectedTaskId,
        selectedTask: wasSelectedTask ? null : context.selectedTask,
      }
    }),

    toggleExpand: assign(({ context, event }) => {
      const ev = typeOf('NOTE.TOGGLE_EXPAND', event)
      const isExpanded = context.expandedNodeIds.includes(ev.nodeId)
      return {
        expandedNodeIds: isExpanded
          ? context.expandedNodeIds.filter(id => id !== ev.nodeId)
          : [...context.expandedNodeIds, ev.nodeId],
      }
    }),

    toggleExpandTask: assign(({ context, event }) => {
      const ev = typeOf('TASK.TOGGLE_EXPAND', event)
      const isExpanded = context.taskExpandedNodeIds.includes(ev.nodeId)
      return {
        taskExpandedNodeIds: isExpanded
          ? context.taskExpandedNodeIds.filter(id => id !== ev.nodeId)
          : [...context.taskExpandedNodeIds, ev.nodeId],
      }
    }),

    requestSubDocumentInsert: assign(({ event }) => {
      const ev = typeOf('NOTE.REQUEST_DOCUMENT_INSERT', event)
      return {
        pendingSubDocumentInsert: { cursorPos: ev.cursorPos },
      }
    }),

    sendCreateChildForSubDocumentInsert: ({ event }) => {
      const ev = typeOf('NOTE.REQUEST_DOCUMENT_INSERT', event)
      trpc.bus.send.mutate({
        systemId: id,
        type: 'CREATE_NOTE',
        title: 'Untitled',
        parentId: ev.parentId,
        skipContentSync: true,
      })
    },

    sendSearchNotes: ({ event }) => {
      const ev = typeOf('NOTE.SEARCH', event)
      trpc.bus.send.mutate({
        systemId: id,
        type: 'SEARCH_NOTES',
        query: ev.query,
      })
    },

    setSearchResults: assign(({ event }) => {
      const ev = typeOf('NOTES_SEARCH_RESULTS', event)
      return { searchResults: ev.results }
    }),

    toggleSelect: assign(({ context, event }) => {
      const ev = typeOf('NOTE.TOGGLE_SELECT', event)
      const ids = context.selectedNoteIds
      const exists = ids.includes(ev.noteId)
      return {
        selectedNoteIds: exists
          ? ids.filter(id => id !== ev.noteId)
          : [...ids, ev.noteId],
      }
    }),

    rangeSelect: assign(({ event }) => {
      const ev = typeOf('NOTE.RANGE_SELECT', event)
      return { selectedNoteIds: ev.noteIds }
    }),

    clearSelection: assign({ selectedNoteIds: [] }),

    sendMoveNotes: ({ event }) => {
      const ev = typeOf('NOTE.MOVE', event)
      trpc.bus.send.mutate({
        systemId: id,
        type: 'MOVE_NOTE',
        ids: ev.noteIds,
        newParentId: ev.newParentId,
      })
    },

    sendReorderNote: ({ event }) => {
      const ev = typeOf('NOTE.REORDER', event)
      trpc.bus.send.mutate({
        systemId: id,
        type: 'REORDER_NOTE',
        id: ev.noteId,
        newParentId: ev.newParentId,
        newIndex: ev.newIndex,
      })
    },

    sendCreateTaskList: ({ event }) => {
      const ev = typeOf('NOTE.CREATE_TASKLIST', event)
      trpc.bus.send.mutate({
        systemId: id,
        type: 'CREATE_NOTE',
        title: 'Untitled',
        noteType: 'tasklist',
        parentId: ev.parentId,
      })
    },

    selectTask: assign(({ event, context }) => {
      const ev = typeOf('TASK.SELECT', event)
      const task = context.notes.find(n => n.id === ev.taskId) || null
      return {
        selectedTaskId: ev.taskId,
        selectedTask: task,
      }
    }),

    deselectTask: assign({
      selectedTaskId: null,
      selectedTask: null,
    }),

    sendCreateTask: ({ event }) => {
      const ev = typeOf('TASK.CREATE', event)
      trpc.bus.send.mutate({
        systemId: id,
        type: 'CREATE_NOTE',
        title: 'Untitled',
        parentId: ev.parentId,
        skipContentSync: true,
        noteType: 'task',
      })
    },

    sendToggleComplete: ({ event, context }) => {
      const ev = typeOf('TASK.TOGGLE_COMPLETE', event)
      const task = context.notes.find(n => n.id === ev.taskId)
      if (!task) return
      trpc.bus.send.mutate({
        systemId: id,
        type: 'UPDATE_NOTE',
        id: ev.taskId,
        completed: !task.completed,
      })
    },

    sendTaskUpdateContent: ({ event }) => {
      const ev = typeOf('TASK.UPDATE_CONTENT', event)
      trpc.bus.send.mutate({
        systemId: id,
        type: 'UPDATE_NOTE',
        id: ev.taskId,
        content: ev.content,
      })
    },

    updateLocalTaskContent: assign(({ context, event }) => {
      const ev = typeOf('TASK.UPDATE_CONTENT', event)
      return {
        notes: context.notes.map(n =>
          n.id === ev.taskId ? { ...n, content: ev.content } : n
        ),
      }
    }),

    updateLocalTaskTitle: assign(({ context, event }) => {
      const ev = typeOf('TASK.UPDATE_TITLE', event)
      const updatedNotes = context.notes.map(n =>
        n.id === ev.taskId ? { ...n, title: ev.title } : n
      )
      return {
        notes: updatedNotes,
        selectedTask:
          context.selectedTaskId === ev.taskId && context.selectedTask
            ? { ...context.selectedTask, title: ev.title }
            : context.selectedTask,
      }
    }),

    sendTaskUpdateTitle: ({ event }) => {
      const ev = typeOf('TASK.UPDATE_TITLE', event)
      trpc.bus.send.mutate({
        systemId: id,
        type: 'UPDATE_NOTE',
        id: ev.taskId,
        title: ev.title,
      })
    },

    sendDeleteTask: ({ event }) => {
      const ev = typeOf('TASK.DELETE', event)
      trpc.bus.send.mutate({
        systemId: id,
        type: 'DELETE_NOTE',
        id: ev.taskId,
      })
    },

    sendToggleShowCompleted: ({ context }) => {
      if (!context.currentNoteId) return
      const note = context.notes.find(n => n.id === context.currentNoteId)
      if (!note) return
      trpc.bus.send.mutate({
        systemId: id,
        type: 'UPDATE_NOTE',
        id: context.currentNoteId,
        hideCompletedChildren: !note.hideCompletedChildren,
      })
    },

    sendToggleHideCompletedChildren: ({ event, context }) => {
      const ev = typeOf('TASK.TOGGLE_HIDE_COMPLETED_CHILDREN', event)
      const note = context.notes.find(n => n.id === ev.nodeId)
      if (!note) return
      trpc.bus.send.mutate({
        systemId: id,
        type: 'UPDATE_NOTE',
        id: ev.nodeId,
        hideCompletedChildren: !note.hideCompletedChildren,
      })
    },

    clearCurrentNote: assign(({ context }) => ({
      currentNoteId: null,
      currentNote: null,
      navHistory: pushNavHistory(context.navHistory, null),
    })),

    /* ── Notes Import actions ────────────────────────────── */
    setImportingNotes: assign(({ context }) => ({
      notesImport: {
        ...context.notesImport,
        status: 'importing' as const,
      },
    })),

    sendImportNotes: ({ event }) => {
      if (event.type === 'NOTES.IMPORT') {
        trpc.bus.send.mutate({
          systemId: id,
          type: 'IMPORT_NOTES',
          directory: event.directory,
        } as any)
      }
    },

    handleNotesImported: assign(({ event }) => {
      if (event.type === 'NOTES_IMPORTED') {
        return {
          notesImport: {
            status: 'success' as const,
            errors: event.errors || [],
            importedCount: event.count,
          },
        }
      }
      return {}
    }),

    handleNotesImportFailed: assign(({ event }) => {
      if (event.type === 'NOTES_IMPORT_FAILED') {
        return {
          notesImport: {
            status: 'error' as const,
            errors: event.errors,
            importedCount: 0,
          },
        }
      }
      return {}
    }),

    resetImportNotesStatus: assign({
      notesImport: { status: 'idle' as const, errors: [] as string[], importedCount: 0 },
    }),

    /* ── Notes Export actions ────────────────────────────── */
    setExportingNotes: assign(({ context }) => ({
      notesExport: {
        ...context.notesExport,
        status: 'exporting' as const,
      },
    })),

    sendExportNotes: ({ event }) => {
      if (event.type === 'NOTES.EXPORT') {
        trpc.bus.send.mutate({
          systemId: id,
          type: 'EXPORT_NOTES',
          directory: event.directory,
          format: event.format,
        } as any)
      }
    },

    handleNotesExported: assign(({ event }) => {
      if (event.type === 'NOTES_EXPORTED') {
        return {
          notesExport: {
            status: 'success' as const,
            errors: [] as string[],
            filePath: event.filePath,
            itemCount: event.itemCount,
          },
        }
      }
      return {}
    }),

    handleNotesExportFailed: assign(({ event }) => {
      if (event.type === 'NOTES_EXPORT_FAILED') {
        return {
          notesExport: {
            status: 'error' as const,
            errors: event.errors,
            filePath: '',
            itemCount: 0,
          },
        }
      }
      return {}
    }),

    resetExportNotesStatus: assign({
      notesExport: { status: 'idle' as const, errors: [] as string[], filePath: '', itemCount: 0 },
    }),

    handleSettingsUpdate: assign(({ event }) => {
      const ev = typeOf('NOTES_SETTINGS_UPDATED', event)
      return { settings: ev.settings }
    }),

    showTrash: assign({ showTrash: true, trashedNotes: [] }),

    requestTrashedNotes: () => {
      trpc.bus.send.mutate({
        systemId: id,
        type: 'GET_TRASHED_NOTES',
      })
    },

    hideTrash: assign({ showTrash: false, trashedNotes: [] }),

    setTrashedNotes: assign(({ event }) => {
      const ev = typeOf('TRASHED_NOTES', event)
      return { trashedNotes: ev.notes }
    }),

    sendPermanentlyDelete: ({ event }) => {
      const ev = typeOf('NOTE.PERMANENTLY_DELETE', event)
      trpc.bus.send.mutate({
        systemId: id,
        type: 'PERMANENTLY_DELETE_NOTE',
        id: ev.noteId,
      })
    },

    removeTrashedNote: assign(({ context, event }) => {
      const ev = typeOf('NOTE_DELETED', event)
      return {
        trashedNotes: context.trashedNotes.filter(n => n.id !== ev.noteId),
      }
    }),

    sendEmptyTrash: () => {
      trpc.bus.send.mutate({
        systemId: id,
        type: 'EMPTY_TRASH',
      })
    },

    saveScroll: assign(({ context, event }) => {
      const ev = typeOf('NOTE.SAVE_SCROLL', event)
      return {
        noteScrollPositions: { ...context.noteScrollPositions, [ev.noteId]: ev.scrollTop },
      }
    }),

    togglePanelSearch: assign(({ context }) => ({
      panelSearchActive: !context.panelSearchActive,
    })),
  },
  guards: { targetIs },
}).createMachine({
  id,
  initial: 'welcome',
  context: {
    notes: [],
    currentNoteId: null,
    currentNote: null,
    expandedNodeIds: [],
    taskExpandedNodeIds: [],
    pendingSubDocumentInsert: null,
    lastSubDocumentInsertChildId: null,
    searchResults: [],
    selectedNoteIds: [],
    selectedTaskId: null,
    selectedTask: null,
    settings: { tasklistPanelPosition: 'left' as const, showCollapseIcon: false },
    notesImport: { status: 'idle' as const, errors: [], importedCount: 0 },
    notesExport: { status: 'idle' as const, errors: [], filePath: '', itemCount: 0 },
    showTrash: false,
    trashedNotes: [],
    noteScrollPositions: {},
    panelSearchActive: false,
    navHistory: createNavHistory<string | null>(null),
    viewedNoteId: null,
  },
  on: {
    NOTES_CONNECTED: { actions: 'setPluginData' },
    NOTES_SETTINGS_UPDATED: { actions: 'handleSettingsUpdate' },
    NOTE_UPDATED: { actions: 'updateNoteInList' },
    NOTE_RESTORED: { actions: 'addRestoredNote' },
    'NOTE.SOFT_DELETE': { actions: 'sendSoftDeleteNote' },
    'NOTE.RESTORE': { actions: 'sendRestoreNote' },
    NOTE_DELETED: [
      {
        guard: ({ context }) => context.showTrash,
        actions: 'removeTrashedNote',
      },
      {
        guard: ({ context, event }) => {
          const ev = typeOf('NOTE_DELETED', event)
          return context.currentNoteId === ev.noteId
        },
        actions: 'removeDeletedNote',
        target: '.welcome',
      },
      {
        actions: 'removeDeletedNote',
      },
    ],
    'NOTE.TOGGLE_EXPAND': { actions: 'toggleExpand' },
    'TASK.TOGGLE_EXPAND': { actions: 'toggleExpandTask' },
    'NOTE.TOGGLE_SELECT': { actions: 'toggleSelect' },
    'NOTE.RANGE_SELECT': { actions: 'rangeSelect' },
    'NOTE.CLEAR_SELECTION': { actions: 'clearSelection' },
    'NOTE.MOVE': { actions: ['sendMoveNotes', 'clearSelection'] },
    'NOTE.REORDER': { actions: ['sendReorderNote', 'clearSelection'] },
    'NOTE.UPDATE_CONTENT': { actions: ['updateLocalContent', 'sendUpdateContent'] },
    'NOTE.UPDATE_TITLE': { actions: ['updateLocalTitle', 'sendUpdateTitle'] },
    'NOTE.UPDATE_ICON': { actions: ['updateLocalIcon', 'sendUpdateIcon'] },
    'NOTE.TOGGLE_FAVORITE': { actions: ['toggleFavoriteLocal', 'sendToggleFavorite'] },
    'TASK.SELECT': { actions: 'selectTask' },
    'TASK.DESELECT': { actions: 'deselectTask' },
    'TASK.TOGGLE_COMPLETE': { actions: 'sendToggleComplete' },
    'TASK.UPDATE_CONTENT': { actions: ['updateLocalTaskContent', 'sendTaskUpdateContent'] },
    'TASK.UPDATE_TITLE': { actions: ['updateLocalTaskTitle', 'sendTaskUpdateTitle'] },
    'TASK.DELETE': { actions: 'sendSoftDeleteTask' },
    'TASK.TOGGLE_SHOW_COMPLETED': { actions: 'sendToggleShowCompleted' },
    'TASK.TOGGLE_HIDE_COMPLETED_CHILDREN': { actions: 'sendToggleHideCompletedChildren' },
    'NOTES.IMPORT': { actions: ['setImportingNotes', 'sendImportNotes'] },
    'NOTES.RESET_IMPORT_STATUS': { actions: 'resetImportNotesStatus' },
    NOTES_IMPORTED: { actions: 'handleNotesImported' },
    NOTES_IMPORT_FAILED: { actions: 'handleNotesImportFailed' },
    'NOTES.EXPORT': { actions: ['setExportingNotes', 'sendExportNotes'] },
    'NOTES.RESET_EXPORT_STATUS': { actions: 'resetExportNotesStatus' },
    NOTES_EXPORTED: { actions: 'handleNotesExported' },
    NOTES_EXPORT_FAILED: { actions: 'handleNotesExportFailed' },
    'NOTE.SHOW_TRASH': { actions: ['showTrash', 'requestTrashedNotes'] },
    'NOTE.HIDE_TRASH': { actions: 'hideTrash' },
    'NOTE.PERMANENTLY_DELETE': { actions: 'sendPermanentlyDelete' },
    'NOTE.EMPTY_TRASH': { actions: 'sendEmptyTrash' },
    'NOTE.SAVE_SCROLL': { actions: 'saveScroll' },
    'NOTE.TOGGLE_PANEL_SEARCH': { actions: 'togglePanelSearch' },
    TRASHED_NOTES: { actions: 'setTrashedNotes' },
    NAVIGATE_BACK: [
      {
        guard: ({ context }) => {
          if (!canGoBack(context.navHistory)) return false;
          return context.navHistory.stack[context.navHistory.index - 1] === null;
        },
        target: '.welcome',
        actions: assign(({ context }) => {
          const result = goBack(context.navHistory)!;
          return { navHistory: result.history, currentNoteId: null, currentNote: null };
        }),
      },
      {
        guard: ({ context }) => {
          if (!canGoBack(context.navHistory)) return false;
          const target = context.navHistory.stack[context.navHistory.index - 1];
          return target !== null && context.notes.some(n => n.id === target);
        },
        target: '.editor',
        actions: assign(({ context }) => {
          const result = goBack(context.navHistory)!;
          const note = context.notes.find(n => n.id === result.entry) || null;
          return {
            navHistory: result.history,
            currentNoteId: result.entry,
            currentNote: note,
            selectedTaskId: null,
            selectedTask: null,
          };
        }),
      },
    ],
    NAVIGATE_FORWARD: [
      {
        guard: ({ context }) => {
          if (!canGoForward(context.navHistory)) return false;
          return context.navHistory.stack[context.navHistory.index + 1] === null;
        },
        target: '.welcome',
        actions: assign(({ context }) => {
          const result = goForward(context.navHistory)!;
          return { navHistory: result.history, currentNoteId: null, currentNote: null };
        }),
      },
      {
        guard: ({ context }) => {
          if (!canGoForward(context.navHistory)) return false;
          const target = context.navHistory.stack[context.navHistory.index + 1];
          return target !== null && context.notes.some(n => n.id === target);
        },
        target: '.editor',
        actions: assign(({ context }) => {
          const result = goForward(context.navHistory)!;
          const note = context.notes.find(n => n.id === result.entry) || null;
          return {
            navHistory: result.history,
            currentNoteId: result.entry,
            currentNote: note,
            selectedTaskId: null,
            selectedTask: null,
          };
        }),
      },
    ],
    TRAIL_CLICK: [
      {
        guard: { type: 'targetIs', params: { view: 'welcome' } },
        target: '.welcome',
        actions: 'clearCurrentNote',
      },
      {
        guard: { type: 'targetIs', params: { view: 'editor' } },
        target: '.editor',
        actions: [
          assign(({ event, context }) => {
            const noteId = (event as TrailClickEvent).info
            if (!noteId) return {}
            const note = context.notes.find(n => n.id === noteId) || null

            // If clicking a task segment, navigate to its parent tasklist and select the task
            if (note?.noteType === 'task') {
              const taskList = findNearestTaskList(context.notes, noteId)
              if (taskList) {
                return {
                  currentNoteId: taskList.id,
                  currentNote: taskList,
                  viewedNoteId: noteId,
                  selectedTaskId: noteId,
                  selectedTask: note,
                  navHistory: pushNavHistory(context.navHistory, taskList.id),
                }
              }
            }

            // Regular note or tasklist — navigate directly, clear task selection
            return {
              currentNoteId: noteId,
              currentNote: note,
              viewedNoteId: noteId,
              selectedTaskId: null,
              selectedTask: null,
              navHistory: pushNavHistory(context.navHistory, noteId),
            }
          }),
          'sendViewNote',
        ],
      },
    ],
  },
  states: {
    welcome: {
      tags: ['welcome'],
      entry: assign({ searchResults: [] }),
      meta: { ...breadcrumb('welcome', 'Notes', true) },
      on: {
        'NOTE.CREATE': {
          actions: 'sendCreateNote',
        },
        'NOTE.CREATE_TASKLIST': {
          actions: 'sendCreateTaskList',
        },
        'TASK.CREATE': {
          actions: 'sendCreateTask',
        },
        NOTE_CREATED: [
          {
            guard: ({ event, context }) => {
              const ev = typeOf('NOTE_CREATED', event)
              const updatedNotes = [...context.notes, ev.note]
              return findNearestTaskList(updatedNotes, ev.note.id) !== null
            },
            actions: [
              assign(({ context, event }) => {
                const ev = typeOf('NOTE_CREATED', event)
                const taskList = findNearestTaskList([...context.notes, ev.note], ev.note.id)
                if (!taskList) return { notes: [...context.notes, ev.note] }
                const ancestorIds = getAncestorChain([...context.notes, ev.note], taskList.id).map(n => n.id)
                return {
                  notes: [...context.notes, ev.note],
                  currentNoteId: taskList.id,
                  currentNote: taskList,
                  viewedNoteId: ev.note.id,
                  selectedTaskId: ev.note.id,
                  selectedTask: ev.note,
                  taskExpandedNodeIds: [...new Set([...context.taskExpandedNodeIds, ...ancestorIds, taskList.id])],
                }
              }),
              'sendViewNote',
            ],
            target: 'editor',
          },
          {
            actions: 'addCreatedNote',
            target: 'editor',
          },
        ],
        'NOTE.SELECT': {
          actions: ['selectNote', 'sendViewNote'],
          target: 'editor',
        },
        'NOTE.OPEN': {
          actions: ['openNote', 'sendViewNote'],
          target: 'editor',
        },
        'NOTE.DELETE': {
          actions: 'sendDeleteNote',
        },
        'NOTE.SEARCH': {
          actions: 'sendSearchNotes',
        },
        NOTES_SEARCH_RESULTS: {
          actions: 'setSearchResults',
        },
      },
    },
    editor: {
      tags: ['editor'],
      meta: {
        ...breadcrumbList<NotesContext>((ctx) => {
          if (!ctx.currentNoteId || !ctx.currentNote) {
            return []
          }
          const ancestors = getAncestorChain(ctx.notes, ctx.currentNoteId)
          const crumbs = [
            ...ancestors.map(a => ({ label: (a.icon ? a.icon + ' ' : '') + a.title, target: 'editor', info: a.id })),
            { label: (ctx.currentNote.icon ? ctx.currentNote.icon + ' ' : '') + ctx.currentNote.title, target: 'editor', info: ctx.currentNoteId },
          ]
          if (ctx.selectedTask) {
            // Build full path from tasklist to selected task (including intermediate parent tasks)
            const taskAncestors = getAncestorChain(ctx.notes, ctx.selectedTask.id)
            const taskListIndex = taskAncestors.findIndex(a => a.id === ctx.currentNoteId)
            const intermediates = taskAncestors.slice(taskListIndex + 1)
            for (const t of intermediates) {
              crumbs.push({ label: (t.icon ? t.icon + ' ' : '') + t.title, target: 'editor', info: t.id })
            }
            crumbs.push({
              label: (ctx.selectedTask.icon ? ctx.selectedTask.icon + ' ' : '') + ctx.selectedTask.title,
              target: 'editor',
              info: ctx.selectedTask.id,
            })
          }
          return crumbs
        }),
        ...contextMenuFn<NotesContext>((ctx) => {
          const deleteId = ctx.selectedTaskId ?? ctx.currentNoteId
          if (!deleteId) return []
          const deleteTitle = (ctx.selectedTask ?? ctx.currentNote)?.title || 'this note'
          return [
            {
              label: 'Delete Note',
              icon: Trash2,
              iconColor: 'text-red-400',
              event: { type: 'NOTE.DELETE' as const, noteId: deleteId },
              confirm: `Are you sure you want to delete "${deleteTitle}"?`,
            },
          ]
        }),
      },
      on: {
        'NOTE.SELECT': {
          actions: ['selectNote', 'sendViewNote'],
        },
        'NOTE.OPEN': {
          actions: ['openNote', 'sendViewNote'],
        },
        'NOTE.CREATE': {
          actions: 'sendCreateNote',
        },
        'NOTE.CREATE_TASKLIST': {
          actions: 'sendCreateTaskList',
        },
        'TASK.CREATE': {
          actions: 'sendCreateTask',
        },
        NOTE_CREATED: [
          {
            guard: ({ context }) => context.pendingSubDocumentInsert !== null,
            actions: 'handleSubDocumentInsertCreated',
          },
          {
            // If the new note's parent is the current tasklist, add to list but don't navigate
            guard: ({ context, event }) => {
              const ev = typeOf('NOTE_CREATED', event)
              const updatedNotes = [...context.notes, ev.note]
              return context.currentNote?.noteType === 'tasklist'
                && findNearestTaskList(updatedNotes, ev.note.id)?.id === context.currentNoteId
            },
            actions: assign(({ context, event }) => {
              const ev = typeOf('NOTE_CREATED', event)
              const updatedNotes = [...context.notes, ev.note]
              const taskAncestors = getAncestorChain(updatedNotes, ev.note.id)
              const taskListIndex = taskAncestors.findIndex(a => a.id === context.currentNoteId)
              const intermediateIds = taskAncestors.slice(taskListIndex + 1).map(a => a.id)
              return {
                notes: updatedNotes,
                selectedTaskId: ev.note.id,
                selectedTask: ev.note,
                taskExpandedNodeIds: [...new Set([...context.taskExpandedNodeIds, ...intermediateIds, ...(context.currentNoteId ? [context.currentNoteId] : [])])],
              }
            }),
          },
          {
            // Note created for a tasklist that isn't currently viewed — navigate to it
            guard: ({ context, event }) => {
              const ev = typeOf('NOTE_CREATED', event)
              const updatedNotes = [...context.notes, ev.note]
              return findNearestTaskList(updatedNotes, ev.note.id) !== null
            },
            actions: [
              assign(({ context, event }) => {
                const ev = typeOf('NOTE_CREATED', event)
                const updatedNotes = [...context.notes, ev.note]
                const taskList = findNearestTaskList(updatedNotes, ev.note.id)
                if (!taskList) return { notes: updatedNotes }
                const ancestorIds = getAncestorChain(updatedNotes, taskList.id).map(n => n.id)
                const taskAncestors = getAncestorChain(updatedNotes, ev.note.id)
                const taskListIndex = taskAncestors.findIndex(a => a.id === taskList.id)
                const intermediateIds = taskAncestors.slice(taskListIndex + 1).map(a => a.id)
                return {
                  notes: updatedNotes,
                  currentNoteId: taskList.id,
                  currentNote: taskList,
                  viewedNoteId: ev.note.id,
                  selectedTaskId: ev.note.id,
                  selectedTask: ev.note,
                  taskExpandedNodeIds: [...new Set([...context.taskExpandedNodeIds, ...ancestorIds, ...intermediateIds, taskList.id])],
                }
              }),
              'sendViewNote',
            ],
          },
          {
            actions: 'addCreatedNote',
          },
        ],
        'NOTE.DELETE': {
          actions: 'sendDeleteNote',
        },
        'NOTE.LINK_CLICKED': {
          actions: ['selectNote', 'sendViewNote'],
        },
        'NOTE.REQUEST_DOCUMENT_INSERT': {
          actions: ['requestSubDocumentInsert', 'sendCreateChildForSubDocumentInsert'],
        },
        'VIEW_WELCOME': {
          actions: 'clearCurrentNote',
          target: 'welcome',
        },
      },
    },
  },
})

export default notesState
