import { EARS } from '@/core/types';
import { findById, findAll } from '@/core/shared/repository';
import { qx } from '@/core/ears/helpers/query';
import type { NoteEntity, NoteDTO } from '../types';
import { REFERENCES } from '../types';

function toDTO(note: NoteEntity): NoteDTO {
  // Find parent: who CONTAINS this note?
  const parents = qx(note.id).linksTo(EARS.RelKind.CONTAINS, EARS.Entity.Note, false).ids();
  const parentId = parents.length > 0 ? parents[0] : null;

  // Count children: what does this note CONTAIN?
  const childCount = qx(note.id).linksTo(EARS.RelKind.CONTAINS, EARS.Entity.Note).ids().length;

  return {
    id: note.id,
    title: note.title,
    content: note.content,
    icon: note.icon ?? null,
    noteType: note.noteType ?? 'document',
    completed: note.completed ?? false,
    hideCompletedChildren: note.hideCompletedChildren ?? false,
    parentId,
    displayOrder: note.displayOrder,
    savedDisplayOrder: note.savedDisplayOrder ?? null,
    childCount,
    createdAt: note.createdAt,
    updatedAt: note.updatedAt,
    lastSeen: note.lastSeen ?? 0,
    favorite: note.favorite ?? false,
    ...(note.deletedAt ? { deletedAt: note.deletedAt } : {}),
  };
}

export const noteQueries = {
  byId: (id: EARS.EntityId) =>
    findById<NoteEntity>(id),

  byIdDTO: (id: EARS.EntityId): NoteDTO | undefined => {
    const note = findById<NoteEntity>(id);
    return note ? toDTO(note) : undefined;
  },

  all: () =>
    findAll<NoteEntity>(EARS.Entity.Note),

  allDTOs: (): NoteDTO[] => {
    const notes = findAll<NoteEntity>(EARS.Entity.Note);
    return notes.map(toDTO);
  },

  children: (parentId: EARS.EntityId): NoteDTO[] => {
    const childIds = qx(parentId).linksTo(EARS.RelKind.CONTAINS, EARS.Entity.Note).ids();
    return childIds
      .map(id => findById<NoteEntity>(id))
      .filter((n): n is NoteEntity => n !== undefined)
      .map(toDTO);
  },

  ancestorChain: (noteId: EARS.EntityId): NoteDTO[] => {
    const chain: NoteDTO[] = [];
    let currentId: EARS.EntityId | null = noteId;

    while (currentId) {
      const parents = qx(currentId).linksTo(EARS.RelKind.CONTAINS, EARS.Entity.Note, false).ids();
      if (parents.length === 0) break;
      currentId = parents[0];
      const note = findById<NoteEntity>(currentId);
      if (note) {
        chain.unshift(toDTO(note));
      } else {
        break;
      }
    }

    return chain;
  },

  referencedBy: (noteId: EARS.EntityId): EARS.EntityId[] =>
    qx(noteId).linksTo(REFERENCES, EARS.Entity.Note, false).ids(),

  trashedDTOs: (): NoteDTO[] => {
    const all = qx(EARS.Entity.Note).pickAll() as unknown as NoteEntity[];
    return all.filter(n => n.deleted).map(toDTO);
  },

  expiredSoftDeleted: (maxAgeDays: number): NoteEntity[] => {
    const cutoff = Date.now() - (maxAgeDays * 24 * 60 * 60 * 1000);
    const all = qx(EARS.Entity.Note).pickAll() as unknown as NoteEntity[];
    return all.filter(n => n.deleted && n.deletedAt && n.deletedAt < cutoff);
  },

  connectedData: () => ({
    notes: noteQueries.allDTOs(),
  }),
} as const;
