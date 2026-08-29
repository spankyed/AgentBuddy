import { EARS } from '@/core/types';
import {
  findById,
  findByIdRaw,
  createEntityWithDefaults,
  updateEntity,
  createRelation,
  removeRelation,
  RepositoryError,
  RepositoryErrorCode,
} from '@/core/shared/repository';
import { qx } from '@/core/ears/helpers/query';
import { tx } from '@/core/ears/helpers/transaction';
import type { NoteEntity } from '../types';
import { REFERENCES } from '../types';
import { syncReferences } from './link-utils';

function reparent(id: EARS.EntityId, oldParentId: string | null, newParentId: EARS.EntityId | null, noteType: string): void {
  // Remove old CONTAINS relation and strip sub-document link from old parent content
  if (oldParentId) {
    const oldParentEntityId = oldParentId as EARS.EntityId;
    removeRelation(oldParentEntityId, EARS.RelKind.CONTAINS, id);
    const oldParent = findById<NoteEntity>(oldParentEntityId);
    if (oldParent?.content) {
      const escaped = (id as string).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const documentPattern = new RegExp(`\\n?\\n?\\\\?\\[([^\\]\\\\]*)\\\\?\\]\\(document:\\/\\/${escaped}(?:\\?[^)]*)?\\)`, 'g');
      const newContent = oldParent.content.replace(documentPattern, '');
      if (newContent !== oldParent.content) {
        updateEntity(oldParentEntityId, { content: newContent });
      }
    }
  }

  // Create new CONTAINS relation and append sub-document link to new parent content
  if (newParentId) {
    createRelation(newParentId, EARS.RelKind.CONTAINS, id);
    const newParent = findById<NoteEntity>(newParentId);
    const note = findById<NoteEntity>(id);
    if (newParent && noteType !== 'task') {
      const title = note?.title ?? 'Untitled';
      const linkMarkdown = `\n\n[${title}](document://${id})`;
      const newContent = (newParent.content || '') + linkMarkdown;
      updateEntity(newParentId, { content: newContent });
    }
  }
}

export const noteCommands = {
  create: (input: {
    title: string;
    content?: string;
    icon?: string | null;
    parentId?: string;
    displayOrder?: number;
    noteType?: 'document' | 'tasklist' | 'task';
    completed?: boolean;
    id?: string;
  }): NoteEntity => {
    if (!input.title?.trim()) {
      throw new RepositoryError('Title is required', RepositoryErrorCode.VALIDATION_ERROR);
    }

    // Calculate displayOrder if not provided
    let displayOrder = input.displayOrder;
    if (displayOrder == null) {
      if (input.parentId) {
        const siblings = qx(input.parentId as EARS.EntityId)
          .linksTo(EARS.RelKind.CONTAINS, EARS.Entity.Note)
          .ids();
        displayOrder = siblings.length;
      } else {
        // Count root notes (notes with no parent)
        const allNotes = qx(EARS.Entity.Note).ids();
        const rootCount = allNotes.filter(id => {
          const parents = qx(id).linksTo(EARS.RelKind.CONTAINS, EARS.Entity.Note, false).ids();
          return parents.length === 0;
        }).length;
        displayOrder = rootCount;
      }
    } else {
      // Explicit displayOrder: shift existing siblings at/after this index up by 1
      const siblingIds = input.parentId
        ? qx(input.parentId as EARS.EntityId).linksTo(EARS.RelKind.CONTAINS, EARS.Entity.Note).ids()
        : qx(EARS.Entity.Note).ids().filter(nid => {
            const parents = qx(nid as EARS.EntityId).linksTo(EARS.RelKind.CONTAINS, EARS.Entity.Note, false).ids();
            return parents.length === 0;
          });

      for (const sid of siblingIds) {
        const sib = findById<NoteEntity>(sid as EARS.EntityId);
        if (sib && sib.displayOrder >= displayOrder) {
          updateEntity(sib.id, { displayOrder: sib.displayOrder + 1 });
        }
      }
    }

    const note = createEntityWithDefaults<NoteEntity>(
      EARS.Entity.Note,
      {
        title: input.title,
        content: input.content || '',
        icon: input.icon ?? null,
        noteType: input.noteType ?? 'document',
        completed: input.completed ?? false,
        displayOrder,
        lastSeen: 0,
      } as any,
      'NOTE',
      input.id as EARS.EntityId | undefined,
    );

    // Create parent-child relationship
    if (input.parentId) {
      createRelation(
        input.parentId as EARS.EntityId,
        EARS.RelKind.CONTAINS,
        note.id
      );
    }

    // Sync REFERENCES relations from content links
    if (input.content) {
      syncReferences(note.id, input.content);
    }

    return note;
  },

  update: (id: EARS.EntityId, updates: {
    title?: string;
    content?: string;
    icon?: string | null;
    displayOrder?: number;
    savedDisplayOrder?: number | null;
    lastSeen?: number;
    completed?: boolean;
    hideCompletedChildren?: boolean;
    favorite?: boolean;
  }, skipTimestamp?: boolean): void => {
    if (!findById<NoteEntity>(id)) {
      throw new RepositoryError(`Note ${id} not found`, RepositoryErrorCode.NOT_FOUND);
    }

    const filteredUpdates: Record<string, any> = {};
    if (updates.title !== undefined) filteredUpdates.title = updates.title;
    if (updates.content !== undefined) filteredUpdates.content = updates.content;
    if (updates.icon !== undefined) filteredUpdates.icon = updates.icon;
    if (updates.displayOrder !== undefined) filteredUpdates.displayOrder = updates.displayOrder;
    if (updates.savedDisplayOrder !== undefined) filteredUpdates.savedDisplayOrder = updates.savedDisplayOrder === null ? undefined : updates.savedDisplayOrder;
    if (updates.lastSeen !== undefined) filteredUpdates.lastSeen = updates.lastSeen;
    if (updates.completed !== undefined) filteredUpdates.completed = updates.completed;
    if (updates.hideCompletedChildren !== undefined) filteredUpdates.hideCompletedChildren = updates.hideCompletedChildren;
    if (updates.favorite !== undefined) filteredUpdates.favorite = updates.favorite;

    if (Object.keys(filteredUpdates).length > 0) {
      updateEntity(id, filteredUpdates, skipTimestamp);
    }

    // Sync REFERENCES relations when content changes
    if (updates.content !== undefined) {
      syncReferences(id, updates.content);
    }
  },

  softDelete: (id: EARS.EntityId): string[] => {
    const existing = findById<NoteEntity>(id);
    if (!existing) return [];
    const now = Date.now();
    const deletedIds: string[] = [id];
    updateEntity(id, { deleted: true, deletedAt: now });
    const childIds = qx(id).linksTo(EARS.RelKind.CONTAINS, EARS.Entity.Note).ids();
    for (const childId of childIds) {
      deletedIds.push(...noteCommands.softDelete(childId));
    }
    return deletedIds;
  },

  restore: (id: EARS.EntityId): string[] => {
    const existing = findByIdRaw<NoteEntity>(id);
    if (!existing || !existing.deleted) return [];
    const restoredIds: string[] = [id];
    updateEntity(id, { deleted: false, deletedAt: 0 });
    // If parent is still deleted, detach so note restores at root
    const parentIds = qx(id).linksTo(EARS.RelKind.CONTAINS, EARS.Entity.Note, false).ids();
    if (parentIds.length > 0) {
      const parent = findByIdRaw<NoteEntity>(parentIds[0]);
      if (parent?.deleted) {
        removeRelation(parentIds[0], EARS.RelKind.CONTAINS, id);
      }
    }
    const childIds = qx(id).linksTo(EARS.RelKind.CONTAINS, EARS.Entity.Note).ids();
    for (const childId of childIds) {
      restoredIds.push(...noteCommands.restore(childId));
    }
    return restoredIds;
  },

  move: (id: EARS.EntityId, newParentId: EARS.EntityId | null): { oldParentId: string | null } => {
    const note = findById<NoteEntity>(id);
    if (!note) {
      throw new RepositoryError(`Note ${id} not found`, RepositoryErrorCode.NOT_FOUND);
    }

    // Find current parent
    const parentIds = qx(id).linksTo(EARS.RelKind.CONTAINS, EARS.Entity.Note, false).ids();
    const oldParentId = parentIds.length > 0 ? parentIds[0] : null;

    // Early return if already has this parent
    if (oldParentId === newParentId) return { oldParentId };

    reparent(id, oldParentId, newParentId, note.noteType);

    if (newParentId) {
      // Update displayOrder to end of new parent's children
      const newSiblings = qx(newParentId).linksTo(EARS.RelKind.CONTAINS, EARS.Entity.Note).ids();
      updateEntity(id, { displayOrder: newSiblings.length - 1 });
    } else {
      // Moving to root: calculate root-level displayOrder
      const allNotes = qx(EARS.Entity.Note).ids();
      const rootCount = allNotes.filter(nid => {
        const parents = qx(nid).linksTo(EARS.RelKind.CONTAINS, EARS.Entity.Note, false).ids();
        return parents.length === 0;
      }).length;
      updateEntity(id, { displayOrder: rootCount - 1 });
    }

    return { oldParentId };
  },

  reorder: (id: EARS.EntityId, newParentId: EARS.EntityId | null, newIndex: number): { oldParentId: string | null; affectedIds: string[] } => {
    const note = findById<NoteEntity>(id);
    if (!note) {
      throw new RepositoryError(`Note ${id} not found`, RepositoryErrorCode.NOT_FOUND);
    }

    // Find current parent
    const parentIds = qx(id).linksTo(EARS.RelKind.CONTAINS, EARS.Entity.Note, false).ids();
    const oldParentId = parentIds.length > 0 ? parentIds[0] : null;
    const parentChanged = oldParentId !== newParentId;
    const affectedIds: string[] = [];

    // If parent changed, handle reparenting
    if (parentChanged) {
      reparent(id, oldParentId, newParentId, note.noteType);
    }

    // Get siblings under new parent, sorted by displayOrder
    const siblingIds = newParentId
      ? qx(newParentId).linksTo(EARS.RelKind.CONTAINS, EARS.Entity.Note).ids()
      : qx(EARS.Entity.Note).ids().filter(nid => {
          const parents = qx(nid as EARS.EntityId).linksTo(EARS.RelKind.CONTAINS, EARS.Entity.Note, false).ids();
          return parents.length === 0;
        });

    const siblings = siblingIds
      .map(sid => findById<NoteEntity>(sid as EARS.EntityId))
      .filter((n): n is NoteEntity => n !== undefined)
      .sort((a, b) => a.displayOrder - b.displayOrder);

    // Remove the moved note from siblings list
    const filteredSiblings = siblings.filter(s => s.id !== id);

    // Insert at clamped index
    const insertAt = Math.min(newIndex, filteredSiblings.length);
    filteredSiblings.splice(insertAt, 0, note);

    // Re-index all siblings
    for (let i = 0; i < filteredSiblings.length; i++) {
      const sib = filteredSiblings[i];
      if (sib.displayOrder !== i) {
        updateEntity(sib.id, { displayOrder: i });
        affectedIds.push(sib.id);
      }
    }

    // If parent changed, also re-index old parent's remaining children
    if (parentChanged && oldParentId) {
      const oldSiblingIds = qx(oldParentId).linksTo(EARS.RelKind.CONTAINS, EARS.Entity.Note).ids();
      const oldSiblings = oldSiblingIds
        .map(sid => findById<NoteEntity>(sid as EARS.EntityId))
        .filter((n): n is NoteEntity => n !== undefined)
        .sort((a, b) => a.displayOrder - b.displayOrder);
      for (let i = 0; i < oldSiblings.length; i++) {
        const sib = oldSiblings[i];
        if (sib.displayOrder !== i) {
          updateEntity(sib.id, { displayOrder: i });
          if (!affectedIds.includes(sib.id)) affectedIds.push(sib.id);
        }
      }
    }

    return { oldParentId, affectedIds };
  },

  delete: (id: EARS.EntityId): void => {
    const existing = findByIdRaw<NoteEntity>(id);
    if (!existing) {
      throw new RepositoryError(`Note ${id} not found`, RepositoryErrorCode.NOT_FOUND);
    }

    // Recursively delete children first
    const childIds = qx(id).linksTo(EARS.RelKind.CONTAINS, EARS.Entity.Note).ids();
    for (const childId of childIds) {
      noteCommands.delete(childId);
    }

    // Remove parent relationship (if any)
    const parentIds = qx(id).linksTo(EARS.RelKind.CONTAINS, EARS.Entity.Note, false).ids();
    for (const parentId of parentIds) {
      removeRelation(parentId, EARS.RelKind.CONTAINS, id);
    }

    // Remove CONTAINS relationships to children (already deleted)
    tx(id).unlinkWhere({ kind: EARS.RelKind.CONTAINS });

    // Clean up REFERENCES relations (outgoing)
    tx(id).unlinkWhere({ kind: REFERENCES });

    // Clean up incoming REFERENCES (other notes pointing to this one)
    const referencingIds = qx(id).linksTo(REFERENCES, EARS.Entity.Note, false).ids();
    for (const refId of referencingIds) {
      tx(refId).unlinkIf(REFERENCES, id);
    }

    // Destroy the entity
    tx(id).destroy();
  },
} as const;
