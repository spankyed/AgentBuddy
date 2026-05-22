import { setup } from 'xstate';
import { defineSystem } from '@/core/framework/define-system';
import { bus } from '@/core/system-ids';
import { emit } from '@/core/helpers/actor-helpers';
import { EARS } from '@/core/types';
import type { NoteDTO, NoteEntity, NotesConnectedData, OutgoingNotesSearchEvent } from './types';
import { repository } from '@/repository';
import { qx } from '@/core/ears/helpers/query';
import { syncReferences } from './repository/link-utils';
import { exportNotes } from './export-notes';
import { importNotes } from './import-notes';
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

type IncomingNoteEvents =
  | { type: 'CREATE_NOTE'; title: string; content?: string; icon?: string | null; parentId?: string; skipContentSync?: boolean; noteType?: 'document' | 'tasklist' | 'task'; completed?: boolean; displayOrder?: number }
  | { type: 'UPDATE_NOTE'; id: string; title?: string; content?: string; icon?: string | null; completed?: boolean; hideCompletedChildren?: boolean; favorite?: boolean }
  | { type: 'DELETE_NOTE'; id: string }
  | { type: 'SOFT_DELETE_NOTE'; id: string }
  | { type: 'RESTORE_NOTE'; id: string }
  | { type: 'MOVE_NOTE'; ids: string[]; newParentId: string | null }
  | { type: 'REORDER_NOTE'; id: string; newParentId: string | null; newIndex: number }
  | { type: 'VIEW_NOTE'; id: string }
  | { type: 'SEARCH_NOTES'; query: string }
  | { type: 'GET_TRASHED_NOTES' }
  | { type: 'PERMANENTLY_DELETE_NOTE'; id: string }
  | { type: 'EMPTY_TRASH' }
  | { type: 'IMPORT_NOTES'; directory: string }
  | { type: 'EXPORT_NOTES'; directory: string; format: 'markdown' | 'json' };

export type OutgoingNotesEvents =
  | { type: 'NOTES_CONNECTED'; data: NotesConnectedData }
  | { type: 'NOTE_CREATED'; note: NoteDTO }
  | { type: 'NOTE_UPDATED'; note: NoteDTO }
  | { type: 'NOTE_DELETED'; noteId: string }
  | { type: 'NOTE_RESTORED'; note: NoteDTO }
  | { type: 'TRASHED_NOTES'; notes: NoteDTO[] }
  | OutgoingNotesSearchEvent
  | { type: 'NOTES_IMPORTED'; count: number; errors?: string[] }
  | { type: 'NOTES_IMPORT_FAILED'; errors: string[] }
  | { type: 'NOTES_EXPORTED'; filePath: string; itemCount: number }
  | { type: 'NOTES_EXPORT_FAILED'; errors: string[] }

export const notesDef = defineSystem('notes')<IncomingNoteEvents, OutgoingNotesEvents>();
export const notes = notesDef.id;

export const notesSystem = setup({
  types: notesDef.types,
  actions: {
    sendNotesConnectedData: ({ system }) => {
      const connectedData = repository.noteQueries.connectedData();
      const settings = repository.settingsQueries.getPluginSettings('notes');
      system.get(bus).send(emit(notes, {
        type: 'NOTES_CONNECTED',
        data: { ...connectedData, settings },
      }));
    },

    createNote: ({ system, event }) => {
      const ev = notesDef.typeOf('CREATE_NOTE', event);
      const note = repository.noteCommands.create({
        title: ev.title,
        content: ev.content,
        icon: ev.icon,
        parentId: ev.parentId,
        noteType: ev.noteType,
        completed: ev.completed,
        displayOrder: ev.displayOrder,
      });

      const noteDTO = repository.noteQueries.byIdDTO(note.id as EARS.EntityId);
      if (noteDTO) {
        system.get(bus).send(emit(notes, {
          type: 'NOTE_CREATED',
          note: noteDTO,
        }));

        // If this note has a parent, append sub-document link to parent content
        if (ev.parentId && !ev.skipContentSync) {
          const parentNote = repository.noteQueries.byId(ev.parentId as EARS.EntityId);
          if (parentNote) {
            const linkMarkdown = `\n\n[${ev.title}](document://${note.id})`;
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
      const ev = notesDef.typeOf('UPDATE_NOTE', event);
      const noteId = ev.id as EARS.EntityId;
      const noteBeforeUpdate = repository.noteQueries.byId(noteId) as NoteEntity | undefined;
      if (!noteBeforeUpdate) return;
      const updates: Record<string, any> = {};

      if (ev.title !== undefined) updates.title = ev.title;
      if (ev.content !== undefined) updates.content = ev.content;
      if (ev.icon !== undefined) updates.icon = ev.icon;
      if (ev.hideCompletedChildren !== undefined) updates.hideCompletedChildren = ev.hideCompletedChildren;
      if (ev.favorite !== undefined) updates.favorite = ev.favorite;
      if (ev.completed !== undefined) {
        updates.completed = ev.completed;
        // When completing: save current displayOrder
        if (ev.completed && !noteBeforeUpdate.completed) {
          updates.savedDisplayOrder = noteBeforeUpdate.displayOrder;
        }
      }

      repository.noteCommands.update(noteId, updates);

      // When uncompleting: restore saved position
      if (ev.completed === false && noteBeforeUpdate.savedDisplayOrder !== undefined) {
        const parentIds = qx(noteId).linksTo(EARS.RelKind.CONTAINS, EARS.Entity.Note, false).ids();
        const parentId = parentIds.length > 0 ? parentIds[0] : null;
        const { affectedIds } = repository.noteCommands.reorder(
          noteId,
          parentId,
          noteBeforeUpdate.savedDisplayOrder
        );
        repository.noteCommands.update(noteId, { savedDisplayOrder: null }, true);

        // Emit updates for all affected siblings
        for (const affectedId of affectedIds) {
          if (affectedId !== noteId) {
            const affectedDTO = repository.noteQueries.byIdDTO(affectedId as EARS.EntityId);
            if (affectedDTO) {
              system.get(bus).send(emit(notes, {
                type: 'NOTE_UPDATED',
                note: affectedDTO,
              }));
            }
          }
        }
      }

      const updatedNote = repository.noteQueries.byIdDTO(noteId);
      if (updatedNote) {
        system.get(bus).send(emit(notes, {
          type: 'NOTE_UPDATED',
          note: updatedNote,
        }));

        // Sync sub-document link title in parent note when child is renamed
        if (ev.title !== undefined && updatedNote.parentId) {
          const parentNote = repository.noteQueries.byId(updatedNote.parentId as EARS.EntityId);
          if (parentNote?.content) {
            const linkPattern = new RegExp(
              `\\[([^\\]]*)\\]\\(document:\\/\\/${(noteId as string).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\)`,
              'g'
            );
            const newContent = parentNote.content.replace(linkPattern, `[${ev.title}](document://${noteId})`);
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
      const ev = notesDef.typeOf('SOFT_DELETE_NOTE', event);
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
      const ev = notesDef.typeOf('RESTORE_NOTE', event);
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
      const expired = repository.noteQueries.expiredSoftDeleted(7);
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
      const ev = notesDef.typeOf('MOVE_NOTE', event);
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

    reorderNote: ({ system, event }) => {
      const ev = notesDef.typeOf('REORDER_NOTE', event);
      const noteId = ev.id as EARS.EntityId;
      const newParentId = ev.newParentId as EARS.EntityId | null;

      // Skip self-drop
      if (newParentId === noteId) return;

      // Skip descendant-drop
      if (newParentId && isDescendantOf(newParentId, noteId)) return;

      const { oldParentId, affectedIds } = repository.noteCommands.reorder(noteId, newParentId, ev.newIndex);

      // Emit updates for the reordered note
      const reorderedDTO = repository.noteQueries.byIdDTO(noteId);
      if (reorderedDTO) {
        system.get(bus).send(emit(notes, {
          type: 'NOTE_UPDATED',
          note: reorderedDTO,
        }));
      }

      // Emit updates for all affected siblings
      for (const affectedId of affectedIds) {
        if (affectedId !== noteId) {
          const affectedDTO = repository.noteQueries.byIdDTO(affectedId as EARS.EntityId);
          if (affectedDTO) {
            system.get(bus).send(emit(notes, {
              type: 'NOTE_UPDATED',
              note: affectedDTO,
            }));
          }
        }
      }

      // Emit updates for old/new parent (childCount changes)
      const affectedParentIds = new Set<string>();
      if (oldParentId && oldParentId !== newParentId) affectedParentIds.add(oldParentId);
      if (newParentId && newParentId !== oldParentId) affectedParentIds.add(newParentId);
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
      const ev = notesDef.typeOf('SEARCH_NOTES', event);
      const query = ev.query.trim().toLowerCase();
      if (!query) {
        system.get(bus).send(emit(notes, {
          type: 'NOTES_SEARCH_RESULTS',
          results: [],
        }));
        return;
      }
      const allNotes = repository.noteQueries.allDTOs();
      const results = allNotes.filter((n: NoteDTO) =>
        (n.title || '').toLowerCase().includes(query)
      );
      system.get(bus).send(emit(notes, {
        type: 'NOTES_SEARCH_RESULTS',
        results,
      }));
    },

    importNotesItems: ({ system, event }) => {
      const ev = event as { type: 'IMPORT_NOTES'; directory: string };
      try {
        const result = importNotes(ev.directory);

        if (result.created === 0 && result.errors.length > 0) {
          system.get(bus).send(emit(notes, {
            type: 'NOTES_IMPORT_FAILED',
            errors: result.errors,
          }));
          return;
        }

        system.get(bus).send(emit(notes, {
          type: 'NOTES_IMPORTED',
          count: result.created,
          ...(result.errors.length > 0 ? { errors: result.errors } : {}),
        }));

        // Refresh notes data
        const connectedData = repository.noteQueries.connectedData();
        const settings = repository.settingsQueries.getPluginSettings('notes');
        system.get(bus).send(emit(notes, {
          type: 'NOTES_CONNECTED',
          data: { ...connectedData, settings },
        }));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        system.get(bus).send(emit(notes, {
          type: 'NOTES_IMPORT_FAILED',
          errors: [message],
        }));
      }
    },

    exportNotesToFile: ({ system, event }) => {
      const ev = event as { type: 'EXPORT_NOTES'; directory: string; format: 'markdown' | 'json' };
      try {
        const { filePath, itemCount } = exportNotes(ev.directory, ev.format);

        system.get(bus).send(emit(notes, {
          type: 'NOTES_EXPORTED',
          filePath,
          itemCount,
        }));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        system.get(bus).send(emit(notes, {
          type: 'NOTES_EXPORT_FAILED',
          errors: [message],
        }));
      }
    },

    viewNote: ({ system, event }) => {
      const ev = notesDef.typeOf('VIEW_NOTE', event);
      if (!repository.noteQueries.byId(ev.id as EARS.EntityId)) return;
      repository.noteCommands.update(ev.id as EARS.EntityId, { lastSeen: Date.now() }, true);
      const updatedNote = repository.noteQueries.byIdDTO(ev.id as EARS.EntityId);
      if (updatedNote) {
        system.get(bus).send(emit(notes, {
          type: 'NOTE_UPDATED',
          note: updatedNote,
        }));
      }
    },

    deleteNote: ({ system, event }) => {
      const ev = notesDef.typeOf('DELETE_NOTE', event);

      // Get parent before deletion for update
      const noteDTO = repository.noteQueries.byIdDTO(ev.id as EARS.EntityId);
      const parentId = noteDTO?.parentId;

      // Collect all descendant IDs before soft-deletion
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

      // Strip document:// links from parent note content (no REFERENCES relation for these)
      if (parentId) {
        const parentNote = repository.noteQueries.byId(parentId as EARS.EntityId);
        if (parentNote?.content) {
          let newContent = parentNote.content;
          for (const deletedId of allDeletedIds) {
            const escaped = deletedId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const documentPattern = new RegExp(`\\\\?\\[([^\\]\\\\]*)\\\\?\\]\\(document:\\/\\/${escaped}(?:\\?[^)]*)?\\)\\n?\\n?`, 'g');
            newContent = newContent.replace(documentPattern, '');
          }
          if (newContent !== parentNote.content) {
            repository.noteCommands.update(parentId as EARS.EntityId, { content: newContent });
          }
        }
      }

      // Soft-delete instead of hard-delete (moves to trash)
      repository.noteCommands.softDelete(ev.id as EARS.EntityId);

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

    permanentlyDeleteNote: ({ system, event }) => {
      const ev = notesDef.typeOf('PERMANENTLY_DELETE_NOTE', event);
      try {
        repository.noteCommands.delete(ev.id as EARS.EntityId);
        system.get(bus).send(emit(notes, {
          type: 'NOTE_DELETED',
          noteId: ev.id,
        }));
      } catch {
        // Already deleted or missing
      }
    },

    emptyTrash: ({ system }) => {
      const trashed = repository.noteQueries.trashedDTOs();
      for (const note of trashed) {
        try {
          repository.noteCommands.delete(note.id as EARS.EntityId);
          system.get(bus).send(emit(notes, {
            type: 'NOTE_DELETED',
            noteId: note.id,
          }));
        } catch {
          // Already deleted or missing
        }
      }
    },

    sendTrashedNotes: ({ system }) => {
      const trashed = repository.noteQueries.trashedDTOs();
      system.get(bus).send(emit(notes, {
        type: 'TRASHED_NOTES',
        notes: trashed,
      }));
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
    REORDER_NOTE: {
      actions: 'reorderNote',
    },
    VIEW_NOTE: {
      actions: 'viewNote',
    },
    SEARCH_NOTES: {
      actions: 'searchNotes',
    },
    IMPORT_NOTES: {
      actions: 'importNotesItems',
    },
    GET_TRASHED_NOTES: {
      actions: 'sendTrashedNotes',
    },
    PERMANENTLY_DELETE_NOTE: {
      actions: 'permanentlyDeleteNote',
    },
    EMPTY_TRASH: {
      actions: 'emptyTrash',
    },
    EXPORT_NOTES: {
      actions: 'exportNotesToFile',
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
