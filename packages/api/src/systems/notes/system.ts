import { setup } from 'xstate';
import type { MergeReceivable } from '@/core/helpers/event-helpers';
import { fromSystem, systemBus } from '@/core/helpers/event-helpers';
import { bus, SystemEvents } from '@/systems/backend';
import { emit, safeEvents } from '@/core/helpers/actor-helpers';
import { EARS } from '@/core/types';
import type { NoteDTO, NotesConnectedData, OutgoingNotesSearchEvent } from './types';
import { repository } from '@/repository';
import { qx } from '@/core/ears/helpers/query';
import { syncReferences } from './repository/link-utils';
import { z } from 'zod';
import { createLogger } from '@/core/helpers/debug/logger';

const logger = createLogger('notes');

function isDescendantOf(noteId: EARS.EntityId, ancestorId: EARS.EntityId): boolean {
  const childIds = qx(ancestorId).linksTo(EARS.RelKind.CONTAINS, EARS.Entity.Note).ids();
  for (const childId of childIds) {
    if (childId === noteId) return true;
    if (isDescendantOf(noteId, childId)) return true;
  }
  return false;
}

export const notes = 'notes' as const;

const busEvent = systemBus(notes);

export const IncomingNoteEvents = [
  busEvent('CREATE_NOTE', {
    title: z.string(),
    content: z.string().optional(),
    icon: z.string().nullable().optional(),
    parentId: z.string().optional(),
    skipContentSync: z.boolean().optional(),
  }),
  busEvent('UPDATE_NOTE', {
    id: z.string(),
    title: z.string().optional(),
    content: z.string().optional(),
    icon: z.string().nullable().optional(),
  }),
  busEvent('DELETE_NOTE', {
    id: z.string(),
  }),
  busEvent('SOFT_DELETE_NOTE', {
    id: z.string(),
  }),
  busEvent('RESTORE_NOTE', {
    id: z.string(),
  }),
  busEvent('MOVE_NOTE', {
    ids: z.array(z.string()),
    newParentId: z.string().nullable(),
  }),
  busEvent('VIEW_NOTE', {
    id: z.string(),
  }),
  busEvent('SEARCH_NOTES', {
    query: z.string(),
  }),
] as const;

export type NotesInternalEvents = SystemEvents;

export type OutgoingNotesEvents =
  | { type: 'NOTES_CONNECTED'; data: NotesConnectedData }
  | { type: 'NOTE_CREATED'; note: NoteDTO }
  | { type: 'NOTE_UPDATED'; note: NoteDTO }
  | { type: 'NOTE_DELETED'; noteId: string }
  | { type: 'NOTE_RESTORED'; note: NoteDTO }
  | OutgoingNotesSearchEvent

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
        icon: ev.icon,
        parentId: ev.parentId,
      });

      const noteDTO = repository.noteQueries.byIdDTO(note.id as EARS.EntityId);
      if (noteDTO) {
        system.get(bus).send(emit(notes, {
          type: 'NOTE_CREATED',
          note: noteDTO,
        }));

        // If this note has a parent, append sub-page link to parent content (unless skipped)
        if (ev.parentId && !ev.skipContentSync) {
          const parentNote = repository.noteQueries.byId(ev.parentId as EARS.EntityId);
          if (parentNote) {
            const linkMarkdown = `\n[${ev.title}](page://${note.id})`;
            const newContent = (parentNote.content || '') + linkMarkdown;
            repository.noteCommands.update(ev.parentId as EARS.EntityId, { content: newContent });
          }
        }

        // If this note has a parent, also send an update for the parent (childCount/content changed)
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
      if (ev.icon !== undefined) updates.icon = ev.icon;

      repository.noteCommands.update(ev.id as EARS.EntityId, updates);

      const updatedNote = repository.noteQueries.byIdDTO(ev.id as EARS.EntityId);
      if (updatedNote) {
        system.get(bus).send(emit(notes, {
          type: 'NOTE_UPDATED',
          note: updatedNote,
        }));

        // Sync sub-page link title in parent note when child is renamed
        if (ev.title !== undefined && updatedNote.parentId) {
          const parentNote = repository.noteQueries.byId(updatedNote.parentId as EARS.EntityId);
          if (parentNote?.content) {
            const linkPattern = new RegExp(
              `\\[([^\\]]*)\\]\\(page:\\/\\/${ev.id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`,
              'g'
            );
            const newContent = parentNote.content.replace(linkPattern, `[${ev.title}](page://${ev.id})`);
            if (newContent !== parentNote.content) {
              repository.noteCommands.update(updatedNote.parentId as EARS.EntityId, { content: newContent });

              const updatedParent = repository.noteQueries.byIdDTO(updatedNote.parentId as EARS.EntityId);
              if (updatedParent) {
                system.get(bus).send(emit(notes, {
                  type: 'NOTE_UPDATED',
                  note: updatedParent,
                }));
              }
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

    softDeleteNote: ({ system, event }) => {
      const ev = typeOf('SOFT_DELETE_NOTE', event);
      const deletedIds = repository.noteCommands.softDelete(ev.id as EARS.EntityId);

      for (const deletedId of deletedIds) {
        system.get(bus).send(emit(notes, {
          type: 'NOTE_DELETED',
          noteId: deletedId,
        }));
      }

      // Update parent's childCount
      const noteEntity = repository.noteQueries.byId(ev.id as EARS.EntityId);
      if (!noteEntity) {
        // Note is soft-deleted, look up parent via relations
        const parentIds = qx(ev.id as EARS.EntityId).linksTo(EARS.RelKind.CONTAINS, EARS.Entity.Note, false).ids();
        if (parentIds.length > 0) {
          const parentDTO = repository.noteQueries.byIdDTO(parentIds[0]);
          if (parentDTO) {
            system.get(bus).send(emit(notes, {
              type: 'NOTE_UPDATED',
              note: parentDTO,
            }));
          }
        }
      }
    },

    restoreNote: ({ system, event }) => {
      const ev = typeOf('RESTORE_NOTE', event);
      const restoredIds = repository.noteCommands.restore(ev.id as EARS.EntityId);

      for (const restoredId of restoredIds) {
        const noteDTO = repository.noteQueries.byIdDTO(restoredId as EARS.EntityId);
        if (noteDTO) {
          system.get(bus).send(emit(notes, {
            type: 'NOTE_RESTORED',
            note: noteDTO,
          }));
        }
      }

      // Update parent's childCount
      const parentIds = qx(ev.id as EARS.EntityId).linksTo(EARS.RelKind.CONTAINS, EARS.Entity.Note, false).ids();
      if (parentIds.length > 0) {
        const parentDTO = repository.noteQueries.byIdDTO(parentIds[0]);
        if (parentDTO) {
          system.get(bus).send(emit(notes, {
            type: 'NOTE_UPDATED',
            note: parentDTO,
          }));
        }
      }
    },

    cleanupExpiredNotes: () => {
      const expired = repository.noteQueries.expiredSoftDeleted(10);
      if (expired.length === 0) return;
      for (const note of expired) {
        try {
          repository.noteCommands.delete(note.id as EARS.EntityId);
        } catch {
          // Already deleted or missing — skip
        }
      }
      logger.info(`Cleaned up ${expired.length} expired soft-deleted notes`);
    },

    moveNotes: ({ system, event }) => {
      const ev = typeOf('MOVE_NOTE', event);
      const newParentId = ev.newParentId as EARS.EntityId | null;
      const affectedParentIds = new Set<string>();

      for (const noteId of ev.ids) {
        const id = noteId as EARS.EntityId;

        // Skip self-drop
        if (newParentId === id) continue;

        // Skip descendant-drop (would create circular reference)
        if (newParentId && isDescendantOf(newParentId, id)) continue;

        // Find current parent to skip same-parent no-op
        const currentParentIds = qx(id).linksTo(EARS.RelKind.CONTAINS, EARS.Entity.Note, false).ids();
        const currentParentId = currentParentIds.length > 0 ? currentParentIds[0] : null;
        if (currentParentId === newParentId) continue;

        const { oldParentId } = repository.noteCommands.move(id, newParentId);

        if (oldParentId) affectedParentIds.add(oldParentId);
        if (newParentId) affectedParentIds.add(newParentId);

        // Emit update for the moved note
        const movedDTO = repository.noteQueries.byIdDTO(id);
        if (movedDTO) {
          system.get(bus).send(emit(notes, {
            type: 'NOTE_UPDATED',
            note: movedDTO,
          }));
        }
      }

      // Emit updates for all affected parents
      for (const parentId of affectedParentIds) {
        const parentDTO = repository.noteQueries.byIdDTO(parentId as EARS.EntityId);
        if (parentDTO) {
          system.get(bus).send(emit(notes, {
            type: 'NOTE_UPDATED',
            note: parentDTO,
          }));
        }
      }
    },

    searchNotes: ({ system, event }) => {
      const ev = typeOf('SEARCH_NOTES', event);
      const query = ev.query.trim().toLowerCase();
      if (!query) {
        system.get(bus).send(emit(notes, {
          type: 'NOTES_SEARCH_RESULTS',
          results: [],
        }));
        return;
      }
      const allNotes = repository.noteQueries.allDTOs();
      const results = allNotes.filter(n =>
        (n.title || '').toLowerCase().includes(query)
      );
      system.get(bus).send(emit(notes, {
        type: 'NOTES_SEARCH_RESULTS',
        results,
      }));
    },

    viewNote: ({ system, event }) => {
      const ev = typeOf('VIEW_NOTE', event);
      repository.noteCommands.update(ev.id as EARS.EntityId, { lastSeen: Date.now() });
      const updatedNote = repository.noteQueries.byIdDTO(ev.id as EARS.EntityId);
      if (updatedNote) {
        system.get(bus).send(emit(notes, {
          type: 'NOTE_UPDATED',
          note: updatedNote,
        }));
      }
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

      // Remove link markdown from referencing notes before deletion
      const allDeletedIds = [ev.id, ...descendantIds];
      const deletedSet = new Set(allDeletedIds);
      const affectedRefIds = new Set<string>();

      for (const deletedId of allDeletedIds) {
        const refIds = repository.noteQueries.referencedBy(deletedId as EARS.EntityId);
        for (const refId of refIds) {
          if (!deletedSet.has(refId)) {
            affectedRefIds.add(refId);
          }
        }
      }

      for (const refId of affectedRefIds) {
        const note = repository.noteQueries.byId(refId as EARS.EntityId);
        if (!note?.content) continue;

        let newContent = note.content;
        for (const deletedId of allDeletedIds) {
          const escaped = deletedId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const linkPattern = new RegExp(`\\[([^\\]]*)\\]\\(note:\\/\\/${escaped}\\)`, 'g');
          newContent = newContent.replace(linkPattern, '$1');
        }
        if (newContent === note.content) continue;

        repository.noteCommands.update(refId as EARS.EntityId, { content: newContent });

        const updatedRef = repository.noteQueries.byIdDTO(refId as EARS.EntityId);
        if (updatedRef) {
          system.get(bus).send(emit(notes, {
            type: 'NOTE_UPDATED',
            note: updatedRef,
          }));
        }
      }

      // Strip page:// links from parent note content (no REFERENCES relation for these)
      if (parentId) {
        const parentNote = repository.noteQueries.byId(parentId as EARS.EntityId);
        if (parentNote?.content) {
          let newContent = parentNote.content;
          for (const deletedId of allDeletedIds) {
            const escaped = deletedId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const pagePattern = new RegExp(`\\[([^\\]]*)\\]\\(page:\\/\\/${escaped}(?:\\?[^)]*)?\\)\\n?`, 'g');
            newContent = newContent.replace(pagePattern, '');
          }
          if (newContent !== parentNote.content) {
            repository.noteCommands.update(parentId as EARS.EntityId, { content: newContent });
          }
        }
      }

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
    SOFT_DELETE_NOTE: {
      actions: 'softDeleteNote',
    },
    RESTORE_NOTE: {
      actions: 'restoreNote',
    },
    MOVE_NOTE: {
      actions: 'moveNotes',
    },
    VIEW_NOTE: {
      actions: 'viewNote',
    },
    SEARCH_NOTES: {
      actions: 'searchNotes',
    },
  },
  states: {
    idle: {
      entry: ['bootstrapReferences', 'cleanupExpiredNotes'],
      on: {
        CLIENT_CONNECTED: {
          actions: 'sendNotesConnectedData',
        },
      },
    },
  },
});
