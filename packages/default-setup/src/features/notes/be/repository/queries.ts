import { findById, findAll, query } from '#generated/ears.ts';
import { EARS } from '#generated/ears.ts';

import type { NoteDTO } from '../types.ts';
import type { NoteEntity } from '#features/notes/be/types.ts';

function toDTO(note: NoteEntity): NoteDTO {
  // Find parent: who CONTAINS this note?
  const parents = query.ids(note.id).in(EARS.RelKind.CONTAINS, EARS.Entity.Note).ids();
  const parentId = parents.length > 0 ? parents[0] : null;

  // Count children: what does this note CONTAIN?
  const childCount = query.ids(note.id).out(EARS.RelKind.CONTAINS, EARS.Entity.Note).ids().length;

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
    ...(note.trashedAt ? { trashedAt: note.trashedAt } : {}),
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
    const childIds = query.ids(parentId).out(EARS.RelKind.CONTAINS, EARS.Entity.Note).ids();
    return childIds
      .map(id => findById<NoteEntity>(id))
      .filter((n): n is NoteEntity => n !== undefined)
      .map(toDTO);
  },

  ancestorChain: (noteId: EARS.EntityId): NoteDTO[] => {
    const chain: NoteDTO[] = [];
    let currentId: EARS.EntityId | null = noteId;

    while (currentId) {
      const parents = query.ids(currentId).in(EARS.RelKind.CONTAINS, EARS.Entity.Note).ids();
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
    query.ids(noteId).in(EARS.RelKind.REFERENCES, EARS.Entity.Note).ids(),

  trashedDTOs: (): NoteDTO[] => (query.trashed(EARS.Entity.Note).pickAll() as NoteEntity[]).map(toDTO),

  expiredSoftDeleted: (maxAgeDays: number): NoteEntity[] =>
    query.trashed(EARS.Entity.Note)
      .where('trashedAt', (at) => typeof at === 'number' && at < Date.now() - maxAgeDays * 24 * 60 * 60 * 1000)
      .pickAll() as NoteEntity[],

  connectedData: () => ({
    notes: noteQueries.allDTOs(),
  }),
} as const;
