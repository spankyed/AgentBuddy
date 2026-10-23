// Complete rows for fixtures that make an entity directly: every field its shape requires, as the app's own writes give it
import type { NoteEntity } from '#features/notes/be/types.ts';

/** A new note's row, as the notes repository writes one, with the fields given over it */
export const noteRow = (fields: Partial<Omit<NoteEntity, 'id' | 'entityType' | 'createdAt' | 'updatedAt'>> = {}) => ({
  title: 'Note',
  content: '',
  icon: null,
  noteType: 'document' as const,
  completed: false,
  hideCompletedChildren: false,
  displayOrder: 0,
  lastSeen: 0,
  ...fields,
});
