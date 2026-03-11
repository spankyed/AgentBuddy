import { setup } from 'xstate';
import type { MergeReceivable } from '@/core/helpers/event-helpers';
import { fromSystem, systemBus } from '@/core/helpers/event-helpers';
import { bus, SystemEvents } from '@/systems/backend';
import { emit, safeEvents } from '@/core/helpers/actor-helpers';
import { EARS } from '@/core/types';
import type { NoteDTO, NotesConnectedData } from './types';
import { repository } from '@/repository';
import { syncReferences } from './repository/link-utils';
import { z } from 'zod';
import { createLogger } from '@/core/helpers/debug/logger';

const logger = createLogger('notes');

export const notes = 'notes' as const;

const busEvent = systemBus(notes);

export const IncomingNoteEvents = [
  busEvent('CREATE_NOTE', {
    title: z.string(),
    content: z.string().optional(),
    parentId: z.string().optional(),
  }),
  busEvent('UPDATE_NOTE', {
    id: z.string(),
    title: z.string().optional(),
    content: z.string().optional(),
  }),
  busEvent('DELETE_NOTE', {
    id: z.string(),
  }),
  busEvent('MOVE_NOTE', {
    id: z.string(),
    newParentId: z.string().nullable().optional(),
  }),
] as const;

export type NotesInternalEvents = SystemEvents;

export type OutgoingNotesEvents =
  | { type: 'NOTES_CONNECTED'; data: NotesConnectedData }
  | { type: 'NOTE_CREATED'; note: NoteDTO }
  | { type: 'NOTE_UPDATED'; note: NoteDTO }
  | { type: 'NOTE_DELETED'; noteId: string }

export const NotesSystemEvents = fromSystem(IncomingNoteEvents)<OutgoingNotesEvents, typeof notes>();
type ReceivableEvents = MergeReceivable<typeof IncomingNoteEvents, NotesInternalEvents>;

const typeOf = safeEvents<ReceivableEvents>();

export const notesSystem = setup({
  types: {
    context: {} as {},
    events: {} as ReceivableEvents,
  },
  actions: {
    sendNotesConnectedData: ({ system }) => {
      const connectedData = repository.noteQueries.connectedData();
      system.get(bus).send(emit(notes, {
        type: 'NOTES_CONNECTED',
        data: connectedData,
      }));
    },

    createNote: ({ system, event }) => {
      const ev = typeOf('CREATE_NOTE', event);
      const note = repository.noteCommands.create({
        title: ev.title,
        content: ev.content,
        parentId: ev.parentId,
      });

      const noteDTO = repository.noteQueries.byIdDTO(note.id as EARS.EntityId);
      if (noteDTO) {
        system.get(bus).send(emit(notes, {
          type: 'NOTE_CREATED',
          note: noteDTO,
        }));

        // If this note has a parent, also send an update for the parent (childCount changed)
        if (ev.parentId) {
          const parentDTO = repository.noteQueries.byIdDTO(ev.parentId as EARS.EntityId);
          if (parentDTO) {
            system.get(bus).send(emit(notes, {
              type: 'NOTE_UPDATED',
              note: parentDTO,
            }));
          }
        }
      }
    },

    updateNote: ({ system, event }) => {
      const ev = typeOf('UPDATE_NOTE', event);
      const updates: Record<string, any> = {};

      if (ev.title !== undefined) updates.title = ev.title;
      if (ev.content !== undefined) updates.content = ev.content;

      repository.noteCommands.update(ev.id as EARS.EntityId, updates);

      const updatedNote = repository.noteQueries.byIdDTO(ev.id as EARS.EntityId);
      if (updatedNote) {
        system.get(bus).send(emit(notes, {
          type: 'NOTE_UPDATED',
          note: updatedNote,
        }));

        // Sync link text in notes that reference this note (indexed lookup)
        if (ev.title !== undefined) {
          const referencingIds = repository.noteQueries.referencedBy(ev.id as EARS.EntityId);
          const linkPattern = new RegExp(
            `\\[([^\\]]*)\\]\\(note:\\/\\/${ev.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`,
            'g'
          );

          for (const refId of referencingIds) {
            const note = repository.noteQueries.byId(refId);
            if (!note?.content) continue;

            const newContent = note.content.replace(linkPattern, `[${ev.title}](note://${ev.id})`);
            if (newContent === note.content) continue;

            repository.noteCommands.update(refId, { content: newContent });

            const affectedNote = repository.noteQueries.byIdDTO(refId);
            if (affectedNote) {
              system.get(bus).send(emit(notes, {
                type: 'NOTE_UPDATED',
                note: affectedNote,
              }));
            }
          }
        }
      }
    },

    bootstrapReferences: () => {
      const allNotes = repository.noteQueries.all();
      for (const note of allNotes) {
        if (note.content) {
          syncReferences(note.id as EARS.EntityId, note.content);
        }
      }
      logger.info(`Bootstrapped REFERENCES relations for ${allNotes.length} notes`);
    },

    deleteNote: ({ system, event }) => {
      const ev = typeOf('DELETE_NOTE', event);

      // Get parent before deletion for update
      const noteDTO = repository.noteQueries.byIdDTO(ev.id as EARS.EntityId);
      const parentId = noteDTO?.parentId;

      // Collect all descendant IDs before deletion
      const collectDescendants = (id: EARS.EntityId): string[] => {
        const children = repository.noteQueries.children(id);
        const descendantIds: string[] = [];
        for (const child of children) {
          descendantIds.push(child.id);
          descendantIds.push(...collectDescendants(child.id as EARS.EntityId));
        }
        return descendantIds;
      };
      const descendantIds = collectDescendants(ev.id as EARS.EntityId);

      repository.noteCommands.delete(ev.id as EARS.EntityId);

      // Notify about deleted note and all descendants
      system.get(bus).send(emit(notes, {
        type: 'NOTE_DELETED',
        noteId: ev.id,
      }));
      for (const descId of descendantIds) {
        system.get(bus).send(emit(notes, {
          type: 'NOTE_DELETED',
          noteId: descId,
        }));
      }

      // Update parent's childCount
      if (parentId) {
        const parentDTO = repository.noteQueries.byIdDTO(parentId as EARS.EntityId);
        if (parentDTO) {
          system.get(bus).send(emit(notes, {
            type: 'NOTE_UPDATED',
            note: parentDTO,
          }));
        }
      }
    },
  },
}).createMachine({
  id: notes,
  initial: 'idle',
  context: ({}) => ({}),
  on: {
    CREATE_NOTE: {
      actions: 'createNote',
    },
    UPDATE_NOTE: {
      actions: 'updateNote',
    },
    DELETE_NOTE: {
      actions: 'deleteNote',
    },
  },
  states: {
    idle: {
      entry: 'bootstrapReferences',
      on: {
        CLIENT_CONNECTED: {
          actions: 'sendNotesConnectedData',
        },
      },
    },
  },
});
