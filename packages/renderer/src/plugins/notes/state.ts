import { assign, setup, type ActorRefFrom } from 'xstate'
import breadcrumb, { breadcrumbList } from '@/core/breadcrumb'
import { safeEvents } from '@/core/types/safe-events'
import {
  targetIs,
  TRAIL_CLICK,
  type TrailClickEvent,
} from '@/core/actors/route-trailer'
import type {
  OutgoingNotesEvents,
  NoteDTO,
} from '@app/api'
import { trpc } from '@/core/trpc'
import { Trash2 } from 'lucide-vue-next'
import { contextMenuFn } from '@/core/context-menu'

export const id = 'notes'
export type NotesState = ActorRefFrom<typeof notesState>

export interface NotesContext {
  notes: NoteDTO[]
  currentNoteId: string | null
  currentNote: NoteDTO | null
  expandedNodeIds: string[]
  pendingPageInsert: { cursorPos: number } | null
}

type SystemEvent = OutgoingNotesEvents

type UIEvent =
  | { type: 'NOTE.SELECT'; noteId: string }
  | { type: 'NOTE.CREATE'; parentId?: string }
  | { type: 'NOTE.DELETE'; noteId: string }
  | { type: 'NOTE.UPDATE_CONTENT'; noteId: string; content: string }
  | { type: 'NOTE.UPDATE_TITLE'; noteId: string; title: string }
  | { type: 'NOTE.TOGGLE_EXPAND'; nodeId: string }
  | { type: 'NOTE.LINK_CLICKED'; noteId: string }
  | { type: 'NOTE.REQUEST_PAGE_INSERT'; parentId: string; cursorPos: number }
  | { type: 'VIEW_WELCOME' }

export type NotesEvents = UIEvent | SystemEvent | TrailClickEvent
const typeOf = safeEvents<NotesEvents>()

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
      }
    }),

    selectNote: assign(({ event, context }) => {
      const ev = typeOf('NOTE.SELECT', event)
      const note = context.notes.find(n => n.id === ev.noteId) || null
      return {
        currentNoteId: ev.noteId,
        currentNote: note,
      }
    }),

    navigateToNote: assign(({ event, context }) => {
      const ev = typeOf('NOTE.LINK_CLICKED', event)
      const note = context.notes.find(n => n.id === ev.noteId) || null
      return {
        currentNoteId: ev.noteId,
        currentNote: note,
      }
    }),

    sendCreateNote: ({ event }) => {
      const ev = typeOf('NOTE.CREATE', event)
      trpc.bus.send.mutate({
        systemId: id,
        type: 'CREATE_NOTE',
        title: 'Untitled',
        parentId: ev.parentId,
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

    updateLocalContent: assign(({ context, event }) => {
      const ev = typeOf('NOTE.UPDATE_CONTENT', event)
      const updatedNotes = context.notes.map(n =>
        n.id === ev.noteId ? { ...n, content: ev.content } : n
      )
      return {
        notes: updatedNotes,
        currentNote:
          context.currentNoteId === ev.noteId && context.currentNote
            ? { ...context.currentNote, content: ev.content }
            : context.currentNote,
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

    sendUpdateTitle: ({ event }) => {
      const ev = typeOf('NOTE.UPDATE_TITLE', event)
      trpc.bus.send.mutate({
        systemId: id,
        type: 'UPDATE_NOTE',
        id: ev.noteId,
        title: ev.title,
      })
    },

    addCreatedNote: assign(({ context, event }) => {
      const ev = typeOf('NOTE_CREATED', event)
      const updated = {
        notes: [...context.notes, ev.note],
      } as Partial<NotesContext>

      // Handle pending page insert: auto-select the new note if it was a root create
      // and no note is currently selected
      if (!context.currentNoteId && !ev.note.parentId) {
        updated.currentNoteId = ev.note.id
        updated.currentNote = ev.note
      }

      // If there's a pending page insert, the canvas will handle it
      return updated
    }),

    handlePageInsertCreated: assign(({ context, event }) => {
      const ev = typeOf('NOTE_CREATED', event)
      // Only handle if there's a pending page insert and the new note has a parent
      if (!context.pendingPageInsert || !ev.note.parentId) return {}
      if (ev.note.parentId !== context.currentNoteId) return {}

      // Clear pending flag - the canvas component will detect this via the note
      // and insert the link using the editor ref
      return {
        notes: [...context.notes, ev.note],
        pendingPageInsert: null,
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
      }
    }),

    removeDeletedNote: assign(({ context, event }) => {
      const ev = typeOf('NOTE_DELETED', event)
      const updatedNotes = context.notes.filter(n => n.id !== ev.noteId)
      const wasCurrentNote = context.currentNoteId === ev.noteId
      return {
        notes: updatedNotes,
        currentNoteId: wasCurrentNote ? null : context.currentNoteId,
        currentNote: wasCurrentNote ? null : context.currentNote,
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

    requestPageInsert: assign(({ event }) => {
      const ev = typeOf('NOTE.REQUEST_PAGE_INSERT', event)
      return {
        pendingPageInsert: { cursorPos: ev.cursorPos },
      }
    }),

    sendCreateChildForPageInsert: ({ event }) => {
      const ev = typeOf('NOTE.REQUEST_PAGE_INSERT', event)
      trpc.bus.send.mutate({
        systemId: id,
        type: 'CREATE_NOTE',
        title: 'Untitled',
        parentId: ev.parentId,
      })
    },

    clearCurrentNote: assign({
      currentNoteId: null,
      currentNote: null,
    }),
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
    pendingPageInsert: null,
  },
  on: {
    NOTES_CONNECTED: { actions: 'setPluginData' },
    NOTE_UPDATED: { actions: 'updateNoteInList' },
    NOTE_DELETED: [
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
    'NOTE.UPDATE_CONTENT': { actions: ['updateLocalContent', 'sendUpdateContent'] },
    'NOTE.UPDATE_TITLE': { actions: 'sendUpdateTitle' },
    ...TRAIL_CLICK([
      ['.welcome', 'welcome'],
      ['.editor', 'editor'],
    ]),
  },
  states: {
    welcome: {
      tags: ['welcome'],
      meta: { ...breadcrumb('welcome', 'Notes', true) },
      on: {
        'NOTE.CREATE': {
          actions: 'sendCreateNote',
        },
        NOTE_CREATED: {
          actions: 'addCreatedNote',
          target: 'editor',
        },
        'NOTE.SELECT': {
          actions: 'selectNote',
          target: 'editor',
        },
        'NOTE.DELETE': {
          actions: 'sendDeleteNote',
        },
      },
    },
    editor: {
      tags: ['editor'],
      meta: {
        ...breadcrumbList<NotesContext>((ctx) => {
          if (!ctx.currentNoteId || !ctx.currentNote) {
            return [{ label: 'Notes', target: 'welcome' }]
          }
          const ancestors = getAncestorChain(ctx.notes, ctx.currentNoteId)
          return [
            { label: 'Notes', target: 'welcome' },
            ...ancestors.map(a => ({ label: a.title, target: 'editor', info: a.id })),
            { label: ctx.currentNote.title, target: 'editor', info: ctx.currentNoteId },
          ]
        }),
        ...contextMenuFn<NotesContext>((ctx) => [
          {
            label: 'Delete Note',
            icon: Trash2,
            iconColor: 'text-red-400',
            event: { type: 'NOTE.DELETE' as const, noteId: ctx.currentNoteId! },
            confirm: `Are you sure you want to delete "${ctx.currentNote?.title || 'this note'}"?`,
          },
        ]),
      },
      on: {
        'NOTE.SELECT': {
          actions: 'selectNote',
        },
        'NOTE.CREATE': {
          actions: 'sendCreateNote',
        },
        NOTE_CREATED: [
          {
            guard: ({ context }) => context.pendingPageInsert !== null,
            actions: 'handlePageInsertCreated',
          },
          {
            actions: 'addCreatedNote',
          },
        ],
        'NOTE.DELETE': {
          actions: 'sendDeleteNote',
        },
        'NOTE.LINK_CLICKED': {
          actions: 'navigateToNote',
        },
        'NOTE.REQUEST_PAGE_INSERT': {
          actions: ['requestPageInsert', 'sendCreateChildForPageInsert'],
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
