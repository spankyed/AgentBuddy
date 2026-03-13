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
} from '@/core/helpers/repository';
import { qx } from '@/core/ears/helpers/query';
import { tx } from '@/core/ears/helpers/transaction';
import type { NoteEntity } from '../types';
import { REFERENCES } from '../types';
import { syncReferences } from './link-utils';

export const noteCommands = {
  create: (input: {
    title: string;
    content?: string;
    icon?: string | null;
    parentId?: string;
    displayOrder?: number;
  }): NoteEntity => {
    if (!input.title?.trim()) {
      throw new RepositoryError('Title is required', RepositoryErrorCode.VALIDATION_ERROR);
    }

    // Calculate displayOrder if not provided
    let displayOrder = input.displayOrder ?? 0;
    if (displayOrder === 0) {
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
    }

    const note = createEntityWithDefaults<NoteEntity>(
      EARS.Entity.Note,
      {
        title: input.title,
        content: input.content || '',
        icon: input.icon ?? null,
        displayOrder,
        lastSeen: 0,
      } as any,
      'NOTE'
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
    lastSeen?: number;
  }, skipTimestamp?: boolean): void => {
    if (!findById<NoteEntity>(id)) {
      throw new RepositoryError(`Note ${id} not found`, RepositoryErrorCode.NOT_FOUND);
    }

    const filteredUpdates: Record<string, any> = {};
    if (updates.title !== undefined) filteredUpdates.title = updates.title;
    if (updates.content !== undefined) filteredUpdates.content = updates.content;
    if (updates.icon !== undefined) filteredUpdates.icon = updates.icon;
    if (updates.displayOrder !== undefined) filteredUpdates.displayOrder = updates.displayOrder;
    if (updates.lastSeen !== undefined) filteredUpdates.lastSeen = updates.lastSeen;

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

    // Remove old CONTAINS relation and strip sub-page link from old parent content
    if (oldParentId) {
      removeRelation(oldParentId, EARS.RelKind.CONTAINS, id);
      const oldParent = findById<NoteEntity>(oldParentId);
      if (oldParent?.content) {
        const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pagePattern = new RegExp(`\\n?\\n?\\\\?\\[([^\\]\\\\]*)\\\\?\\]\\(page:\\/\\/${escaped}(?:\\?[^)]*)?\\)`, 'g');
        const newContent = oldParent.content.replace(pagePattern, '');
        if (newContent !== oldParent.content) {
          updateEntity(oldParentId, { content: newContent });
        }
      }
    }

    // Create new CONTAINS relation and append sub-page link to new parent content
    if (newParentId) {
      createRelation(newParentId, EARS.RelKind.CONTAINS, id);
      const newParent = findById<NoteEntity>(newParentId);
      if (newParent) {
        const linkMarkdown = `\n\n[${note.title}](page://${id})`;
        const newContent = (newParent.content || '') + linkMarkdown;
        updateEntity(newParentId, { content: newContent });
      }

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
